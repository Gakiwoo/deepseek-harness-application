/**
 * @deepseek-ai/dsh-host-plugin-manager — profile plugin mutation as a Host
 * Remote: install and remove plugins through pnpm in the profile directory,
 * with the CLI's `dsh plugin --profile <name>` semantics — a pre-spawn
 * manifest snapshot, the bundle layer list reconciled from the installed
 * state on success (a dependency resolving to a `dsh.bundle`-declaring
 * package joins the layer stack; a removed or bundle-less dependency leaves
 * it), and the snapshot restored on failure so a pnpm error cannot leave the
 * profile declaring a plugin that never installed. The desktop host boots
 * one profile and pins it into this row's config; the renderer settings
 * surface calls the Remote to change that profile's plugins.
 * @module @deepseek-ai/dsh-host-plugin-manager
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type { PluginMutationResult, ProfileBundleName } from './types.ts'

export type * from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'plugin-manager'

/** The profile mutated when the composition pins none. */
export const DEFAULT_MANAGED_PROFILE = 'desktop'

/** Exit code reported when pnpm itself is missing from PATH. */
export const PNPM_NOT_FOUND_EXIT = 127

/** Plugin config: the managed profile and its home. */
export interface Config {
  /** The profile name to mutate; the desktop host pins the profile it boots. */
  profile: string
  /** Harness home (tests inject a temp dir; a deployment leaves it resolved). */
  home?: string
}

/** One settled pnpm run: exit code plus captured output. */
interface PnpmRun {
  exitCode: number
  stdout: string
  stderr: string
}

/** Profile plugin mutation Remote: install and remove through pnpm. */
export class PluginManagerGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    profile: z.string().default(DEFAULT_MANAGED_PROFILE),
    home: z.string(),
  })

  private readonly profile: string
  private readonly home: string | undefined

  /** This package anchors bundle resolution for in-box packages. */
  private readonly installAnchor = createRequire(import.meta.url).resolve(
    '@deepseek-ai/dsh-host-plugin-manager/package.json',
  )

  constructor(ctx: Context, config: Config) {
    super(ctx, 'pluginManager')
    this.profile = config.profile
    this.home = config.home
  }

  /**
   * Install a plugin into the managed profile. The profile is initialized on
   * first use; pnpm runs in its directory with the pre-spawn manifest
   * snapshot sealed into the layer list on success and restored on failure.
   * @param spec - the pnpm add spec (registry name, git, path, or alias).
   * @returns the settled mutation outcome.
   */
  @Remote('install')
  async install(spec: string): Promise<PluginMutationResult> {
    return this.mutate(['add', ...anchorPathSpec(spec)])
  }

  /**
   * Remove a plugin from the managed profile; the layer list drops it once
   * pnpm no longer installs a `dsh.bundle`-declaring package under its name.
   * @param packageName - the installed dependency name.
   * @returns the settled mutation outcome.
   */
  @Remote('remove')
  async remove(packageName: string): Promise<PluginMutationResult> {
    return this.mutate(['remove', packageName])
  }

  /** Run one pnpm mutation with snapshot-on-failure and reconcile-on-success. */
  private async mutate(args: readonly string[]): Promise<PluginMutationResult> {
    const profileDir = resolveProfileDir(this.profile, this.home ?? resolveDshHome())
    if (!existsSync(join(profileDir, 'package.json'))) {
      initProfile(profileDir, PROFILE_TEMPLATES[this.profile] ?? DEFAULT_PROFILE_BUNDLES)
    }
    const before = readProfileManifest(name, profileDir)
    let run: PnpmRun
    try {
      run = await runPnpm(args, profileDir)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return {
          ok: false,
          exitCode: PNPM_NOT_FOUND_EXIT,
          stdout: '',
          stderr: 'pnpm not found on PATH — install pnpm to manage profile plugins',
          bundles: profileBundles(before),
        }
      }
      throw error
    }
    if (run.exitCode !== 0) {
      // A failed pnpm run may have written the dependency into the manifest
      // before failing (registry 404, blocked build script); the snapshot is
      // restored so the profile never declares a plugin that did not install.
      writeProfileManifest(profileDir, before)
      return {
        ok: false,
        exitCode: run.exitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        bundles: profileBundles(before),
      }
    }
    reconcilePlugins(before, profileDir, this.installAnchor)
    return {
      ok: true,
      exitCode: 0,
      stdout: run.stdout,
      stderr: run.stderr,
      bundles: profileBundles(readProfileManifest(name, profileDir)),
    }
  }
}

/** The bundle layer list of a profile manifest. */
function profileBundles(manifest: ProfileManifest): ProfileBundleName[] {
  return (manifest.dsh?.profile?.bundles ?? []) as ProfileBundleName[]
}

/**
 * Whether a resolved dependency exports a profile patch, i.e. is a bundle.
 * @param packageName - the dependency's package name.
 * @param profileDir - the profile directory (resolution anchor).
 * @param installAnchor - this package's manifest, the in-box resolution anchor.
 * @returns true when the package manifest declares `dsh.bundle`.
 */
function exportsPatch(packageName: string, profileDir: string, installAnchor: string): boolean {
  let dir: string
  try {
    dir = resolveBundleDir(name, packageName, installAnchor, profileDir)
  } catch {
    return false // pnpm reported success yet the package is unresolvable — treat as plain
  }
  const manifest = readProfileManifest(name, dir)
  return manifest.dsh?.bundle?.patch !== undefined
}

/**
 * Reconcile `dsh.profile.bundles` against the installed state: pnpm has
 * already written the real installed names (so a git/path/tarball/alias spec
 * on the command line reconciles by its true package name) and materialized
 * the packages. A dependency that resolves to a `dsh.bundle`-declaring
 * package joins the layer stack (appended in dependency order); a
 * dependency-listed name that no longer does — removed, or the installed
 * version dropped the declaration — leaves it. In-box bundles from the
 * profile template are not dependencies and are never touched. Warns once
 * per newly-added bundle-less dependency (a plain library is fine; the
 * warning is orientation).
 */
function reconcilePlugins(before: ProfileManifest, profileDir: string, installAnchor: string): void {
  const after = readProfileManifest(name, profileDir)
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const dependencies = Object.keys(after.dependencies ?? {})
  const plugins = after.dsh?.profile?.bundles ?? []
  let changed = false
  for (const packageName of dependencies) {
    const isBundle = exportsPatch(packageName, profileDir, installAnchor)
    if (isBundle && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    } else if (!isBundle && !beforeDeps.has(packageName)) {
      process.stderr.write(
        `${name}: warning: ${packageName} declares no dsh.bundle — installed as a plain dependency, not a profile layer `
        + '(a later update that gains one activates it automatically)\n',
      )
    }
  }
  const dependencySet = new Set(dependencies)
  for (const packageName of [...plugins]) {
    // Only dependency-managed entries are subject to removal; template
    // bundles (dsh-base and friends) are not dependencies.
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, profileDir, installAnchor)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return
  after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles: plugins } }
  writeProfileManifest(profileDir, after)
}

/**
 * Rewrite a relative filesystem spec against the process working directory.
 * pnpm runs with cwd = the profile directory, so a bare `.` or `../plugin`
 * (or their `file:`/`link:` forms) would silently resolve inside the profile
 * — `add .` from a plugin checkout would self-link the profile. Absolute
 * specs, registry names, and every other pnpm argument pass through
 * untouched.
 * @param argument - one pnpm argument, verbatim from the Remote call.
 * @returns the argument with a relative path spec anchored to the cwd.
 */
function anchorPathSpec(argument: string): readonly string[] {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return [argument]
  // A bare path stays bare and a prefixed spec keeps its prefix: pnpm's
  // link-vs-copy semantics differ between `file:` and a plain directory
  // path, and the anchor must not change which one the caller asked for.
  const prefix = match.groups.prefix ?? ''
  return [`${prefix}${resolve(process.cwd(), match.groups.path)}`]
}

/**
 * Run pnpm with captured output. Windows resolves pnpm through its .cmd
 * shim, which spawn() refuses without a shell since the CVE-2024-27980
 * hardening.
 * @param args - the pnpm arguments.
 * @param cwd - the profile directory.
 * @returns the settled exit code and captured output.
 */
function runPnpm(args: readonly string[], cwd: string): Promise<PnpmRun> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('pnpm', args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => { resolvePromise({ exitCode: code ?? 1, stdout, stderr }) })
  })
}

export default PluginManagerGateway

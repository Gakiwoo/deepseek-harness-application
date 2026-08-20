/**
 * Electron-free desktop profile boot: the desktop shell (apps/desktop) imports
 * this from the packaged host closure so the shell and the plugin tree share
 * one cordis instance. Mirrors the CLI profile boot minus argv/signal concerns
 * (the Electron main owns lifecycle and process exit).
 * @module @deepseek-ai/dsh-desktop-app/host-boot
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  watchUserPatches,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { assertDesktopTree } from './invariant.ts'
import type { DesktopRuntime } from './index.ts'

/** Launcher identity: the desktop profile boot's diagnostic prefix. */
const NAME = 'dsh-desktop'

/** Shipped agent-preset root: beside this package's own config, in both source and deployed layouts. */
const SHIPPED_PRESET_ROOT = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))

/** The empty root entry list every desktop profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh-desktop profile root — an empty entry list; the tree is composed as patches.
[]
`

/** Options for {@link bootDesktopHost}. */
export interface BootDesktopHostOptions {
  /** Harness home (tests inject a temp dir; the shell passes the real one). */
  home?: string
  /** Absolute path of the frontend index.html (surfaced via desktopRuntime). */
  frontendIndexPath: string
  /** Exit request sink wired to the shell's quit path. */
  requestExit?: (code: number) => void
}

/** Settled desktop host handle: the runtime face plus bounded disposal. */
export interface DesktopHostHandle {
  /** The settled root context. */
  ctx: Context
  /** desktopRuntime service face (fetch carrier + manifest + paths). */
  runtime: DesktopRuntime
  /** Dispose the tree; resolves when the fiber is gone. */
  dispose(): Promise<void>
}

/**
 * Boot the desktop profile end to end: heal the profiles module fallback,
 * compose bundle + user patch layers, mount the tree, and settle. The runtime
 * overlay pins `desktop-runtime`'s frontend index to the shell's resources
 * dir, so the IPC pump and dsh:// protocol resolve the served artifacts.
 * @param options - home, frontend path, exit sink.
 * @returns the settled handle.
 */
export async function bootDesktopHost(options: BootDesktopHostOptions): Promise<DesktopHostHandle> {
  const home = options.home ?? resolveDshHome()
  const require = createRequire(import.meta.url)
  const installAnchor = require.resolve('@deepseek-ai/dsh-desktop-app/package.json')
  healProfilesModuleFallback(installAnchor, home)
  const profile = loadProfile(NAME, 'desktop', installAnchor, home)
  writeFileSync(join(profile.dir, 'cordis.yml'), PROFILE_ROOT_CONFIG)
  const homePatches = loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  // Pin the frontend index on the desktop-runtime row when the composition
  // carries it (the shipped desktop patch always does); a custom profile that
  // dropped the row gets no overlay and desktopRuntime.frontendIndex() then
  // resolves its config default.
  const hasRuntimeRow = composeEntries([bundlePatches, profile.patches, homePatches])
    .some(row => row.id === 'desktop-runtime')
  const runtimeOverlay = hasRuntimeRow
    ? [{ id: 'desktop-runtime', config: { frontendIndex: options.frontendIndexPath } } satisfies PatchOptions]
    : []
  // The SHIPPED preset root is the part of the roster only this launcher can
  // resolve: it sits beside this package's own config, in both the source and
  // the deployed closure layouts. The writable root the roster appends is
  // `dsh-agent-presets`' own (`includeUserRoot`), so a composition that never
  // reaches this overlay still finds a person's presets.
  const presetRow = composeEntries([bundlePatches, profile.patches, homePatches])
    .find(row => row.id === 'agent-presets')
  const presetOverlay: PatchOptions[] = presetRow !== undefined
    ? [{
      id: 'agent-presets',
      config: {
        ...(presetRow.config ?? {}) as Record<string, unknown>,
        roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }],
      },
    } satisfies PatchOptions]
    : []
  // Recomposition for the live user layers: bundle layers below, the profile's
  // own layer, the home layer, then the runtime overlay, so a user edit can
  // never displace them. Fresh clones per generation keep the include from
  // aliasing patch objects across applications (same rationale as the CLI).
  const composeLive = (): PatchOptions[] => structuredClone([
    ...bundlePatches,
    ...loadOptionalPatches(NAME, profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? [],
    ...presetOverlay,
    ...runtimeOverlay,
  ])
  const ctx = await boot(NAME, join(profile.dir, 'cordis.yml'), structuredClone([
    ...bundlePatches,
    ...profile.patches,
    ...homePatches,
    ...presetOverlay,
    ...runtimeOverlay,
  ]), (hostCtx) => {
    // Before any config-tree entry mounts, so plugins resolve all launch-time
    // environment values from the same immutable provenance snapshot.
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME))
    // The bounded exit request is a launcher fact available to every app
    // plugin that injects the argument snapshot.
    provideCmdline(hostCtx, { args: [], exit: code =>  options.requestExit?.(code) })
  })
  assertDesktopTree(ctx)
  const runtime = ctx.desktopRuntime
  // Config-only HMR for the live profile patch layer: the desktop bundle
  // disables the shared module-reload `hmr` row (same as web), so when the
  // composition leaves no HMR service, mount a watch-only instance with no
  // module roots — cordis.patch.yml edits stay live. A silent skip would break
  // the documented hot-reload contract. HMR injects the timer service, which a
  // bare custom profile may not mount either.
  if (ctx.get('loader') !== undefined && ctx.fiber.state === FiberState.ACTIVE) {
    try {
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) {
          await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
        }
        await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-hmr', config: { root: [] } })
      }
      await watchUserPatches(ctx, { binName: NAME, filename: profile.patchPath, compose: composeLive })
      await watchUserPatches(ctx, { binName: NAME, filename: join(home, PROFILE_PATCH_FILENAME), compose: composeLive })
    } catch (error) {
      // A surface can dispose the whole tree during setup (early quit); a
      // loader-less tree is one that exited exactly as asked.
      if (ctx.get('loader') !== undefined) throw error
    }
  }
  return {
    ctx,
    runtime,
    dispose: async () => { await ctx.fiber.dispose() },
  }
}

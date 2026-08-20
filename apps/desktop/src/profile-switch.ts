/**
 * Profile switching for the desktop shell.
 *
 * A profile is a directory under `$DSH_HOME/profiles/<name>` holding a
 * `package.json` with `dsh.profile.bundles` (the same layout the CLI's
 * `dsh plugin --profile <name>` maintains). Selecting a profile writes a
 * pending marker and relaunches; the next boot boots the marker's profile,
 * and last-known-good recovery reuses the startup-state file: a stale
 * pending launch record left by a switch that never reached readiness
 * reverts to the profile the app ran as when the switch was requested. The
 * marker is best-effort: malformed or missing markers are treated as
 * desktop (the shipped profile) and never block startup.
 */

import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StartupState } from './startup-state.ts'

/** The bundle whose patch rows compose the desktop tree (desktopRuntime, clientModules, apiProxy). */
export const DESKTOP_APP_BUNDLE = '@deepseek-ai/dsh-desktop-app'

/** The pending-switch marker filename under the Electron user data dir. */
export const PENDING_PROFILE_FILENAME = 'pending-profile.json'

/** The shipped profile the desktop app boots when no record says otherwise. */
export const DEFAULT_DESKTOP_PROFILE = 'desktop'

/** One selectable profile, as resolved from the Harness home. */
export interface DesktopProfile {
  /** The profile directory name. */
  name: string
  /** The profile's `dsh.profile.bundles` layer list. */
  bundles: readonly string[]
  /** Whether the bundles compose the desktop tree; non-bootable profiles are selectable only when current. */
  bootable: boolean
  /** Whether this is the profile the app is running as. */
  current: boolean
}

/** The persisted pending-switch marker. */
export interface PendingProfile {
  /** The profile to boot on the next launch. */
  name: string
  /** The profile the app ran as when the switch was requested; the revert target. */
  from: string
  /** When the switch was requested. */
  at: number
}

/** The boot profile decision from the pending marker and startup state. */
export interface ResolveBootProfileResult {
  /** The profile the next launch boots. */
  profile: string
  /** The failed switch the app reverted from, when the previous launch never reached readiness. */
  reverted?: PendingProfile
}

/**
 * Enumerate the profiles under the Harness home that the desktop app can
 * select from. The current profile always appears even when its directory is
 * missing; profiles without a valid manifest are skipped; the `node_modules`
 * module fallback sibling is never a profile. Order: current first, then
 * desktop-bootable, then name.
 * @param home - the Harness home (as resolved by `resolveDshHome`).
 * @param currentProfile - the profile the app is running as.
 * @returns the selectable profiles.
 */
export function listDesktopProfiles(home: string, currentProfile: string): DesktopProfile[] {
  const profilesDir = join(home, 'profiles')
  const profiles: DesktopProfile[] = []
  const seen = new Set<string>()
  for (const name of readProfileNames(profilesDir)) {
    const bundles = readProfileBundles(join(profilesDir, name))
    if (bundles === undefined) continue
    profiles.push({
      name,
      bundles,
      bootable: bundles.includes(DESKTOP_APP_BUNDLE),
      current: name === currentProfile,
    })
    seen.add(name)
  }
  if (!seen.has(currentProfile)) {
    profiles.push({ name: currentProfile, bundles: [], bootable: false, current: true })
  }
  return profiles.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    if (a.bootable !== b.bootable) return a.bootable ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}

/**
 * Persist a pending switch: the next launch boots `name`; a failure to reach
 * readiness reverts to `from`.
 * @param userDataDir - the Electron user data dir.
 * @param name - the profile to boot next.
 * @param from - the profile the app runs as now.
 * @param at - when the switch was requested.
 */
export function writePendingProfile(userDataDir: string, name: string, from: string, at: number = Date.now()): void {
  const file = join(userDataDir, PENDING_PROFILE_FILENAME)
  const tmpFile = `${file}.tmp`
  writeFileSync(tmpFile, `${JSON.stringify({ name, from, at }, null, 2)}\n`)
  renameSync(tmpFile, file)
}

/**
 * Read the pending switch marker; missing or malformed markers are treated
 * as no switch.
 * @param userDataDir - the Electron user data dir.
 * @returns the pending switch, when one exists.
 */
export function readPendingProfile(userDataDir: string): PendingProfile | undefined {
  const file = join(userDataDir, PENDING_PROFILE_FILENAME)
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PendingProfile>
    if (typeof parsed.name !== 'string' || typeof parsed.from !== 'string' || typeof parsed.at !== 'number') {
      return undefined
    }
    return { name: parsed.name, from: parsed.from, at: parsed.at }
  } catch {
    return undefined
  }
}

/** Remove the pending switch marker, if any. */
export function clearPendingProfile(userDataDir: string): void {
  rmSync(join(userDataDir, PENDING_PROFILE_FILENAME), { force: true })
}

/**
 * Decide which profile the next launch boots. A pending marker with a stale
 * pending launch record means the switched launch never reached readiness:
 * the marker is consumed and the launch reverts to the marker's `from`
 * profile. A pending marker alone boots the marker's profile (the marker
 * stays until the launch commits). Without a marker, the last launch that
 * reached readiness (or the shipped desktop profile) boots.
 * @param userDataDir - the Electron user data dir.
 * @param state - the startup state as read by {@link readStartupState}.
 * @returns the boot profile and the failed switch, when reverted.
 */
export function resolveBootProfile(userDataDir: string, state: StartupState): ResolveBootProfileResult {
  const pending = readPendingProfile(userDataDir)
  if (pending !== undefined && state.pending !== undefined) {
    clearPendingProfile(userDataDir)
    return { profile: pending.from, reverted: pending }
  }
  if (pending !== undefined) return { profile: pending.name }
  return { profile: state.lastGood?.profile ?? DEFAULT_DESKTOP_PROFILE }
}

/** Profile directory names under the profiles dir, minus the module fallback sibling. */
function readProfileNames(profilesDir: string): string[] {
  try {
    return readdirSync(profilesDir).filter(name => name !== 'node_modules')
  } catch {
    return []
  }
}

/** Read a profile's `dsh.profile.bundles` layer list; invalid manifests are skipped. */
function readProfileBundles(profileDir: string): readonly string[] | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
    }
    const bundles = manifest.dsh?.profile?.bundles
    if (!Array.isArray(bundles) || bundles.some(bundle => typeof bundle !== 'string')) return undefined
    return bundles as string[]
  } catch {
    return undefined
  }
}

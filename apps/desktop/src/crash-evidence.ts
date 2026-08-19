/**
 * Crash evidence for the desktop shell.
 *
 * Before the failure path runs, a timestamped JSON snapshot lands under the
 * Harness home diagnostics directory (`$DSH_HOME/diagnostics`, default
 * `~/.dsh/diagnostics`), carrying the failure reason, error detail, runtime
 * versions, and the environment facts that diagnose startup and PATH
 * failures. The snapshot never captures credentials: PATH and the resolved
 * homes are the only environment values included.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** The environment facts shared by crash snapshots and diagnostics exports. */
export interface EnvironmentFacts {
  /** The packaged application version. */
  appVersion: string
  /** Electron version, absent in non-Electron runtimes. */
  electronVersion?: string
  /** Chromium version, absent in non-Electron runtimes. */
  chromeVersion?: string
  /** Node.js version. */
  nodeVersion: string
  /** Operating system platform. */
  platform: string
  /** CPU architecture. */
  arch: string
  /** Whether the launch ran from a packaged application. */
  packaged: boolean
  /** Process uptime in milliseconds at collection. */
  uptimeMs: number
  /** Operating-system home directory. */
  home: string
  /** The resolved Harness home, `$DSH_HOME` or `~/.dsh`. */
  dshHome: string
  /** The process PATH at collection. */
  path: string
}

/** Inputs for collecting environment facts. */
export interface EnvironmentFactsOptions {
  /** The packaged application version. */
  appVersion: string
  /** Operating system platform. */
  platform: NodeJS.Platform
  /** CPU architecture. */
  arch: string
  /** Whether the launch ran from a packaged application. */
  packaged: boolean
  /** Environment mapping used for the facts and Harness home resolution. */
  env: Record<string, string | undefined>
  /** Runtime versions; defaults to the current process. */
  versions?: NodeJS.ProcessVersions
  /** Process uptime in milliseconds; defaults to the current process. */
  uptimeMs?: number
}

/**
 * Collect the environment facts shared by crash snapshots and diagnostics
 * exports. Credential-shaped environment names are never read: PATH, the OS
 * home, and the resolved Harness home are the only environment facts.
 */
export function collectEnvironmentFacts(options: EnvironmentFactsOptions): EnvironmentFacts {
  // Electron augments ProcessVersions with electron/chrome, which plain Node
  // runtimes lack; the indexed view keeps both optional.
  const runtime: Record<string, string | undefined> = options.versions ?? process.versions
  return {
    appVersion: options.appVersion,
    ...(runtime.electron !== undefined ? { electronVersion: runtime.electron } : {}),
    ...(runtime.chrome !== undefined ? { chromeVersion: runtime.chrome } : {}),
    nodeVersion: runtime.node ?? '',
    platform: options.platform,
    arch: options.arch,
    packaged: options.packaged,
    uptimeMs: options.uptimeMs ?? Math.round(process.uptime() * 1000),
    home: homedir(),
    dshHome: resolveDshHome(undefined, options.env),
    path: options.env.PATH ?? '',
  }
}

/** One crash snapshot, written as JSON. */
export interface CrashEvidence extends EnvironmentFacts {
  /** ISO timestamp of the snapshot. */
  at: string
  /** Failure category, e.g. `Unexpected failure` or `renderer crashed`. */
  reason: string
  /** Error stack or message, when one exists. */
  detail?: string
}

/** Inputs for building a crash snapshot. */
export interface BuildCrashEvidenceOptions extends EnvironmentFactsOptions {
  /** Failure category, e.g. `Unexpected failure` or `renderer crashed`. */
  reason: string
  /** Error stack or message, when one exists. */
  detail?: string
}

/**
 * Build a crash snapshot from the failure facts.
 */
export function buildCrashEvidence(options: BuildCrashEvidenceOptions): CrashEvidence {
  return {
    at: new Date().toISOString(),
    reason: options.reason,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
    ...collectEnvironmentFacts(options),
  }
}

/**
 * The diagnostics directory for a Harness home: `diagnostics` directly under
 * the home root.
 */
export function crashEvidenceDir(env: Record<string, string | undefined> = process.env): string {
  return join(resolveDshHome(undefined, env), 'diagnostics')
}

/**
 * Persist one snapshot as JSON under the diagnostics directory, creating it
 * as needed. The timestamp is embedded in the file name so snapshots never
 * overwrite each other.
 * @param dir - The diagnostics directory.
 * @param evidence - The snapshot to persist.
 * @returns the written file path.
 */
export function writeCrashEvidence(dir: string, evidence: CrashEvidence): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `crash-${evidence.at.replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`)
  return file
}

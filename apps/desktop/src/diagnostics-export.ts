/**
 * Diagnostics export for the desktop shell.
 *
 * One archive the user can attach to an issue: the crash evidence under
 * `$DSH_HOME/diagnostics`, the session logs under `$DSH_HOME/sessions`, and
 * an environment-facts JSON. The archive lands at
 * `$DSH_HOME/exports/diagnostics-<timestamp>.tar.gz`, compressed with the
 * platform `tar` (bsdtar ships on macOS, Linux, and Windows 10+), so the
 * shell needs no archive dependency.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { collectEnvironmentFacts, type EnvironmentFacts, type EnvironmentFactsOptions } from './crash-evidence.ts'

/** The archive members under the Harness home. */
const ARCHIVE_MEMBERS = ['diagnostics', 'sessions']

/** The spawn surface used for the archive; the default spawns the platform tar. */
export type ArchiveSpawn = (argv: readonly string[]) => ChildProcess

/**
 * The exports directory for a Harness home: `exports` directly under the
 * home root, sibling to the diagnostics directory so an archive never
 * includes an earlier archive.
 */
export function diagnosticsExportDir(env: Record<string, string | undefined> = process.env): string {
  return join(resolveDshHome(undefined, env), 'exports')
}

/**
 * Collect the facts record that ships inside every archive. Reuses the crash
 * evidence facts and adds the session-log directory listing.
 * @param options - Fact collection inputs.
 * @param sessionsDir - The session-log root, listed into the facts.
 * @returns the facts record.
 */
export function collectDiagnosticsFacts(
  options: EnvironmentFactsOptions,
  sessionsDir: string,
): EnvironmentFacts & { sessionLogs: string[] } {
  return {
    ...collectEnvironmentFacts(options),
    sessionLogs: listSessionLogs(sessionsDir),
  }
}

/**
 * Create the diagnostics archive under the Harness home exports directory.
 * The facts file is staged into the diagnostics directory first, so the
 * archive always carries at least one member; existing members only are
 * archived, and a missing sessions directory is tolerated.
 * @param home - The resolved Harness home.
 * @param facts - The facts record to ship in the archive.
 * @param spawnChild - Injectable spawn for tests.
 * @returns the archive path.
 */
export async function exportDiagnosticsArchive(
  home: string,
  facts: EnvironmentFacts & { sessionLogs: string[] },
  spawnChild: ArchiveSpawn = argv => spawn('tar', argv, { stdio: ['ignore', 'pipe', 'ignore'] }),
): Promise<string> {
  const diagnosticsDir = join(home, 'diagnostics')
  mkdirSync(diagnosticsDir, { recursive: true })
  writeFileSync(join(diagnosticsDir, 'export-facts.json'), `${JSON.stringify(facts, null, 2)}\n`)

  const members = ARCHIVE_MEMBERS.filter(member => existsSync(join(home, member)))
  const outputDir = join(home, 'exports')
  mkdirSync(outputDir, { recursive: true })
  const output = join(outputDir, `diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`)
  const code = await waitForExit(spawnChild(['-czf', output, '-C', home, ...members]))
  if (code !== 0) {
    throw new Error(`tar exited with code ${String(code)} while creating the diagnostics archive`)
  }
  return output
}

/** Resolve the child's exit code, rejecting on a spawn error. */
function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on('error', (error) => { reject(error) })
    child.on('close', (code) => { resolve(code) })
  })
}

/** List the session-log files under the root, tolerating absence. */
function listSessionLogs(root: string): string[] {
  if (!existsSync(root)) return []
  try {
    return readdirSync(root, { recursive: true, encoding: 'utf8' }).sort()
  } catch {
    // An unreadable session root must not fail the whole export; the listing
    // is informational.
    return []
  }
}

/**
 * Startup rollback state for the desktop shell.
 *
 * A small JSON state file under Electron user data records the launch as
 * pending before boot and promotes it to lastGood only after the renderer
 * loads. A stale pending on the next launch means the previous run never
 * reached readiness; callers use that to tell the user a recovery happened.
 * The marker is best-effort: malformed or missing state is treated as clean
 * and never blocks startup.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

/** One launch record: the launch id, when it began, and the booted profile. */
interface StartupRecord {
  launchId: string
  at: number
  /** The profile this launch booted; absent on records written before profile switching. */
  profile?: string
}

/** The persisted startup marker. */
export interface StartupState {
  lastGood?: StartupRecord
  pending?: StartupRecord
}

/** The outcome of recording a new pending launch. */
export interface BeginStartupResult {
  /** Whether the previous launch ended before committing. */
  recovered: boolean
  /** The previous launch's pending record, when recovered. */
  previousAttempt?: StartupRecord
}

/**
 * Record a launch as pending and report whether the previous launch left a
 * stale pending (it never committed). The previous state is preserved so a
 * subsequent commit records this launch as last good.
 */
export function beginStartup(
  stateFile: string,
  launchId: string = randomUUID(),
  at: number = Date.now(),
  profile?: string,
): BeginStartupResult {
  const state = readStartupState(stateFile)
  const recovered = state.pending !== undefined && state.pending.launchId !== launchId
  writeStartupState(stateFile, { lastGood: state.lastGood, pending: { launchId, at, ...(profile !== undefined ? { profile } : {}) } })
  if (recovered) return { recovered, previousAttempt: state.pending }
  return { recovered }
}

/**
 * Promote the pending launch to lastGood. Idempotent: without a pending
 * record the previous lastGood is kept, so a double commit is harmless.
 */
export function commitStartup(stateFile: string): void {
  const state = readStartupState(stateFile)
  if (state.pending === undefined) return
  writeStartupState(stateFile, { lastGood: state.pending })
}

/** Read and validate the state file; missing or malformed content is clean state. */
export function readStartupState(stateFile: string): StartupState {
  if (!existsSync(stateFile)) return {}
  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as Partial<StartupState>
    return {
      ...(isStartupRecord(parsed.lastGood) ? { lastGood: parsed.lastGood } : {}),
      ...(isStartupRecord(parsed.pending) ? { pending: parsed.pending } : {}),
    }
  } catch {
    // A corrupted or unreadable marker is treated as clean: the marker is
    // best-effort and must never block startup.
    return {}
  }
}

/** Atomically persist the state via a sibling temp file. */
export function writeStartupState(stateFile: string, state: StartupState): void {
  const tmpFile = `${stateFile}.tmp`
  writeFileSync(tmpFile, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(tmpFile, stateFile)
}

function isStartupRecord(value: unknown): value is StartupRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<StartupRecord>
  return typeof record.launchId === 'string' && typeof record.at === 'number'
    && (record.profile === undefined || typeof record.profile === 'string')
}

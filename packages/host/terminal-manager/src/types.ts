import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque id of one user-owned interactive terminal session. */
export type TerminalSessionId = Branded<'TerminalSessionId'>

/** Spawn request: initial window size and optional working directory. */
export interface TerminalSpawnRequest {
  /** Initial row count of the terminal window. */
  rows: number
  /** Initial column count of the terminal window. */
  cols: number
  /** Working directory of the shell; defaults to the user's home. */
  cwd?: string
}

/** Spawn result: the session id and the spawned shell pid. */
export interface TerminalSpawnResult {
  /** Opaque session id for all later session verbs. */
  sessionId: TerminalSessionId
  /** Top-level shell process id. */
  pid: number
}

/** One incremental read of a session's output. */
export interface TerminalReadResult {
  /** Output text since the previous read; the whole retained tail when truncated. */
  delta: string
  /** True when output was dropped from the bounded scrollback. */
  truncated: boolean
  /** True when the shell process has exited; no further output will arrive. */
  exited: boolean
}

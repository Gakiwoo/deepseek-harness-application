/**
 * Terminal session controller: spawns the user shell, bridges xterm input and
 * output deltas, forwards window resizes, and closes the session. Pure of DOM
 * and xterm imports — the page entry adapts an xterm Terminal, tests inject
 * fakes.
 * @module terminal/session
 */

import type { TerminalRpc } from './bridge.ts'

/** The xterm surface the controller needs. */
export interface TerminalPane {
  /** Current terminal row count. */
  readonly rows: number
  /** Current terminal column count. */
  readonly cols: number
  /** Append output text to the visible terminal. */
  write(data: string): void
  /**
   * Subscribe to user keystrokes (already converted to terminal input bytes).
   * @returns the unsubscribe function.
   */
  onData(listener: (data: string) => void): () => void
  /**
   * Subscribe to window-size changes in terminal cells.
   * @returns the unsubscribe function.
   */
  onResize(listener: (cols: number, rows: number) => void): () => void
  /** Remove listeners and release terminal resources. */
  dispose(): void
}

/** Polling schedule of the output read loop. */
export interface TerminalSessionOptions {
  /** Output read interval in milliseconds. */
  pollMs?: number
}

const DEFAULT_POLL_MS = 50

/** One live session: its RPC verbs, poll timer, and close-once fact. */
export interface TerminalSession {
  /** The spawned shell's process id, once spawn settled. */
  pid: number
  /** Stop polling and close the session; idempotent. */
  close(): Promise<void>
}

/**
 * Spawn the shell and bridge the pane until the shell exits or close() is called.
 * @param pane - the terminal surface.
 * @param rpc - the terminalManager Remote client.
 * @param options - polling schedule.
 * @returns the live session handle.
 */
export async function startTerminalSession(
  pane: TerminalPane,
  rpc: TerminalRpc,
  options: TerminalSessionOptions = {},
): Promise<TerminalSession> {
  const spawned = await rpc.spawn(pane.rows, pane.cols)
  let closed = false
  let exited = false
  let timer: ReturnType<typeof setInterval> | undefined

  const stopPolling = (): void => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  const detach = pane.onData((data) => { void rpc.write(spawned.sessionId, data) })
  const detachResize = pane.onResize((cols, rows) => { void rpc.resize(spawned.sessionId, rows, cols) })

  const poll = async (): Promise<void> => {
    if (closed || exited) return
    try {
      const read = await rpc.read(spawned.sessionId)
      if (read.delta.length > 0) pane.write(read.delta)
      if (read.exited) {
        exited = true
        stopPolling()
        detach()
        detachResize()
        pane.dispose()
      }
    } catch {
      // A transient read failure is retried on the next tick; the shell may
      // have exited between polls.
    }
  }
  timer = setInterval(() => { void poll() }, options.pollMs ?? DEFAULT_POLL_MS)

  return {
    pid: spawned.pid,
    async close() {
      if (closed) return
      closed = true
      stopPolling()
      detach()
      detachResize()
      try {
        await rpc.close(spawned.sessionId)
      } finally {
        pane.dispose()
      }
    },
  }
}

/**
 * Terminal page RPC bridge: the terminalManager Host Remotes over the desktop
 * IPC fetch carrier. The page owns this client because it is a standalone
 * document, not a Cordis client assembly: it mints RPC ids, wraps the wire
 * envelope exactly like the shared connection caller, and unwraps the Remote
 * result verdict.
 * @module terminal/bridge
 */

import { RpcId, serverResponseSchema, type ClientRequest } from '@deepseek-ai/dsh-host-apiproxy/api'

/** One signal the user shell's foreground group accepts. */
export type TerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL' | 'SIGTSTP' | 'SIGHUP'

/** Spawn result: the opaque session id and the shell pid. */
export interface TerminalSpawnResult {
  readonly sessionId: string
  readonly pid: number
}

/** One incremental output read. */
export interface TerminalReadResult {
  readonly delta: string
  readonly truncated: boolean
  readonly exited: boolean
}

/** Typed terminalManager Remote surface used by the terminal page. */
export interface TerminalRpc {
  spawn(rows: number, cols: number, cwd?: string): Promise<TerminalSpawnResult>
  write(sessionId: string, data: string): Promise<void>
  read(sessionId: string): Promise<TerminalReadResult>
  resize(sessionId: string, rows: number, cols: number): Promise<void>
  signal(sessionId: string, signal: TerminalSignal): Promise<void>
  close(sessionId: string): Promise<void>
}

/**
 * Build the typed bridge over one fetch-shaped transport.
 * @param fetcher - the page's fetch carrier (desktop IPC carrier in the desktop build).
 * @returns the typed terminalManager client.
 */
export function createTerminalRpc(fetcher: (input: URL, init?: RequestInit) => Promise<Response>): TerminalRpc {
  const call = async <T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
    const rpcId = RpcId(crypto.randomUUID())
    const message: ClientRequest = {
      type: 'client-request',
      rpcId,
      method,
      payload: { args },
    }
    const response = await fetcher(new URL(`/api/${method}`, resolveBase()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      ...signal === undefined ? {} : { signal },
    })
    if (!response.ok) {
      throw new Error(`terminal: ${method} failed with HTTP ${response.status}`)
    }
    const full = serverResponseSchema.parse(await response.json())
    if (full.rpcId !== rpcId) {
      throw new Error(`terminal: rpcId mismatch for ${method}`)
    }
    if (!full.result.ok) {
      const error = full.result.error
      throw new Error(`terminal: ${method} rejected: ${typeof error === 'string' ? error : error.message}`)
    }
    return full.result.value as T
  }
  return {
    spawn: (rows, cols, cwd) => call('terminalManager/spawn', { request: { rows, cols, ...cwd === undefined ? {} : { cwd } } }),
    write: (sessionId, data) => call('terminalManager/write', { sessionId, data }),
    read: sessionId => call('terminalManager/read', { sessionId }),
    resize: (sessionId, rows, cols) => call('terminalManager/resize', { sessionId, rows, cols }),
    signal: (sessionId, signal) => call('terminalManager/signal', { sessionId, terminalSignal: signal }),
    close: sessionId => call('terminalManager/close', { sessionId }),
  }
}

/** The page runs on the dsh:// authority in the desktop build; tests have no location. */
function resolveBase(): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  return location?.origin !== undefined && location.origin !== 'null' ? location.origin : 'http://dsh.internal'
}

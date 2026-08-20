/**
 * @deepseek-ai/dsh-host-terminal-manager — user-owned interactive terminals as
 * a Host Remote: spawn the user's shell through the subprocess seam and stream
 * input, output, resizes, signals, and close over typert Remotes. Sessions are
 * user-owned — no agent is minted and no model input is assembled — bounded
 * per-session output scrollback, and terminated when the renderer closes them
 * or the host disposes. The desktop terminal window drives these Remotes
 * directly through the fetch carrier.
 * @module @deepseek-ai/dsh-host-terminal-manager
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import type { SubprocessTerminalSignal } from '@deepseek-ai/dsh-subprocess/types'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  TerminalReadResult,
  TerminalSessionId,
  TerminalSpawnRequest,
  TerminalSpawnResult,
} from './types.ts'

export type * from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'terminal-manager'

/** Plugin config: the user shell, session cleanup grace, and scrollback cap. */
export interface Config {
  /** Shell executable for new sessions; `$SHELL` (Windows: PowerShell) when absent. */
  shellPath?: string
  /** TERM-to-KILL cleanup grace in milliseconds for closed sessions. */
  graceMs?: number
  /** Per-session output scrollback cap in bytes. */
  maxBufferBytes?: number
}

/** One live terminal session: its handle, bounded scrollback, and exit fact. */
interface TerminalSession {
  readonly handle: SubprocessTerminalHandle
  readonly scrollback: SessionScrollback
  readonly decoder: TextDecoder
  exited: boolean
}

/**
 * User-owned interactive terminal Remote: spawn the configured shell through
 * `ctx.subprocess.spawnTerminal` and expose the session over `terminalManager`
 * Remotes. The renderer owns the session lifecycle: it spawns, polls reads,
 * writes input, resizes the window, signals the foreground group, and closes.
 */
export class TerminalManagerGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    shellPath: z.string(),
    graceMs: z.number().default(1000),
    maxBufferBytes: z.number().default(1024 * 1024),
  })

  static inject = ['subprocess']

  private readonly sessions = new Map<TerminalSessionId, TerminalSession>()
  private readonly shellPath: string | undefined
  private readonly graceMs: number
  private readonly maxBufferBytes: number

  constructor(ctx: Context, config: Config) {
    super(ctx, 'terminalManager')
    this.shellPath = config.shellPath
    this.graceMs = config.graceMs ?? 1000
    this.maxBufferBytes = config.maxBufferBytes ?? 1024 * 1024
    ctx.effect(() => () => {
      for (const session of this.sessions.values()) session.handle.terminate()
    })
  }

  /**
   * Spawn a new user shell session.
   * @param request - initial window size; the working directory defaults to the user's home.
   * @returns the session id and the spawned shell pid.
   */
  @Remote('spawn')
  async spawn(request: TerminalSpawnRequest): Promise<TerminalSpawnResult> {
    const handle = await this.ctx.subprocess.spawnTerminal({
      argv: [this.resolveShellPath()],
      cwd: request.cwd ?? homedir(),
      rows: request.rows,
      cols: request.cols,
      graceMs: this.graceMs,
      env: { TERM: 'xterm-256color' },
    })
    const sessionId = randomUUID() as TerminalSessionId
    const session: TerminalSession = {
      handle,
      scrollback: new SessionScrollback(this.maxBufferBytes),
      decoder: new TextDecoder(),
      exited: false,
    }
    handle.output.on('data', (chunk: unknown) => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer)
      session.scrollback.append(session.decoder.decode(bytes, { stream: true }))
    })
    handle.output.once('end', () => {
      session.scrollback.append(session.decoder.decode())
      session.exited = true
    })
    handle.output.once('error', () => {
      session.exited = true
    })
    void handle.done.then(
      () => { session.exited = true },
      () => { session.exited = true },
    )
    this.sessions.set(sessionId, session)
    return { sessionId, pid: handle.pid }
  }

  /**
   * Write input to a session; dropped after the shell exits.
   * @param sessionId - the session to write to.
   * @param data - text to deliver without implicit newline conversion.
   */
  @Remote('write')
  async write(sessionId: TerminalSessionId, data: string): Promise<void> {
    const session = this.requireSession(sessionId)
    if (session.exited) return
    await session.handle.write(data)
  }

  /**
   * Read the output accumulated since the previous read; a truncated read
   * returns the whole retained tail and the caller redraws.
   * @param sessionId - the session to read from.
   * @returns the delta text, the truncation fact, and whether the shell exited.
   */
  @Remote('read')
  read(sessionId: TerminalSessionId): TerminalReadResult {
    const session = this.requireSession(sessionId)
    return { ...session.scrollback.consume(), exited: session.exited }
  }

  /**
   * Resize a session's terminal window; dropped after the shell exits.
   * @param sessionId - the session to resize.
   * @param rows - the new row count.
   * @param cols - the new column count.
   */
  @Remote('resize')
  async resize(sessionId: TerminalSessionId, rows: number, cols: number): Promise<void> {
    const session = this.requireSession(sessionId)
    if (session.exited) return
    await session.handle.resize(cols, rows)
  }

  /**
   * Deliver a signal to a session's foreground process group; dropped after the shell exits.
   * @param sessionId - the session to signal.
   * @param terminalSignal - the permitted terminal signal.
   */
  @Remote('signal')
  async signal(sessionId: TerminalSessionId, terminalSignal: SubprocessTerminalSignal): Promise<void> {
    const session = this.requireSession(sessionId)
    if (session.exited) return
    await session.handle.signalForeground(terminalSignal)
  }

  /**
   * Terminate a session and remove it from the registry.
   * @param sessionId - the session to close.
   */
  @Remote('close')
  async close(sessionId: TerminalSessionId): Promise<void> {
    const session = this.requireSession(sessionId)
    this.sessions.delete(sessionId)
    await session.handle.terminate()
  }

  /** Resolve the session or fail loud at the wire boundary. */
  private requireSession(sessionId: TerminalSessionId): TerminalSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`unknown terminal session: ${sessionId}`)
    return session
  }

  /**
   * Resolve the shell executable for a new session: the configured shell, the
   * ambient `$SHELL`, then the platform default. Windows has no `$SHELL`
   * convention, so PowerShell is the desktop default there.
   */
  private resolveShellPath(): string {
    if (this.shellPath) return this.shellPath
    const ambient = process.env.SHELL
    if (ambient) return ambient
    return process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
  }
}

/** Bounded scrollback with consume-on-read delta semantics. */
class SessionScrollback {
  private text = ''
  private dropped = false

  constructor(private readonly maxBytes: number) {}

  append(text: string): void {
    if (text.length === 0) return
    this.text += text
    if (Buffer.byteLength(this.text) <= this.maxBytes) return
    const tail = utf8Tail(this.text, this.maxBytes)
    this.text = tail.text
    this.dropped = true
  }

  consume(): { delta: string; truncated: boolean } {
    const delta = this.text
    const truncated = this.dropped
    this.text = ''
    this.dropped = false
    return { delta, truncated }
  }
}

/**
 * Trim `text` to a byte-boundary-safe tail: whole code points, never a split
 * surrogate pair or continuation byte.
 * @param text - the text to trim.
 * @param maxBytes - the retained byte cap.
 * @returns the tail and whether bytes were dropped.
 */
function utf8Tail(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let bytes = 0
  let start = chars.length
  while (start > 0) {
    const next = Buffer.byteLength(chars[start - 1] as string)
    if (bytes + next > maxBytes) break
    bytes += next
    start -= 1
  }
  return { text: chars.slice(start).join(''), truncated: true }
}

export default TerminalManagerGateway

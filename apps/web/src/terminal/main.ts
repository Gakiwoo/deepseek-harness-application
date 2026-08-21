/**
 * Terminal page entry: xterm over the terminalManager Remotes, driven through
 * the desktop IPC fetch carrier. The page is desktop-only — without the
 * preload bridge it fails loud in the terminal instead of hanging silently.
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'
import { DesktopApiClient, readDesktopBridge } from '@deepseek-ai/dsh-client-connection/client'
import { createTerminalRpc } from './bridge.ts'
import { startTerminalSession, type TerminalPane } from './session.ts'

const el = document.getElementById('terminal')
if (el === null) throw new Error('terminal page: missing #terminal')

const bridge = readDesktopBridge()
if (bridge === undefined) {
  el.textContent = 'The terminal page runs inside the desktop app; no IPC bridge is present.'
  throw new Error('terminal page: desktop IPC bridge missing')
}

const client = new DesktopApiClient(bridge)
const rpc = createTerminalRpc((input, init) => client.transport(input, init))

const terminal = new Terminal({
  theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
  fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
  fontSize: 13,
  cursorBlink: true,
  scrollback: 5000,
})
const fit = new FitAddon()
terminal.loadAddon(fit)
terminal.open(el)
fit.fit()

const pane: TerminalPane = {
  get rows() { return terminal.rows },
  get cols() { return terminal.cols },
  write: (data) => { terminal.write(data) },
  onData: (listener) => {
    const disposable = terminal.onData(listener)
    return () => { disposable.dispose() }
  },
  // The Terminal resizes after a FitAddon.fit(), so the controller learns the
  // resulting cell size from the terminal's own resize event.
  onResize: (listener) => {
    const disposable = terminal.onResize(({ cols, rows }) => { listener(cols, rows) })
    return () => { disposable.dispose() }
  },
  dispose: () => { terminal.dispose() },
}

void startTerminalSession(pane, rpc).then(
  (session) => {
    // Keep the window size in sync with the host PTY: refit on container
    // changes; the controller forwards the resulting cell size.
    const observer = new ResizeObserver(() => { fit.fit() })
    observer.observe(el)
    // The renderer teardown path closes the session best-effort; the host
    // also reaps sessions on dispose.
    const beforeUnload = (): void => { void session.close() }
    window.addEventListener('beforeunload', beforeUnload)
  },
  (error: unknown) => {
    terminal.write(`\r\n\x1b[31mterminal: could not start the shell\x1b[0m\r\n${error instanceof Error ? error.message : String(error)}\r\n`)
    terminal.dispose()
  },
)

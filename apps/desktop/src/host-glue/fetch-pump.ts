/**
 * Main-process IPC fetch pump: dsh-fetch/request → host /api dispatch →
 * streamed dsh-fetch/response|chunk|end|error. The wire URL's fake authority
 * is rewritten to the loopback literal before dispatch: the /api trust fence
 * (privileged-method pinning) treats IPC as the loopback-equivalent private
 * carrier it is.
 *
 * One pump serves every renderer window: requests and aborts carry their
 * originating webContents (sender routing), and responses stream back to the
 * sender that asked. In-flight requests are keyed per sender, so one window
 * can never abort another's.
 */

import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END, DSH_FETCH_ERROR,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
} from '@deepseek-ai/dsh-client-connection/desktop-bridge'
import type { DesktopFetchWireRequest } from '@deepseek-ai/dsh-client-connection/desktop-bridge'

/** Injectable ipcMain face: each handle listener receives the invoking sender. */
export interface IpcWireRegistrar {
  handle(channel: string, listener: (sender: IpcSender, raw: unknown) => unknown): void
  removeHandler(channel: string): void
}

/** Injectable webContents face. */
export interface IpcSender {
  send(channel: string, message: unknown): void
}

function parseWireRequest(raw: unknown): DesktopFetchWireRequest | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== 'string' || typeof candidate.url !== 'string'
    || typeof candidate.method !== 'string' || typeof candidate.headers !== 'object'
    || candidate.headers === null
    || (candidate.body !== null && typeof candidate.body !== 'string')) return undefined
  return raw as DesktopFetchWireRequest
}

/**
 * Mount the shared pump over every renderer.
 * @param ipc - ipcMain face carrying the invoking sender into each listener.
 * @param fetch - host /api dispatch (desktopRuntime.fetch).
 * @returns disposer aborting every in-flight request and removing handlers.
 */
export function mountFetchPump(
  ipc: IpcWireRegistrar,
  fetch: (request: Request) => Promise<Response>,
): { dispose(): void } {
  const abortsBySender = new Map<IpcSender, Map<string, AbortController>>()

  const abortsFor = (sender: IpcSender): Map<string, AbortController> => {
    let aborts = abortsBySender.get(sender)
    if (aborts === undefined) {
      aborts = new Map()
      abortsBySender.set(sender, aborts)
    }
    return aborts
  }

  ipc.handle(DSH_FETCH_REQUEST, (sender, raw) => {
    const wire = parseWireRequest(raw)
    if (wire === undefined) return { accepted: false }
    const controller = new AbortController()
    abortsFor(sender).set(wire.id, controller)
    void pumpOne(sender, wire, controller.signal, fetch).finally(() => {
      const aborts = abortsFor(sender)
      aborts.delete(wire.id)
      // A sender with no in-flight requests leaves the registry, so destroyed
      // windows do not accumulate entries.
      if (aborts.size === 0) abortsBySender.delete(sender)
    })
    return { accepted: true }
  })
  ipc.handle(DSH_FETCH_ABORT, (sender, raw) => {
    const id = (raw as { id?: unknown } | undefined)?.id
    if (typeof id === 'string') abortsFor(sender).get(id)?.abort()
    return { accepted: true }
  })
  return {
    dispose() {
      for (const aborts of abortsBySender.values()) {
        for (const controller of aborts.values()) controller.abort()
      }
      abortsBySender.clear()
      ipc.removeHandler(DSH_FETCH_REQUEST)
      ipc.removeHandler(DSH_FETCH_ABORT)
    },
  }
}

/** Send one downstream frame, tolerating a renderer that left mid-flight. */
function sendFrame(sender: IpcSender, channel: string, message: unknown): void {
  try {
    sender.send(channel, message)
  } catch {
    // The renderer window was destroyed while the request was in flight; the
    // host dispatch already ran, and there is no one left to deliver to.
  }
}

async function pumpOne(
  sender: IpcSender,
  wire: DesktopFetchWireRequest,
  signal: AbortSignal,
  fetch: (request: Request) => Promise<Response>,
): Promise<void> {
  try {
    // Fake authority → loopback literal: the privileged-method fence pins to
    // loopback, and IPC is loopback-equivalent by construction (a private
    // channel into this very process). Build a fresh URL rather than
    // mutating: dsh:// is a non-standard scheme and protocol/host setters
    // may not apply as expected.
    const parsed = new URL(wire.url)
    const request = new Request(`${parsed.protocol === 'dsh:' ? 'http' : parsed.protocol.slice(0, -1)}://127.0.0.1${parsed.pathname}${parsed.search}`, {
      method: wire.method,
      headers: wire.headers,
      ...wire.body === null ? {} : { body: wire.body },
      signal,
    })
    const response = await fetch(request)
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    sendFrame(sender, DSH_FETCH_RESPONSE, { id: wire.id, status: response.status, headers })
    if (response.body === null) {
      sendFrame(sender, DSH_FETCH_END, { id: wire.id })
      return
    }
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength > 0) sendFrame(sender, DSH_FETCH_CHUNK, { id: wire.id, data: value })
    }
    sendFrame(sender, DSH_FETCH_END, { id: wire.id })
  } catch (error) {
    sendFrame(sender, DSH_FETCH_ERROR, { id: wire.id, message: error instanceof Error ? error.message : String(error) })
  }
}

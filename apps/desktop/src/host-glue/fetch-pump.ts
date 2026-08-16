/**
 * Main-process IPC fetch pump: dsh-fetch/request → host /api dispatch →
 * streamed dsh-fetch/response|chunk|end|error. The wire URL's fake authority
 * is rewritten to the loopback literal before dispatch: the /api trust fence
 * (privileged-method pinning) treats IPC as the loopback-equivalent private
 * carrier it is.
 */

import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END, DSH_FETCH_ERROR,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
} from '@deepseek-ai/dsh-client-connection/desktop-bridge'
import type { DesktopFetchWireRequest } from '@deepseek-ai/dsh-client-connection/desktop-bridge'

/** Injectable ipcMain face (tests substitute an emitter map). */
export interface IpcInvokeRegistrar {
  handle(channel: string, listener: (raw: unknown) => unknown): void
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
 * Mount the pump over one renderer.
 * @param ipc - ipcMain face.
 * @param sender - the window's webContents.
 * @param fetch - host /api dispatch (desktopRuntime.fetch).
 * @returns disposer aborting every in-flight request and removing handlers.
 */
export function mountFetchPump(
  ipc: IpcInvokeRegistrar,
  sender: IpcSender,
  fetch: (request: Request) => Promise<Response>,
): { dispose(): void } {
  const aborts = new Map<string, AbortController>()
  ipc.handle(DSH_FETCH_REQUEST, raw => {
    const wire = parseWireRequest(raw)
    if (wire === undefined) return { accepted: false }
    const controller = new AbortController()
    aborts.set(wire.id, controller)
    void pumpOne(sender, wire, controller.signal, fetch).finally(() => { aborts.delete(wire.id) })
    return { accepted: true }
  })
  ipc.handle(DSH_FETCH_ABORT, raw => {
    const id = (raw as { id?: unknown } | undefined)?.id
    if (typeof id === 'string') aborts.get(id)?.abort()
    return { accepted: true }
  })
  return {
    dispose() {
      for (const controller of aborts.values()) controller.abort()
      aborts.clear()
      ipc.removeHandler(DSH_FETCH_REQUEST)
      ipc.removeHandler(DSH_FETCH_ABORT)
    },
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
    sender.send(DSH_FETCH_RESPONSE, { id: wire.id, status: response.status, headers })
    if (response.body === null) {
      sender.send(DSH_FETCH_END, { id: wire.id })
      return
    }
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value !== undefined && value.byteLength > 0) sender.send(DSH_FETCH_CHUNK, { id: wire.id, data: value })
    }
    sender.send(DSH_FETCH_END, { id: wire.id })
  } catch (error) {
    sender.send(DSH_FETCH_ERROR, { id: wire.id, message: error instanceof Error ? error.message : String(error) })
  }
}

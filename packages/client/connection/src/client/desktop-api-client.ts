/** Desktop IPC carrier: doFetch ships the request over the preload bridge and rebuilds a streaming Response. */

import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type {
  DesktopFetchBridge, DesktopFetchWireRequest, DesktopFetchWireResponse,
} from './desktop-bridge.ts'

/** One in-flight fetch: downstream listeners route by id into this state. */
interface PendingFetch {
  onHead(message: DesktopFetchWireResponse): void
  onChunk(data: Uint8Array): void
  onEnd(): void
  onError(error: Error): void
}

/**
 * IPC-backed carrier. Protocol invariants (rpcId minting, envelope wrap/parse,
 * SSE decoding, timeouts) all live in AbstractApiClient; this class only moves
 * bytes across the bridge and rebuilds a WHATWG Response whose body is a
 * ReadableStream fed by `dsh-fetch/chunk` events.
 */
export class DesktopApiClient extends AbstractApiClient {
  private readonly pending = new Map<string, PendingFetch>()
  private readonly detach: ReadonlyArray<() => void>
  private disposed = false

  constructor(private readonly bridge: DesktopFetchBridge, timeoutMs?: number) {
    super(timeoutMs)
    this.detach = [
      bridge.onResponse(message => { this.pending.get(message.id)?.onHead(message) }),
      bridge.onChunk(message => { this.pending.get(message.id)?.onChunk(message.data) }),
      bridge.onEnd(message => { this.pending.get(message.id)?.onEnd() }),
      bridge.onError(message => { this.pending.get(message.id)?.onError(new Error(message.message)) }),
    ]
  }

  /** Public transport face for the generic RPC caller (same fetch shape as globalThis.fetch). */
  transport(input: URL, init?: RequestInit): Promise<Response> {
    return this.doFetch(input, init)
  }

  /** Detach bridge listeners and fail every pending fetch (renderer teardown). */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const detach of this.detach) detach()
    for (const pending of [...this.pending.values()]) pending.onError(new Error('desktop carrier disposed'))
    this.pending.clear()
  }

  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    if (this.disposed) return Promise.reject(new Error('desktop carrier disposed'))
    const id = crypto.randomUUID()
    const headers = flattenHeaders(init?.headers)
    const body = typeof init?.body === 'string' ? init.body : null
    const signal = init?.signal

    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined
      let response: Response | undefined
      const cleanup = (): void => {
        this.pending.delete(id)
        signal?.removeEventListener('abort', onAbort)
      }
      const fail = (error: Error): void => {
        cleanup()
        if (response === undefined) reject(error)
        else {
          try { controller?.error(error) } catch { /* stream already closed/cancelled */ }
        }
      }
      const onAbort = (): void => { this.bridge.abort(id) }

      const stream = new ReadableStream<Uint8Array>({
        start(c) { controller = c },
        cancel: () => { this.bridge.abort(id) },
      })
      this.pending.set(id, {
        onHead: message => {
          response = new Response(stream, { status: message.status, headers: message.headers })
          resolve(response)
        },
        onChunk: data => {
          try { controller?.enqueue(data) } catch { /* consumer cancelled */ }
        },
        onEnd: () => {
          cleanup()
          try { controller?.close() } catch { /* double close */ }
        },
        onError: fail,
      })
      const wire: DesktopFetchWireRequest = { id, url: input.toString(), method: init?.method ?? 'GET', headers, body }
      void this.bridge.request(wire).catch(error => { fail(error instanceof Error ? error : new Error(String(error))) })
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  }
}

/** Normalize RequestInit headers (Headers | array | record) to a plain JSON-safe record. */
function flattenHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const flat: Record<string, string> = {}
  if (headers === undefined) return flat
  if (headers instanceof Headers) {
    headers.forEach((value, key) => { flat[key] = value })
    return flat
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) flat[key] = value
    return flat
  }
  for (const [key, value] of Object.entries(headers)) flat[key] = String(value)
  return flat
}

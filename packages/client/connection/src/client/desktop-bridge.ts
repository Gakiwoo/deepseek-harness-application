/** Desktop IPC wire contract: channel names, payload shapes, and bridge detection. */

/** Upstream invoke channel (renderer → main): one fetch request. */
export const DSH_FETCH_REQUEST = 'dsh-fetch/request' as const
/** Downstream event: response head (status + headers) for a pending id. */
export const DSH_FETCH_RESPONSE = 'dsh-fetch/response' as const
/** Downstream event: one body chunk for a pending id. */
export const DSH_FETCH_CHUNK = 'dsh-fetch/chunk' as const
/** Downstream event: body complete for a pending id. */
export const DSH_FETCH_END = 'dsh-fetch/end' as const
/** Downstream event: transport failure for a pending id. */
export const DSH_FETCH_ERROR = 'dsh-fetch/error' as const
/** Upstream invoke channel: abort a pending id. */
export const DSH_FETCH_ABORT = 'dsh-fetch/abort' as const

/** Renderer → main request: the whole fetch serialized (body is always JSON text here). */
export interface DesktopFetchWireRequest {
  readonly id: string
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string | null
}

/** Main → renderer response head. */
export interface DesktopFetchWireResponse {
  readonly id: string
  readonly status: number
  readonly headers: Record<string, string>
}

/** Main → renderer body chunk (structured clone carries Uint8Array natively). */
export interface DesktopFetchWireChunk {
  readonly id: string
  readonly data: Uint8Array
}

/** Main → renderer successful completion. */
export interface DesktopFetchWireEnd {
  readonly id: string
}

/** Main → renderer transport failure. */
export interface DesktopFetchWireError {
  readonly id: string
  readonly message: string
}

/**
 * The preload-exposed IPC face. Channel names and payload fields are fixed
 * protocol constants (a security invariant); they are never configurable.
 */
export interface DesktopFetchBridge {
  /** Ship one request upstream; resolves once the main side accepted it. */
  request(message: DesktopFetchWireRequest): Promise<void>
  /** Abort a pending request by id. */
  abort(id: string): void
  /** Subscribe to response heads; returns the unsubscriber. */
  onResponse(listener: (message: DesktopFetchWireResponse) => void): () => void
  /** Subscribe to body chunks; returns the unsubscriber. */
  onChunk(listener: (message: DesktopFetchWireChunk) => void): () => void
  /** Subscribe to completions; returns the unsubscriber. */
  onEnd(listener: (message: DesktopFetchWireEnd) => void): () => void
  /** Subscribe to transport failures; returns the unsubscriber. */
  onError(listener: (message: DesktopFetchWireError) => void): () => void
}

/**
 * Read the desktop IPC bridge from the page global. Absent in web/Node contexts
 * (returns undefined); present-but-malformed throws loud — a half-installed
 * bridge must never silently degrade to the wrong carrier.
 * @returns the bridge, or undefined outside the desktop shell.
 */
export function readDesktopBridge(): DesktopFetchBridge | undefined {
  const candidate = (globalThis as { __DSH_DESKTOP__?: unknown }).__DSH_DESKTOP__
  if (candidate === undefined) return undefined
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('connection: window.__DSH_DESKTOP__ is present but not an object')
  }
  const bridge = candidate as Record<string, unknown>
  for (const key of ['request', 'abort', 'onResponse', 'onChunk', 'onEnd', 'onError']) {
    if (typeof bridge[key] !== 'function') {
      throw new Error(`connection: window.__DSH_DESKTOP__.${key} is missing or not a function`)
    }
  }
  return candidate as DesktopFetchBridge
}

// packages/client/connection/tests/desktop-bridge.client.spec.ts
/** desktop-bridge: wire 常量与 readDesktopBridge 的检测/校验。 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END, DSH_FETCH_ERROR,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
  readDesktopBridge,
} from '../src/client/desktop-bridge.ts'

const KEY = '__DSH_DESKTOP__'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[KEY]
})

function install(value: unknown): void {
  ;(globalThis as Record<string, unknown>)[KEY] = value
}

const BRIDGE = {
  request: async () => {},
  abort: () => {},
  onResponse: () => () => {},
  onChunk: () => () => {},
  onEnd: () => () => {},
  onError: () => () => {},
}

describe('desktop-bridge constants', () => {
  it('pins the six wire channels', () => {
    expect(DSH_FETCH_REQUEST).toBe('dsh-fetch/request')
    expect(DSH_FETCH_RESPONSE).toBe('dsh-fetch/response')
    expect(DSH_FETCH_CHUNK).toBe('dsh-fetch/chunk')
    expect(DSH_FETCH_END).toBe('dsh-fetch/end')
    expect(DSH_FETCH_ERROR).toBe('dsh-fetch/error')
    expect(DSH_FETCH_ABORT).toBe('dsh-fetch/abort')
  })
})

describe('readDesktopBridge', () => {
  it('returns undefined without the global', () => {
    expect(readDesktopBridge()).toBeUndefined()
  })

  it('returns the bridge when present and well-shaped', () => {
    install(BRIDGE)
    expect(readDesktopBridge()).toBe(BRIDGE)
  })

  it('throws loud on a malformed global (protocol invariant)', () => {
    install({ request: 'not-a-function' })
    expect(() => readDesktopBridge()).toThrow(/__DSH_DESKTOP__/)
  })
})

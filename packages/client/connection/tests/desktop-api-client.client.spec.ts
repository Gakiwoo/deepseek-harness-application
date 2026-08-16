/** DesktopApiClient over a fake preload bridge: real wire messages, no Electron. */

import { describe, expect, it, vi } from 'vitest'
import { DesktopApiClient } from '../src/client/desktop-api-client.ts'
import type {
  DesktopFetchBridge, DesktopFetchWireChunk, DesktopFetchWireEnd,
  DesktopFetchWireError, DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '../src/client/desktop-bridge.ts'

/** Fake main-side pump: records upstream requests, lets the test script the downstream. */
function createFakeBridge() {
  const requests: DesktopFetchWireRequest[] = []
  const aborts: string[] = []
  const channels = {
    response: new Set<(m: DesktopFetchWireResponse) => void>(),
    chunk: new Set<(m: DesktopFetchWireChunk) => void>(),
    end: new Set<(m: DesktopFetchWireEnd) => void>(),
    error: new Set<(m: DesktopFetchWireError) => void>(),
  }
  const bridge: DesktopFetchBridge = {
    async request(message) { requests.push(message) },
    abort(id) { aborts.push(id) },
    onResponse: l => { channels.response.add(l); return () => { channels.response.delete(l) } },
    onChunk: l => { channels.chunk.add(l); return () => { channels.chunk.delete(l) } },
    onEnd: l => { channels.end.add(l); return () => { channels.end.delete(l) } },
    onError: l => { channels.error.add(l); return () => { channels.error.delete(l) } },
  }
  return {
    bridge, requests, aborts,
    respond: (m: DesktopFetchWireResponse) => { for (const l of channels.response) l(m) },
    chunk: (m: DesktopFetchWireChunk) => { for (const l of channels.chunk) l(m) },
    end: (m: DesktopFetchWireEnd) => { for (const l of channels.end) l(m) },
    fail: (m: DesktopFetchWireError) => { for (const l of channels.error) l(m) },
  }
}

const encoder = new TextEncoder()

/** A valid host.describe response value matching the real schema. */
const HOST_DESCRIBE_VALUE = {
  version: '0.1.0-rc.5',
  cwd: '/tmp',
  attachedSessions: 0,
  canOpenPath: false,
}

describe('DesktopApiClient', () => {
  it('round-trips a unary call (envelope in, envelope out)', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.host.describe({})
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    expect(wire.method).toBe('POST')
    expect(wire.url).toContain('/api/host.describe')
    const envelope = JSON.parse(wire.body ?? '') as { type: string; method: string }
    expect(envelope.type).toBe('client-request')
    expect(envelope.method).toBe('host.describe')
    fake.respond({ id: wire.id, status: 200, headers: { 'content-type': 'application/json' } })
    fake.chunk({ id: wire.id, data: encoder.encode(JSON.stringify({
      type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: HOST_DESCRIBE_VALUE },
    })) })
    fake.end({ id: wire.id })
    const response = await pending
    expect(response.result.ok).toBe(true)
    client.dispose()
  })

  it('streams the body chunk-by-chunk into the Response', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/events.mux'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    fake.respond({ id: wire.id, status: 200, headers: { 'content-type': 'text/event-stream' } })
    fake.chunk({ id: wire.id, data: encoder.encode('data: a\n\n') })
    fake.chunk({ id: wire.id, data: encoder.encode('data: b\n\n') })
    fake.end({ id: wire.id })
    const response = await pending
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toBe('data: a\n\n')
    expect(decoder.decode((await reader.read()).value)).toBe('data: b\n\n')
    expect((await reader.read()).done).toBe(true)
    client.dispose()
  })

  it('forwards AbortSignal to bridge.abort(id)', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const controller = new AbortController()
    void client.transport(new URL('http://dsh.internal/api/session.list'), { signal: controller.signal })
      .catch(() => undefined)
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    controller.abort()
    expect(fake.aborts).toEqual([fake.requests[0].id])
    client.dispose()
  })

  it('rejects on downstream error before the head arrives', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/x'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    fake.fail({ id: fake.requests[0].id, message: 'boom' })
    await expect(pending).rejects.toThrow('boom')
    client.dispose()
  })

  it('dispose detaches listeners and fails pending streams', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/events.mux'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    fake.respond({ id: wire.id, status: 200, headers: {} })
    const response = await pending
    client.dispose()
    const reader = response.body!.getReader()
    await expect(reader.read()).rejects.toThrow()
  })
})

/** Keyless desktop boot snapshot: profile tree → manifest → IPC-wire round trip. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bootDesktopHost } from '../src/host-boot.ts'
import { DesktopApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type {
  DesktopFetchBridge, DesktopFetchWireChunk, DesktopFetchWireEnd,
  DesktopFetchWireError, DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '@deepseek-ai/dsh-client-connection/client'

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-snap-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

/** In-memory bridge: request() walks the real wire encode → runtime.fetch → wire decode. */
function bridgeOver(fetch: (request: Request) => Promise<Response>): DesktopFetchBridge {
  const channels = {
    response: new Set<(m: DesktopFetchWireResponse) => void>(),
    chunk: new Set<(m: DesktopFetchWireChunk) => void>(),
    end: new Set<(m: DesktopFetchWireEnd) => void>(),
    error: new Set<(m: DesktopFetchWireError) => void>(),
  }
  return {
    async request(wire: DesktopFetchWireRequest) {
      const url = new URL(wire.url)
      url.protocol = 'http:'
      url.host = '127.0.0.1'
      const response = await fetch(new Request(url, {
        method: wire.method, headers: wire.headers, ...wire.body === null ? {} : { body: wire.body },
      }))
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      for (const l of channels.response) l({ id: wire.id, status: response.status, headers })
      if (response.body !== null) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined && value.byteLength > 0) for (const l of channels.chunk) l({ id: wire.id, data: value })
        }
      }
      for (const l of channels.end) l({ id: wire.id })
    },
    abort: () => {},
    onResponse: l => { channels.response.add(l); return () => { channels.response.delete(l) } },
    onChunk: l => { channels.chunk.add(l); return () => { channels.chunk.delete(l) } },
    onEnd: l => { channels.end.add(l); return () => { channels.end.delete(l) } },
    onError: l => { channels.error.add(l); return () => { channels.error.delete(l) } },
  }
}

describe('desktop boot snapshot', () => {
  it('boots and answers host.describe + session.list over the IPC wire', { timeout: 120_000 }, async () => {
    const handle = await bootDesktopHost({ home, frontendIndexPath: '/tmp/index.html' })
    const client = new DesktopApiClient(bridgeOver(handle.runtime.fetch))
    const described = await client.host.describe({})
    expect(described.result.ok).toBe(true)
    const listed = await client.sessions.list({})
    expect(listed.result.ok).toBe(true)
    const ids = handle.runtime.graph().entries.map(e => e.id)
    expect(ids).toContain('@deepseek-ai/dsh-client-connection')
    expect(ids).toContain('@deepseek-ai/dsh-client-runtime')
    client.dispose()
    await handle.dispose()
  })
})
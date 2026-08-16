/** createConnectionRpc: correlation and envelope validation over an injected fetcher. */

import { describe, expect, it } from 'vitest'
import { createConnectionRpc, createWebConnectionRpc } from '../src/client/rpc.ts'

function okFetch(body: unknown): (input: URL, init?: RequestInit) => Promise<Response> {
  return async (_input, init) => {
    expect(init?.method).toBe('POST')
    const sent = JSON.parse(String(init?.body)) as { rpcId: string; method: string }
    return new Response(JSON.stringify({ type: 'server-response', rpcId: sent.rpcId, result: { ok: true, value: body } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
}

describe('createConnectionRpc', () => {
  it('calls through the injected fetcher and returns the result slot', async () => {
    const rpc = createConnectionRpc(okFetch({ answer: 42 }))
    const result = await rpc.call('/api', 'goals/create', { title: 'x' })
    expect(result).toEqual({ ok: true, value: { answer: 42 } })
  })

  it('throws on rpcId mismatch', async () => {
    const rpc = createConnectionRpc(async () => new Response(JSON.stringify({
      type: 'server-response', rpcId: 'not-the-sent-one', result: { ok: true, value: null },
    }), { status: 200 }))
    await expect(rpc.call('/api', 'goals/create', {})).rejects.toThrow(/rpcId mismatch/)
  })

  it('rejects invalid targets before any fetch', async () => {
    const fetcher = async () => { throw new Error('must not be called') }
    const rpc = createConnectionRpc(fetcher)
    await expect(rpc.call('/api', '../escape', {})).rejects.toThrow(/invalid RPC target/)
  })

  it('createWebConnectionRpc still exists (web carrier unchanged)', () => {
    expect(typeof createWebConnectionRpc).toBe('function')
  })
})

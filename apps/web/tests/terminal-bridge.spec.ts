/** Terminal page RPC bridge: wire envelope, method targets, and result unwrap. */

import { describe, expect, it } from 'vitest'
import { createTerminalRpc } from '../src/terminal/bridge.ts'

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

function wireStub(replies: Array<{ status?: number; result?: unknown; mismatchRpcId?: boolean }>): {
  fetcher: (input: URL, init?: RequestInit) => Promise<Response>
  requests: CapturedRequest[]
} {
  const requests: CapturedRequest[] = []
  let index = 0
  const fetcher = async (input: URL, init?: RequestInit): Promise<Response> => {
    const reply = replies[Math.min(index, replies.length - 1)] ?? { status: 200, result: undefined }
    index += 1
    const body = typeof init?.body === 'string' ? init.body : 'null'
    requests.push({
      url: input.toString(),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body,
    })
    // The host echoes the request rpcId; a stub that fabricates its own would
    // trip the correlation check under test.
    const parsed = JSON.parse(body) as { rpcId?: unknown }
    const echoed = typeof parsed.rpcId === 'string' ? parsed.rpcId : 'stub-rpc'
    const rpcId = reply.mismatchRpcId === true ? 'stub-rpc' : echoed
    return new Response(JSON.stringify(serverReply(rpcId, reply.result)), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetcher, requests }
}

function serverReply(rpcId: string, result: unknown): { type: 'server-response'; rpcId: string; result: unknown } {
  return { type: 'server-response', rpcId, result }
}

describe('createTerminalRpc', () => {
  it('posts the wire envelope to /api/terminalManager/<method> and unwraps the value', async () => {
    const { fetcher, requests } = wireStub([
      { result: { ok: true, value: { sessionId: 's-1', pid: 42 } } },
      { result: { ok: true, value: { delta: 'hi', truncated: false, exited: false } } },
      { result: { ok: true, value: undefined } },
    ])
    const rpc = createTerminalRpc(fetcher)
    const spawned = await rpc.spawn(24, 80, '/tmp')
    expect(spawned).toEqual({ sessionId: 's-1', pid: 42 })
    const read = await rpc.read('s-1')
    expect(read).toEqual({ delta: 'hi', truncated: false, exited: false })
    await rpc.close('s-1')

    expect(requests.map(request => request.url)).toEqual([
      'http://dsh.internal/api/terminalManager/spawn',
      'http://dsh.internal/api/terminalManager/read',
      'http://dsh.internal/api/terminalManager/close',
    ])
    const envelope = JSON.parse(requests[0]?.body ?? '{}') as { type: string; method: string; payload: { args: Record<string, unknown> } }
    expect(envelope.type).toBe('client-request')
    expect(envelope.method).toBe('terminalManager/spawn')
    expect(envelope.payload.args).toEqual({ request: { rows: 24, cols: 80, cwd: '/tmp' } })
  })

  it('uses the terminalSignal wire key for signal', async () => {
    const { fetcher, requests } = wireStub([{ result: { ok: true, value: undefined } }])
    const rpc = createTerminalRpc(fetcher)
    await rpc.signal('s-1', 'SIGINT')
    const envelope = JSON.parse(requests[0]?.body ?? '{}') as { payload: { args: Record<string, unknown> } }
    expect(envelope.payload.args).toEqual({ sessionId: 's-1', terminalSignal: 'SIGINT' })
  })

  it('rejects a rejected Remote verdict with the host error text', async () => {
    const { fetcher } = wireStub([{
      result: { ok: false, error: { code: 'bad-request', message: 'unknown terminal session: nope', details: { issues: [] } } },
    }])
    const rpc = createTerminalRpc(fetcher)
    await expect(rpc.write('nope', 'x')).rejects.toThrow('unknown terminal session: nope')
  })

  it('fails loud on a mismatched rpcId echo', async () => {
    const { fetcher } = wireStub([{ mismatchRpcId: true, result: { ok: true, value: undefined } }])
    const rpc = createTerminalRpc(fetcher)
    await expect(rpc.close('s-1')).rejects.toThrow('rpcId mismatch')
  })

  it('fails loud on a non-ok HTTP response', async () => {
    const { fetcher } = wireStub([{ status: 500, result: undefined }])
    const rpc = createTerminalRpc(fetcher)
    await expect(rpc.read('s-1')).rejects.toThrow(/HTTP 500/)
  })
})

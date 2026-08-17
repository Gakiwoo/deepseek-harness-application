/** fetch-pump: IPC dispatch over injectable ipc/sender/fetch faces (no Electron). */

import { describe, expect, it, vi } from 'vitest'
import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
} from '@deepseek-ai/dsh-client-connection/desktop-bridge'
import { mountFetchPump, type IpcInvokeRegistrar, type IpcSender } from '../src/host-glue/fetch-pump.ts'

/** In-memory ipc face: captures handlers, lets the test trigger them. */
function fakeIpc(): {
  ipc: IpcInvokeRegistrar
  sent: { channel: string; message: unknown }[]
  trigger: (channel: string, raw: unknown) => unknown
} {
  const handlers = new Map<string, (raw: unknown) => unknown>()
  const sent: { channel: string; message: unknown }[] = []
  return {
    ipc: {
      handle: (channel, listener) => { handlers.set(channel, listener) },
      removeHandler: (channel) => { handlers.delete(channel) },
    },
    sent,
    trigger: (channel, raw) => handlers.get(channel)?.(raw),
  }
}

function fakeSender(sent: { channel: string; message: unknown }[]): IpcSender {
  return { send: (channel, message) => { sent.push({ channel, message }) } }
}

describe('mountFetchPump', () => {
  it('rewrites dsh:// to http://127.0.0.1 and streams response → chunk → end', async () => {
    const { ipc, sent, trigger } = fakeIpc()
    const fetch = vi.fn<(req: Request) => Promise<Response>>().mockResolvedValue(
      new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } }),
    )
    const pump = mountFetchPump(ipc, fakeSender(sent), fetch)

    await trigger(DSH_FETCH_REQUEST, {
      id: 'r1', url: 'dsh://app/api/host.describe', method: 'POST',
      headers: { 'content-type': 'application/json' }, body: '{}',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    const requested = fetch.mock.calls[0]?.[0]
    expect(requested?.url).toBe('http://127.0.0.1/api/host.describe')

    const head = sent.find(s => s.channel === DSH_FETCH_RESPONSE)
    expect(head?.message).toMatchObject({ id: 'r1', status: 200 })
    // body streaming is async; give the pump a tick to flush chunk + end
    await new Promise(resolve => setTimeout(resolve, 0))
    const chunk = sent.find(s => s.channel === DSH_FETCH_CHUNK)
    expect(chunk).toBeDefined()
    const end = sent.find(s => s.channel === DSH_FETCH_END)
    expect(end).toBeDefined()
    pump.dispose()
  })

  it('rejects a malformed wire request', async () => {
    const { ipc, sent, trigger } = fakeIpc()
    const pump = mountFetchPump(ipc, fakeSender(sent), async () => new Response(''))
    const result = await trigger(DSH_FETCH_REQUEST, { bad: 'data' })
    expect(result).toEqual({ accepted: false })
    pump.dispose()
  })

  it('forwards abort to the controller', async () => {
    const { ipc, sent, trigger } = fakeIpc()
    let signal: AbortSignal | undefined
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      signal = req.signal
      // Never resolve — test aborts
      await new Promise(() => {})
      return new Response('')
    })
    const pump = mountFetchPump(ipc, fakeSender(sent), fetch)
    await trigger(DSH_FETCH_REQUEST, {
      id: 'r2', url: 'dsh://app/api/session.list', method: 'POST',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)
    await trigger(DSH_FETCH_ABORT, { id: 'r2' })
    expect(signal?.aborted).toBe(true)
    pump.dispose()
  })

  it('dispose aborts in-flight controllers and removes handlers', async () => {
    const { ipc, sent, trigger } = fakeIpc()
    let receivedSignal: AbortSignal | undefined
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      receivedSignal = req.signal
      await new Promise(() => {}) // never settle; dispose aborts it
      return new Response('')
    })
    const pump = mountFetchPump(ipc, fakeSender(sent), fetch)
    await trigger(DSH_FETCH_REQUEST, {
      id: 'r3', url: 'dsh://app/api/x', method: 'GET',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    pump.dispose()
    // The in-flight request's AbortSignal was aborted by dispose.
    expect(receivedSignal?.aborted).toBe(true)
    // Handlers are gone: a fresh trigger no longer produces a response channel.
    await trigger(DSH_FETCH_REQUEST, {
      id: 'r4', url: 'dsh://app/api/y', method: 'GET',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sent.some(s => s.channel === DSH_FETCH_RESPONSE)).toBe(false)
  })
})

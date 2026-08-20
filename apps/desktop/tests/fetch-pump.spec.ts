/** fetch-pump: multi-window IPC dispatch over injectable ipc/sender/fetch faces (no Electron). */

import { describe, expect, it, vi } from 'vitest'
import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
} from '@deepseek-ai/dsh-client-connection/desktop-bridge'
import { mountFetchPump, type IpcSender, type IpcWireRegistrar } from '../src/host-glue/fetch-pump.ts'

/** In-memory ipc face: captures handlers, lets the test trigger them per sender. */
function fakeIpc(): {
  ipc: IpcWireRegistrar
  trigger: (sender: IpcSender, channel: string, raw: unknown) => unknown
  handlersAfterDispose: number
} {
  const handlers = new Map<string, (sender: IpcSender, raw: unknown) => unknown>()
  return {
    ipc: {
      handle: (channel, listener) => { handlers.set(channel, listener) },
      removeHandler: (channel) => { handlers.delete(channel) },
    },
    trigger: (sender, channel, raw) => handlers.get(channel)?.(sender, raw),
    get handlersAfterDispose() { return handlers.size },
  }
}

function fakeSender(sent: { channel: string; message: unknown }[]): IpcSender {
  return { send: (channel, message) => { sent.push({ channel, message }) } }
}

describe('mountFetchPump', () => {
  it('rewrites dsh:// to http://127.0.0.1 and streams response → chunk → end', async () => {
    const { ipc, trigger } = fakeIpc()
    const sent: { channel: string; message: unknown }[] = []
    const sender = fakeSender(sent)
    const fetch = vi.fn<(req: Request) => Promise<Response>>().mockResolvedValue(
      new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } }),
    )
    const pump = mountFetchPump(ipc, fetch)

    await trigger(sender, DSH_FETCH_REQUEST, {
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
    const { ipc, trigger } = fakeIpc()
    const sent: { channel: string; message: unknown }[] = []
    const pump = mountFetchPump(ipc, async () => new Response(''))
    const result = await trigger(fakeSender(sent), DSH_FETCH_REQUEST, { bad: 'data' })
    expect(result).toEqual({ accepted: false })
    pump.dispose()
  })

  it('forwards abort to the controller', async () => {
    const { ipc, trigger } = fakeIpc()
    const sent: { channel: string; message: unknown }[] = []
    let signal: AbortSignal | undefined
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      signal = req.signal
      // Never resolve — test aborts
      await new Promise(() => {})
      return new Response('')
    })
    const pump = mountFetchPump(ipc, fetch)
    const sender = fakeSender(sent)
    await trigger(sender, DSH_FETCH_REQUEST, {
      id: 'r2', url: 'dsh://app/api/session.list', method: 'POST',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)
    await trigger(sender, DSH_FETCH_ABORT, { id: 'r2' })
    expect(signal?.aborted).toBe(true)
    pump.dispose()
  })

  it('routes responses to the requesting window only', async () => {
    const { ipc, trigger } = fakeIpc()
    const firstSent: { channel: string; message: unknown }[] = []
    const secondSent: { channel: string; message: unknown }[] = []
    const first = fakeSender(firstSent)
    const second = fakeSender(secondSent)
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      return new Response(req.url, { status: 200 })
    })
    const pump = mountFetchPump(ipc, fetch)

    await trigger(first, DSH_FETCH_REQUEST, {
      id: 'a1', url: 'dsh://app/api/first', method: 'GET', headers: {}, body: null,
    })
    await trigger(second, DSH_FETCH_REQUEST, {
      id: 'b1', url: 'dsh://app/api/second', method: 'GET', headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    // Each window's head and body land on its own sender only.
    expect(firstSent.filter(s => s.channel === DSH_FETCH_RESPONSE).map(s => (s.message as { id: string }).id)).toEqual(['a1'])
    expect(secondSent.filter(s => s.channel === DSH_FETCH_RESPONSE).map(s => (s.message as { id: string }).id)).toEqual(['b1'])
    expect(secondSent.some(s => (s.message as { id: string }).id === 'a1')).toBe(false)
    pump.dispose()
  })

  it('scopes aborts to the requesting window', async () => {
    const { ipc, trigger } = fakeIpc()
    const sent: { channel: string; message: unknown }[] = []
    const first = fakeSender(sent)
    const second = fakeSender(sent)
    const signals = new Map<string, AbortSignal>()
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      signals.set(req.url, req.signal)
      // Stay in flight until the test aborts, so the controllers stay registered.
      await new Promise(() => {})
      return new Response('window data', { status: 200 })
    })
    const pump = mountFetchPump(ipc, fetch)

    await trigger(first, DSH_FETCH_REQUEST, {
      id: 'a1', url: 'dsh://app/api/first', method: 'GET', headers: {}, body: null,
    })
    await trigger(second, DSH_FETCH_REQUEST, {
      id: 'b1', url: 'dsh://app/api/second', method: 'GET', headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    // An abort from one window never touches the other window's request.
    await trigger(second, DSH_FETCH_ABORT, { id: 'a1' })
    expect(signals.get('http://127.0.0.1/api/first')?.aborted).toBe(false)
    await trigger(first, DSH_FETCH_ABORT, { id: 'a1' })
    expect(signals.get('http://127.0.0.1/api/first')?.aborted).toBe(true)
    pump.dispose()
  })

  it('dispose aborts in-flight controllers and removes handlers', async () => {
    const { ipc, trigger, handlersAfterDispose } = fakeIpc()
    const sent: { channel: string; message: unknown }[] = []
    let receivedSignal: AbortSignal | undefined
    const fetch = vi.fn<(req: Request) => Promise<Response>>(async (req) => {
      receivedSignal = req.signal
      await new Promise(() => {}) // never settle; dispose aborts it
      return new Response('')
    })
    const pump = mountFetchPump(ipc, fetch)
    const sender = fakeSender(sent)
    await trigger(sender, DSH_FETCH_REQUEST, {
      id: 'r3', url: 'dsh://app/api/x', method: 'GET',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    pump.dispose()
    // The in-flight request's AbortSignal was aborted by dispose.
    expect(receivedSignal?.aborted).toBe(true)
    // Handlers are gone: a fresh trigger no longer produces a response channel.
    expect(handlersAfterDispose).toBe(0)
    await trigger(sender, DSH_FETCH_REQUEST, {
      id: 'r4', url: 'dsh://app/api/y', method: 'GET',
      headers: {}, body: null,
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(sent.some(s => s.channel === DSH_FETCH_RESPONSE)).toBe(false)
  })

  it('tolerates a sender destroyed mid-flight', async () => {
    const { ipc, trigger } = fakeIpc()
    const fetch = vi.fn<(req: Request) => Promise<Response>>().mockResolvedValue(new Response('gone', { status: 200 }))
    const pump = mountFetchPump(ipc, fetch)
    const gone = { send: () => { throw new Error('Object has been destroyed') } } as IpcSender
    expect(trigger(gone, DSH_FETCH_REQUEST, {
      id: 'z1', url: 'dsh://app/api/x', method: 'GET', headers: {}, body: null,
    })).toEqual({ accepted: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    pump.dispose()
  })
})

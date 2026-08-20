/** Terminal session controller: spawn, input/output bridging, resize, close. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TerminalRpc } from '../src/terminal/bridge.ts'
import { startTerminalSession, type TerminalPane } from '../src/terminal/session.ts'

interface FakePaneState {
  written: string[]
  dataListeners: Array<(data: string) => void>
  resizeListeners: Array<(cols: number, rows: number) => void>
}

function fakePane(): { pane: TerminalPane & FakePaneState; dispose: ReturnType<typeof vi.fn> } {
  const written: string[] = []
  const dataListeners: Array<(data: string) => void> = []
  const resizeListeners: Array<(cols: number, rows: number) => void> = []
  const dispose = vi.fn()
  return {
    pane: {
      rows: 24,
      cols: 80,
      written,
      dataListeners,
      resizeListeners,
      write: (data: string) => { written.push(data) },
      onData: (listener) => {
        dataListeners.push(listener)
        return () => { dataListeners.splice(dataListeners.indexOf(listener), 1) }
      },
      onResize: (listener) => {
        resizeListeners.push(listener)
        return () => { resizeListeners.splice(resizeListeners.indexOf(listener), 1) }
      },
      dispose,
    },
    dispose,
  }
}

function fakeRpc(overrides: Partial<TerminalRpc> = {}): TerminalRpc & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const record = <T extends (...args: never[]) => unknown>(method: string, impl: T): T => {
    const wrapped = ((...args: unknown[]) => {
      calls.push({ method, args })
      return impl(...(args as never[]))
    }) as unknown
    return wrapped as T
  }
  return {
    spawn: record('spawn', vi.fn(async (_rows: number, _cols: number) => ({ sessionId: 's-1', pid: 42 }))),
    write: record('write', vi.fn(async () => {})),
    read: record('read', vi.fn(async () => ({ delta: '', truncated: false, exited: false }))),
    resize: record('resize', vi.fn(async () => {})),
    signal: record('signal', vi.fn(async () => {})),
    close: record('close', vi.fn(async () => {})),
    calls,
    ...overrides,
  }
}

afterEach(() => { vi.useRealTimers() })

describe('startTerminalSession', () => {
  it('spawns with the initial window size and bridges keystrokes as input', async () => {
    const { pane } = fakePane()
    const rpc = fakeRpc()
    await startTerminalSession(pane, rpc, { pollMs: 50 })
    expect(rpc.calls).toContainEqual({ method: 'spawn', args: [24, 80] })
    pane.dataListeners[0]?.('echo hi\r')
    await vi.waitFor(() => { expect(rpc.calls).toContainEqual({ method: 'write', args: ['s-1', 'echo hi\r'] }) })
  })

  it('polls output and writes deltas to the pane', async () => {
    vi.useFakeTimers()
    const { pane } = fakePane()
    const reads = [
      { delta: 'hello ', truncated: false, exited: false },
      { delta: 'world', truncated: false, exited: false },
    ]
    const rpc = fakeRpc({
      read: vi.fn(async () => reads.shift() ?? { delta: '', truncated: false, exited: false }),
    })
    const session = await startTerminalSession(pane, rpc, { pollMs: 50 })
    expect(pane.written).toEqual([])
    await vi.advanceTimersByTimeAsync(50)
    expect(pane.written).toEqual(['hello '])
    await vi.advanceTimersByTimeAsync(50)
    expect(pane.written).toEqual(['hello ', 'world'])
    await session.close()
  })

  it('stops polling, detaches listeners, and disposes the pane on exit', async () => {
    vi.useFakeTimers()
    const { pane, dispose } = fakePane()
    let reads = 0
    const rpc = fakeRpc({
      read: vi.fn(async () => {
        reads += 1
        return reads === 2 ? { delta: 'bye', truncated: false, exited: true } : { delta: '', truncated: false, exited: false }
      }),
    })
    const session = await startTerminalSession(pane, rpc, { pollMs: 50 })
    await vi.advanceTimersByTimeAsync(100)
    expect(pane.written).toEqual(['bye'])
    expect(dispose).toHaveBeenCalledOnce()
    const pollCount = reads
    await vi.advanceTimersByTimeAsync(200)
    expect(reads).toBe(pollCount)
    await session.close()
  })

  it('forwards resizes to the host session', async () => {
    const { pane } = fakePane()
    const rpc = fakeRpc()
    const session = await startTerminalSession(pane, rpc, { pollMs: 50 })
    pane.resizeListeners[0]?.(120, 40)
    await vi.waitFor(() => { expect(rpc.calls).toContainEqual({ method: 'resize', args: ['s-1', 40, 120] }) })
    await session.close()
  })

  it('close sends the RPC close once and is idempotent', async () => {
    const { pane, dispose } = fakePane()
    const rpc = fakeRpc()
    const session = await startTerminalSession(pane, rpc, { pollMs: 50 })
    await session.close()
    await session.close()
    expect(rpc.calls.filter(call => call.method === 'close')).toHaveLength(1)
    expect(dispose).toHaveBeenCalledOnce()
  })
})

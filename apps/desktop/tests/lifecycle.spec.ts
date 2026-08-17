import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopShutdown,
  disposeDesktopShell,
  installShutdownRequests,
} from '../src/lifecycle.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('desktop shutdown', () => {
  it('disposes once and exits with the requested code', async () => {
    const dispose = vi.fn(async () => {})
    const exit = vi.fn()
    const shutdown = createDesktopShutdown(dispose, exit)
    await shutdown.request(0)
    await shutdown.request(1)
    expect(dispose).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('turns a failed clean disposal into exit code 1', async () => {
    const exit = vi.fn()
    await createDesktopShutdown(async () => { throw new Error('dispose failed') }, exit).request(0)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('forces a wedged clean shutdown with exit code 1', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const pending = createDesktopShutdown(() => new Promise<void>(() => {}), exit, 25).request(0)
    await vi.advanceTimersByTimeAsync(25)
    expect(pending).toBeInstanceOf(Promise)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('escalates a repeated request immediately', async () => {
    let finish!: () => void
    const exit = vi.fn()
    const shutdown = createDesktopShutdown(() => new Promise<void>((resolve) => { finish = resolve }), exit)
    const first = shutdown.request(0)
    await Promise.resolve()
    void shutdown.request(130)
    expect(exit).toHaveBeenCalledWith(130)
    finish()
    await first
    expect(exit).toHaveBeenCalledOnce()
  })

  it('installs and removes native shutdown requests', () => {
    const signalListeners = new Map<string, () => void>()
    const appListeners = new Map<string, (event: { preventDefault(): void }) => void>()
    const signals = {
      on: (name: string, listener: () => void) => { signalListeners.set(name, listener) },
      off: (name: string, listener: () => void) => {
        if (signalListeners.get(name) === listener) signalListeners.delete(name)
      },
    }
    const nativeApp = {
      on: (name: string, listener: (event: { preventDefault(): void }) => void) => { appListeners.set(name, listener) },
      off: (name: string, listener: (event: { preventDefault(): void }) => void) => {
        if (appListeners.get(name) === listener) appListeners.delete(name)
      },
    }
    const requestQuit = vi.fn()
    const preventDefault = vi.fn()
    const dispose = installShutdownRequests(signals, nativeApp, requestQuit)

    signalListeners.get('SIGINT')?.()
    signalListeners.get('SIGTERM')?.()
    appListeners.get('before-quit')?.({ preventDefault })

    expect(requestQuit.mock.calls).toEqual([[130], [0], [0]])
    expect(preventDefault).toHaveBeenCalledOnce()
    dispose()
    expect(signalListeners).toHaveLength(0)
    expect(appListeners).toHaveLength(0)
  })

  it('disposes the pump, host, and native resources in order', async () => {
    const trace: string[] = []
    const shutdown = createDesktopShutdown(
      () => disposeDesktopShell({
        pump: { dispose: () => { trace.push('pump.dispose') } },
        host: {
          dispose: async () => {
            trace.push('host.dispose')
            throw new Error('host failure')
          },
        },
        native: { dispose: () => { trace.push('native.dispose') } },
      }),
      (code) => { trace.push(`app.exit:${String(code)}`) },
    )
    await shutdown.request(0)
    expect(trace).toEqual(['pump.dispose', 'host.dispose', 'native.dispose', 'app.exit:1'])
  })
})

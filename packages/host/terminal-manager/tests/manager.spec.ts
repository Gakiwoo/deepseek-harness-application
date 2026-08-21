import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { homedir } from 'node:os'
import { PassThrough } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import type {
  SubprocessOutcome,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import TerminalManagerGateway, { name, type Config } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface FakeHandle extends SubprocessTerminalHandle {
  output: PassThrough
  done: Promise<SubprocessOutcome>
  write: Mock<(data: string) => Promise<void>>
  resize: Mock<(cols: number, rows: number) => Promise<void>>
  signalForeground: Mock<(signal: SubprocessTerminalSignal) => Promise<number>>
  terminate: Mock<() => Promise<void>>
  settle: (outcome: SubprocessOutcome) => void
}

function fakeHandle(): FakeHandle {
  const output = new PassThrough()
  const done = Promise.withResolvers<SubprocessOutcome>()
  return {
    pid: 4242,
    output,
    done: done.promise,
    write: vi.fn(async (_data: string) => {}),
    resize: vi.fn(async (_cols: number, _rows: number) => {}),
    inspectForeground: vi.fn(async () => undefined),
    signalForeground: vi.fn(async (_signal: SubprocessTerminalSignal) => 4242),
    terminate: vi.fn(async () => {}),
    settle: done.resolve,
  }
}

function fakeSubprocess(handle: FakeHandle = fakeHandle()) {
  const spawnTerminal = vi.fn(async (_spec: SubprocessTerminalSpawnSpec) => handle)
  return { spawnTerminal }
}

async function harness(config: Config = {}): Promise<{
  ctx: Context
  gateway: TerminalManagerGateway
  handle: FakeHandle
  spawnTerminal: ReturnType<typeof fakeSubprocess>['spawnTerminal']
}> {
  const ctx = new Context()
  contexts.push(ctx)
  const handle = fakeHandle()
  const subprocess = fakeSubprocess(handle)
  ctx.provide('subprocess', subprocess as never)
  await ctx.plugin(TerminalManagerGateway, config)
  const gateway = ctx.get('terminalManager') as TerminalManagerGateway
  return { ctx, gateway, handle, spawnTerminal: subprocess.spawnTerminal }
}

describe('TerminalManagerGateway', () => {
  it('publishes the terminal session verbs under the terminalManager namespace', async () => {
    const { gateway } = await harness()
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'terminalManager',
      namespace: 'terminalManager',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'spawn', invocation: { kind: 'direct' } },
      { method: 'write', invocation: { kind: 'direct' } },
      { method: 'read', invocation: { kind: 'direct' } },
      { method: 'resize', invocation: { kind: 'direct' } },
      { method: 'signal', invocation: { kind: 'direct' } },
      { method: 'close', invocation: { kind: 'direct' } },
    ])
  })

  it('spawns the configured shell with the window size, cwd, grace, and TERM', async () => {
    const { gateway, spawnTerminal } = await harness({ shellPath: '/bin/zsh', graceMs: 500 })
    const result = await gateway.spawn({ rows: 30, cols: 100, cwd: '/tmp' })
    expect(spawnTerminal).toHaveBeenCalledOnce()
    expect(spawnTerminal.mock.calls[0]?.[0]).toEqual({
      argv: ['/bin/zsh'],
      cwd: '/tmp',
      rows: 30,
      cols: 100,
      graceMs: 500,
      env: { TERM: 'xterm-256color' },
    })
    expect(result).toEqual({ sessionId: expect.any(String) as string, pid: 4242 })
  })

  it('resolves $SHELL then the platform default, and defaults cwd to the home', async () => {
    const originalShell = process.env.SHELL
    delete process.env.SHELL
    try {
      const first = await harness()
      await first.gateway.spawn({ rows: 24, cols: 80 })
      expect(first.spawnTerminal.mock.calls[0]?.[0]?.argv).toEqual(['/bin/bash'])
      expect(first.spawnTerminal.mock.calls[0]?.[0]?.cwd).toBe(homedir())
      await first.ctx.fiber.dispose()

      process.env.SHELL = '/usr/bin/fish'
      const second = await harness()
      await second.gateway.spawn({ rows: 24, cols: 80 })
      expect(second.spawnTerminal.mock.calls[0]?.[0]?.argv).toEqual(['/usr/bin/fish'])
    } finally {
      if (originalShell === undefined) delete process.env.SHELL
      else process.env.SHELL = originalShell
    }
  })

  it('streams decoded output through read() with consume-on-read semantics', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.write('hello ')
    handle.output.write('world')
    expect(gateway.read(session.sessionId)).toEqual({ delta: 'hello world', truncated: false, exited: false })
    expect(gateway.read(session.sessionId)).toEqual({ delta: '', truncated: false, exited: false })
  })

  it('decodes multibyte characters split across chunks', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.write(Buffer.from('汉', 'utf8').subarray(0, 2))
    expect(gateway.read(session.sessionId).delta).toBe('')
    handle.output.write(Buffer.from('汉', 'utf8').subarray(2))
    expect(gateway.read(session.sessionId).delta).toBe('汉')
  })

  it('keeps a bounded tail and flags truncation once', async () => {
    const { gateway, handle } = await harness({ maxBufferBytes: 8 })
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.write('a'.repeat(20))
    const read = gateway.read(session.sessionId)
    expect(read.truncated).toBe(true)
    expect(read.delta).toBe('aaaaaaaa')
    expect(gateway.read(session.sessionId)).toEqual({ delta: '', truncated: false, exited: false })
  })

  it('reports exited after the output stream ends', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.write('bye')
    handle.output.end()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(gateway.read(session.sessionId)).toEqual({ delta: 'bye', truncated: false, exited: true })
  })

  it('reports exited when done settles', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    expect(gateway.read(session.sessionId).exited).toBe(false)
    handle.settle({ exitCode: 0, signal: null })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(gateway.read(session.sessionId).exited).toBe(true)
  })

  it('reports exited on a transport failure', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.emit('error', new Error('pipe broke'))
    expect(gateway.read(session.sessionId).exited).toBe(true)
  })

  it('forwards write, resize, and signal to the handle until exit', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    await gateway.write(session.sessionId, 'echo hi\n')
    expect(handle.write).toHaveBeenCalledWith('echo hi\n')
    await gateway.resize(session.sessionId, 40, 120)
    expect(handle.resize).toHaveBeenCalledWith(120, 40)
    await gateway.signal(session.sessionId, 'SIGINT')
    expect(handle.signalForeground).toHaveBeenCalledWith('SIGINT')
  })

  it('drops write, resize, and signal after exit', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    handle.output.end()
    await new Promise(resolve => setTimeout(resolve, 0))
    await gateway.write(session.sessionId, 'late')
    await gateway.resize(session.sessionId, 40, 120)
    await gateway.signal(session.sessionId, 'SIGTERM')
    expect(handle.write).not.toHaveBeenCalled()
    expect(handle.resize).not.toHaveBeenCalled()
    expect(handle.signalForeground).not.toHaveBeenCalled()
  })

  it('close terminates the handle and removes the session', async () => {
    const { gateway, handle } = await harness()
    const session = await gateway.spawn({ rows: 24, cols: 80 })
    await gateway.close(session.sessionId)
    expect(handle.terminate).toHaveBeenCalledOnce()
    expect(() => gateway.read(session.sessionId)).toThrow(
      `unknown terminal session: ${session.sessionId}`,
    )
  })

  it('fails loud on unknown sessions for every verb', async () => {
    const { gateway } = await harness()
    await expect(gateway.write('nope' as never, 'x')).rejects.toThrow('unknown terminal session: nope')
    await expect(gateway.resize('nope' as never, 10, 10)).rejects.toThrow('unknown terminal session: nope')
    await expect(gateway.signal('nope' as never, 'SIGINT')).rejects.toThrow('unknown terminal session: nope')
    await expect(gateway.close('nope' as never)).rejects.toThrow('unknown terminal session: nope')
    expect(() => gateway.read('nope' as never)).toThrow('unknown terminal session: nope')
  })

  it('terminates every live session on host dispose', async () => {
    const { ctx, gateway, handle } = await harness()
    const first = await gateway.spawn({ rows: 24, cols: 80 })
    const second = await gateway.spawn({ rows: 24, cols: 80 })
    handle.terminate.mockClear()
    await ctx.fiber.dispose()
    expect(handle.terminate).toHaveBeenCalledTimes(2)
    expect(first.sessionId).toBeTruthy()
    expect(second.sessionId).toBeTruthy()
  })

  it('uses the default grace and buffer when config omits them', async () => {
    const { gateway, spawnTerminal } = await harness()
    await gateway.spawn({ rows: 24, cols: 80 })
    expect(spawnTerminal.mock.calls[0]?.[0]?.graceMs).toBe(1000)
  })
})

describe('terminal-manager plugin identity', () => {
  it('uses the stable plugin name', () => {
    expect(name).toBe('terminal-manager')
  })
})

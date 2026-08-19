import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SHELL_FILL_ALLOWLIST,
  captureExportOutput,
  parseExportOutput,
  recoverShellEnvironment,
  resolveShellPath,
} from '../src/shell-environment.ts'

afterEach(() => {
  vi.useRealTimers()
})

type FakeChild = ChildProcess & { stdout: EventEmitter }
type KillMock = ReturnType<typeof vi.fn>

function fakeChild(output: string, code: number | null): { child: FakeChild; kill: KillMock } {
  const stdout = new EventEmitter()
  const child = new EventEmitter() as unknown as ChildProcess & { stdout: EventEmitter }
  const kill = vi.fn(() => { queueMicrotask(() => child.emit('close', 137, 'SIGKILL')) })
  Object.assign(child, { stdout, kill })
  if (output !== '' || code !== null) {
    queueMicrotask(() => {
      stdout.emit('data', output)
      child.emit('close', code, null)
    })
  }
  return { child, kill }
}

describe('parseExportOutput', () => {
  it('parses bash declare -x lines with double quotes', () => {
    const env = parseExportOutput('declare -x PATH="/usr/bin:/bin"\ndeclare -x LANG="en_US.UTF-8"\n')
    expect(env.get('PATH')).toBe('/usr/bin:/bin')
    expect(env.get('LANG')).toBe('en_US.UTF-8')
  })

  it('parses zsh export lines with single quotes', () => {
    expect(parseExportOutput("export PATH='/opt/homebrew/bin:/usr/bin'\n").get('PATH')).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('unescapes quoted values and keeps empty values', () => {
    const env = parseExportOutput('declare -x FOO="a\\"b\\\\c"\ndeclare -x EMPTY=""\n')
    expect(env.get('FOO')).toBe('a"b\\c')
    expect(env.get('EMPTY')).toBe('')
  })

  it('skips bare names and malformed lines', () => {
    const env = parseExportOutput('declare -x HOME\nexport PATH\ngarbage line\n\n')
    expect(env).toHaveLength(0)
  })
})

describe('resolveShellPath', () => {
  it('accepts an existing supported SHELL', () => {
    expect(resolveShellPath('/bin/zsh', () => true)).toBe('/bin/zsh')
  })

  it('falls back when SHELL is unsupported or missing', () => {
    const existing = ['/bin/zsh']
    const check = (path: string): boolean => existing.includes(path)
    expect(resolveShellPath('/bin/fish', check)).toBe('/bin/zsh')
    expect(resolveShellPath(undefined, check)).toBe('/bin/zsh')
  })

  it('skips a SHELL that does not exist and falls back', () => {
    expect(resolveShellPath('/bin/zsh', () => false)).toBeUndefined()
  })
})

describe('captureExportOutput', () => {
  it('parses captured output on a clean exit', async () => {
    const { child } = fakeChild('export PATH="/usr/bin"\n', 0)
    await expect(captureExportOutput({ shell: '/bin/zsh', spawnChild: () => child }))
      .resolves.toEqual(new Map([['PATH', '/usr/bin']]))
  })

  it('returns undefined on a failing exit', async () => {
    const { child } = fakeChild('export PATH="/usr/bin"\n', 1)
    await expect(captureExportOutput({ shell: '/bin/zsh', spawnChild: () => child })).resolves.toBeUndefined()
  })

  it('returns undefined when the child errors', async () => {
    const child = new EventEmitter() as unknown as ChildProcess
    Object.assign(child, { stdout: new EventEmitter(), kill: vi.fn() })
    const promise = captureExportOutput({ shell: '/bin/zsh', spawnChild: () => child })
    child.emit('error', new Error('spawn ENOENT'))
    await expect(promise).resolves.toBeUndefined()
  })

  it('kills a capture that exceeds the timeout and returns undefined', async () => {
    vi.useFakeTimers()
    const { child, kill } = fakeChild('', null)
    const promise = captureExportOutput({ shell: '/bin/zsh', spawnChild: () => child, timeoutMs: 25 })
    await vi.advanceTimersByTimeAsync(25)
    await expect(promise).resolves.toBeUndefined()
    expect(kill).toHaveBeenCalledOnce()
  })

  it('truncates oversized output and still parses it', async () => {
    const { child, kill } = fakeChild('', null)
    const promise = captureExportOutput({ shell: '/bin/zsh', spawnChild: () => child, maxBytes: 8 })
    child.stdout.emit('data', 'export AB="12345"')
    await expect(promise).resolves.toEqual(new Map())
    expect(kill).toHaveBeenCalledOnce()
  })
})

describe('recoverShellEnvironment', () => {
  it('imports nothing when disabled', async () => {
    const spawnChild = vi.fn()
    const target: Record<string, string | undefined> = { PATH: '/old' }
    await expect(recoverShellEnvironment({ enabled: false, target, spawnChild })).resolves.toEqual([])
    expect(spawnChild).not.toHaveBeenCalled()
  })

  it('imports nothing when no supported shell exists', async () => {
    const target: Record<string, string | undefined> = { PATH: '/old' }
    const imported = await recoverShellEnvironment({ enabled: true, target, shellExists: () => false })
    expect(imported).toEqual([])
    expect(target.PATH).toBe('/old')
  })

  it('imports nothing when the capture fails', async () => {
    const target: Record<string, string | undefined> = { PATH: '/old' }
    const imported = await recoverShellEnvironment({
      enabled: true,
      target,
      shellExists: () => true,
      spawnChild: () => fakeChild('', 1).child,
    })
    expect(imported).toEqual([])
    expect(target.PATH).toBe('/old')
  })

  it('always takes PATH, fills missing allowlisted names, and skips everything else', async () => {
    const target: Record<string, string | undefined> = { PATH: '/old', LANG: 'en_US.UTF-8' }
    const shellEnv = 'export PATH="/usr/bin:/bin"\nexport LANG="zh_CN.UTF-8"\nexport LC_ALL="en_US.UTF-8"\nexport FOO="bar"\n'
    const imported = await recoverShellEnvironment({
      enabled: true,
      target,
      shell: '/bin/zsh',
      shellExists: () => true,
      spawnChild: () => fakeChild(shellEnv, 0).child,
    })
    expect(imported).toEqual(['LC_ALL', 'PATH'])
    expect(target.PATH).toBe('/usr/bin:/bin')
    expect(target.LANG).toBe('en_US.UTF-8')
    expect(target.LC_ALL).toBe('en_US.UTF-8')
    expect(target.FOO).toBeUndefined()
  })

  it('keeps the target PATH when the shell PATH is empty', async () => {
    const target: Record<string, string | undefined> = { PATH: '/old' }
    const imported = await recoverShellEnvironment({
      enabled: true,
      target,
      shellExists: () => true,
      spawnChild: () => fakeChild('export PATH=""\n', 0).child,
    })
    expect(imported).toEqual([])
    expect(target.PATH).toBe('/old')
  })

  it('covers every allowlisted name through the merge path', () => {
    expect(SHELL_FILL_ALLOWLIST.has('PATH')).toBe(false)
    expect(SHELL_FILL_ALLOWLIST.size).toBeGreaterThan(20)
  })
})

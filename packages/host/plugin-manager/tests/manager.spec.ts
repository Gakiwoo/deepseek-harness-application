import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import {
  DEFAULT_MANAGED_PROFILE,
  PNPM_NOT_FOUND_EXIT,
  PluginManagerGateway,
} from '../src/index.ts'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
const { mockedHome } = vi.hoisted(() => ({ mockedHome: '/tmp/mocked-dsh-home' }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ resolveDshHome: () => mockedHome }))

const dirs: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  rmSync(mockedHome, { recursive: true, force: true })
})

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'plugin-manager-'))
  dirs.push(home)
  return home
}

interface Fixture {
  home: string
  profileDir: string
}

/** A profile whose manifest is mutated by the fake pnpm process. */
function fixture(home: string, manifest: object): Fixture {
  const profileDir = join(home, 'profiles', DEFAULT_MANAGED_PROFILE)
  mkdirSync(profileDir, { recursive: true })
  writeManifest(profileDir, manifest)
  return { home, profileDir }
}

function writeManifest(profileDir: string, manifest: object): void {
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

interface TestManifest {
  dependencies: Record<string, string>
  dsh?: { profile: { bundles: string[] } }
}

function readManifest(profileDir: string): TestManifest {
  return JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as TestManifest
}

/** Install a fake bundle into the profile's node_modules. */
function installBundle(profileDir: string, name: string): void {
  const dir = join(profileDir, 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2)}\n`,
  )
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
}

type SpawnImpl = (command: string, args: readonly string[], options: { cwd: string }) => EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
}

/** A fake pnpm child that mutates the profile manifest synchronously. */
function fakePnpm(exitCode: number | null, mutate: (manifest: { dependencies: Record<string, string> }) => void): SpawnImpl {
  return (command, _args, options) => {
    expect(command).toBe('pnpm')
    const profileDir = options.cwd
    const manifest = readManifest(profileDir)
    mutate(manifest)
    writeManifest(profileDir, manifest)
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('pnpm stdout\n'))
      child.stderr.emit('data', Buffer.from('pnpm stderr\n'))
      child.emit('close', exitCode)
    })
    return child
  }
}

async function harness(home: string): Promise<Context> {
  const ctx = new Context()
  dirs.push((ctx as { baseDir?: string }).baseDir ?? home)
  await ctx.plugin(PluginManagerGateway, { profile: DEFAULT_MANAGED_PROFILE, home })
  return ctx
}

describe('PluginManagerGateway', () => {
  it('publishes install and remove under the pluginManager namespace', async () => {
    const home = tempHome()
    fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'pluginManager',
      namespace: 'pluginManager',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'install', invocation: { kind: 'direct' } },
      { method: 'remove', invocation: { kind: 'direct' } },
    ])
  })

  it('installs a bundle and seals it into the layer list on success', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    installBundle(profileDir, '@fake/plugin')
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      manifest.dependencies['@fake/plugin'] = '1.0.0'
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/plugin')

    expect(spawnMock).toHaveBeenCalledWith('pnpm', ['add', '@fake/plugin'], { cwd: profileDir, shell: false, windowsHide: true })
    expect(result).toMatchObject({ ok: true, exitCode: 0, stdout: 'pnpm stdout\n', stderr: 'pnpm stderr\n' })
    expect(result.bundles).toEqual(['@fake/plugin'])
    expect(readManifest(profileDir).dsh?.profile.bundles).toEqual(['@fake/plugin'])
  })

  it('warns about a non-bundle dependency without joining the layer list', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    const dir = join(profileDir, 'node_modules', '@fake/lib')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@fake/lib' })}\n`)
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      manifest.dependencies['@fake/lib'] = '1.0.0'
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/lib')

    expect(result).toMatchObject({ ok: true, exitCode: 0 })
    expect(result.bundles).toEqual([])
    expect(readManifest(profileDir).dsh?.profile.bundles).toEqual([])
  })

  it('removes a bundle and drops it from the layer list on success', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, {
      dependencies: { '@fake/plugin': '1.0.0' },
      dsh: { profile: { bundles: ['@fake/plugin'] } },
    })
    installBundle(profileDir, '@fake/plugin')
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      delete manifest.dependencies['@fake/plugin']
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.remove('@fake/plugin')

    expect(spawnMock).toHaveBeenCalledWith('pnpm', ['remove', '@fake/plugin'], { cwd: profileDir, shell: false, windowsHide: true })
    expect(result).toMatchObject({ ok: true, exitCode: 0 })
    expect(result.bundles).toEqual([])
    expect(readManifest(profileDir).dsh?.profile.bundles).toEqual([])
  })

  it('keeps template bundles that are not dependencies', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, {
      dependencies: { '@fake/plugin': '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@fake/plugin'] } },
    })
    installBundle(profileDir, '@fake/plugin')
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      delete manifest.dependencies['@fake/plugin']
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.remove('@fake/plugin')

    expect(result.ok).toBe(true)
    expect(result.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('restores the pre-spawn snapshot when pnpm fails', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    spawnMock.mockImplementation(fakePnpm(1, (manifest) => {
      manifest.dependencies['@fake/plugin'] = '1.0.0'
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/plugin')

    expect(result).toMatchObject({ ok: false, exitCode: 1, stdout: 'pnpm stdout\n', stderr: 'pnpm stderr\n' })
    expect(result.bundles).toEqual([])
    expect(readManifest(profileDir).dependencies).toEqual({})
  })

  it('reports pnpm missing from PATH without touching the manifest', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    const enoent = new Error('spawn pnpm ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    spawnMock.mockImplementation(() => { throw enoent })

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/plugin')

    expect(result).toEqual({
      ok: false,
      exitCode: PNPM_NOT_FOUND_EXIT,
      stdout: '',
      stderr: 'pnpm not found on PATH — install pnpm to manage profile plugins',
      bundles: [],
    })
    expect(readManifest(profileDir).dependencies).toEqual({})
  })

  it('initializes the profile from its template on first use', async () => {
    const home = tempHome()
    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const profileDir = join(home, 'profiles', DEFAULT_MANAGED_PROFILE)
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      manifest.dependencies['@deepseek-ai/dsh-desktop-app'] = '0.1.0-rc.6'
    }))

    const result = await gateway.install('@deepseek-ai/dsh-desktop-app')

    expect(result).toMatchObject({ ok: true, exitCode: 0 })
    const manifest = readManifest(profileDir)
    expect(manifest.dependencies['@deepseek-ai/dsh-desktop-app']).toBe('0.1.0-rc.6')
  })

  it('falls back to the resolved home and default template for unknown profiles', async () => {
    const ctx = new Context()
    await ctx.plugin(PluginManagerGateway, { profile: 'unknown-profile' })
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const profileDir = join(mockedHome, 'profiles', 'unknown-profile')
    spawnMock.mockImplementation(fakePnpm(0, () => {}))

    const result = await gateway.install('@fake/plugin')

    expect(result).toMatchObject({ ok: true, exitCode: 0 })
    const manifest = readManifest(profileDir)
    expect(manifest.dsh?.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('seals a manifest with neither dependencies nor bundle metadata', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, {})
    spawnMock.mockImplementation(fakePnpm(0, () => {}))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/plugin')

    expect(result).toMatchObject({ ok: true, exitCode: 0 })
    expect(result.bundles).toEqual([])
    expect(readManifest(profileDir)).toEqual({})
  })

  it('warns about an unresolvable dependency instead of joining the layer list', async () => {
    const home = tempHome()
    fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    spawnMock.mockImplementation(fakePnpm(0, (manifest) => {
      manifest.dependencies['@fake/ghost'] = '1.0.0'
    }))
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/ghost')

    expect(result.bundles).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('propagates a spawn failure that is not a missing pnpm', async () => {
    const home = tempHome()
    fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => { child.emit('error', new Error('spawn boom')) })
      return child
    })

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    await expect(gateway.install('@fake/plugin')).rejects.toThrow('spawn boom')
  })

  it('treats a null close code as a failed run', async () => {
    const home = tempHome()
    const { profileDir } = fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    spawnMock.mockImplementation(fakePnpm(null, (manifest) => {
      manifest.dependencies['@fake/plugin'] = '1.0.0'
    }))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    const result = await gateway.install('@fake/plugin')

    expect(result).toMatchObject({ ok: false, exitCode: 1 })
    expect(readManifest(profileDir).dependencies).toEqual({})
  })

  it('anchors relative path specs to the process working directory', async () => {
    const home = tempHome()
    fixture(home, { dependencies: {}, dsh: { profile: { bundles: [] } } })
    spawnMock.mockImplementation(fakePnpm(0, () => {}))

    const ctx = await harness(home)
    const gateway = ctx.get('pluginManager') as PluginManagerGateway
    await gateway.install('./plugin')

    const [, args] = spawnMock.mock.calls[0]! as [string, readonly string[]]
    expect((args as string[])[0]).toBe('add')
    expect((args as string[])[1]).toBe(join(process.cwd(), 'plugin'))
    expect((args as string[])[1]!.startsWith('/')).toBe(true)
  })
})

describe('PluginManagerGateway invariant companion', () => {
  it('registers the package-owned empty installer', async () => {
    const { apply } = await import('../src/invariant.ts')
    const ctx = new Context()
    const registered: string[] = []
    ctx.invariants = { register: (pkg: string) => { registered.push(pkg); return () => {} } } as never
    const dispose = await apply(ctx)
    expect(registered).toContain('@deepseek-ai/dsh-host-plugin-manager')
    dispose()
  })
})

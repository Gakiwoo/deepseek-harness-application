/** Branch coverage for desktop host composition and optional live-reload services. */

import { FiberState, type Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bootDesktopHost } from '../src/host-boot.ts'
import type { DesktopRuntime } from '../src/index.ts'

const mocks = vi.hoisted(() => ({
  boot: vi.fn(),
  composeEntries: vi.fn(),
  healProfilesModuleFallback: vi.fn(),
  loadLayeredEnv: vi.fn(),
  loadOptionalPatches: vi.fn(),
  loadProfile: vi.fn(),
  provideCmdline: vi.fn(),
  resolveDshHome: vi.fn(),
  watchUserPatches: vi.fn(),
  assertDesktopTree: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('@deepseek-ai/dsh-app-boot', () => ({
  boot: mocks.boot,
  composeEntries: mocks.composeEntries,
  healProfilesModuleFallback: mocks.healProfilesModuleFallback,
  loadLayeredEnv: mocks.loadLayeredEnv,
  loadOptionalPatches: mocks.loadOptionalPatches,
  loadProfile: mocks.loadProfile,
  PROFILE_PATCH_FILENAME: 'cordis.patch.yml',
  watchUserPatches: mocks.watchUserPatches,
}))
vi.mock('@deepseek-ai/dsh-home-paths', () => ({ resolveDshHome: mocks.resolveDshHome }))
vi.mock('@deepseek-ai/dsh-cmdline', () => ({ provideCmdline: mocks.provideCmdline }))
vi.mock('../src/invariant.ts', () => ({ assertDesktopTree: mocks.assertDesktopTree }))
vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  writeFileSync: mocks.writeFileSync,
}))

const runtime: DesktopRuntime = {
  fetch: async () => new Response('ok'),
  graph: () => ({ rev: 'test', entries: [] }),
  clientPath: () => undefined,
  frontendIndex: () => '/frontend/index.html',
}

interface FakeHost {
  context: Context
  create: ReturnType<typeof vi.fn>
  services: Map<string, unknown>
  dispose: ReturnType<typeof vi.fn>
}

function fakeHost(options: {
  active?: boolean
  loader?: boolean
  hmr?: boolean
  timer?: boolean
} = {}): FakeHost {
  const services = new Map<string, unknown>()
  const create = vi.fn(async ({ name }: { name: string }) => {
    if (name.endsWith('timer')) services.set('timer', {})
    if (name.endsWith('hmr')) services.set('hmr', {})
  })
  const dispose = vi.fn(async () => {})
  const candidate = {
    desktopRuntime: runtime,
    loader: { create },
    fiber: {
      state: options.active === false ? FiberState.DISPOSED : FiberState.ACTIVE,
      dispose,
    },
    get: (key: string) => services.get(key),
    provide: (key: string, value: unknown) => { services.set(key, value) },
  }
  if (options.loader !== false) services.set('loader', candidate.loader)
  if (options.hmr === true) services.set('hmr', {})
  if (options.timer === true) services.set('timer', {})
  return { context: candidate as unknown as Context, create, services, dispose }
}

interface TestState {
  host: FakeHost
  profilePatches: ReadonlyArray<{ id: string }>
  optionalPatches: ReadonlyArray<{ id: string }> | undefined
  exit?: (code: number) => void
}

let state: TestState

beforeEach(() => {
  vi.clearAllMocks()
  state = {
    host: fakeHost(),
    profilePatches: [{ id: 'desktop-runtime' }],
    optionalPatches: undefined,
  }
  mocks.resolveDshHome.mockReturnValue('/default-home')
  mocks.loadProfile.mockImplementation(() => ({
    dir: '/profile',
    patchPath: '/profile/cordis.patch.yml',
    layers: [{ patches: [] }],
    patches: state.profilePatches,
  }))
  mocks.loadOptionalPatches.mockImplementation(() => state.optionalPatches)
  mocks.composeEntries.mockImplementation((layers: ReadonlyArray<ReadonlyArray<{ id: string }>>) => layers.flat())
  mocks.loadLayeredEnv.mockReturnValue({})
  mocks.provideCmdline.mockImplementation((_ctx: unknown, options: { exit(code: number): void }) => {
    state.exit = (code) => { options.exit(code) }
  })
  mocks.boot.mockImplementation(async (
    _name: string,
    _filename: string,
    _patches: unknown,
    setup: (ctx: Context) => void,
  ) => {
    setup(state.host.context)
    return state.host.context
  })
  mocks.watchUserPatches.mockImplementation(async (
    _ctx: unknown,
    options: { compose(): unknown },
  ) => { options.compose() })
})

describe('bootDesktopHost optional branches', () => {
  it('uses the default home, overlays the runtime, and creates live-reload services', async () => {
    const handle = await bootDesktopHost({ frontendIndexPath: '/frontend/index.html' })
    expect(mocks.resolveDshHome).toHaveBeenCalledOnce()
    expect(state.host.create).toHaveBeenNthCalledWith(1, { name: '@deepseek-ai/cordis-plugin-timer' })
    expect(state.host.create).toHaveBeenNthCalledWith(2, {
      name: '@deepseek-ai/cordis-plugin-hmr',
      config: { root: [] },
    })
    state.exit?.(0)
    await handle.dispose()
    expect(state.host.dispose).toHaveBeenCalledOnce()
  })

  it.each([
    { loader: false, active: true },
    { loader: true, active: false },
  ])('skips live reload when loader=$loader and active=$active', async ({ loader, active }) => {
    state.host = fakeHost({ loader, active })
    state.profilePatches = []
    const requestExit = vi.fn()
    await bootDesktopHost({
      home: '/custom-home',
      frontendIndexPath: '/frontend/index.html',
      requestExit,
    })
    state.exit?.(7)
    expect(requestExit).toHaveBeenCalledWith(7)
    expect(mocks.watchUserPatches).not.toHaveBeenCalled()
  })

  it('reuses an existing HMR service', async () => {
    state.host = fakeHost({ hmr: true })
    await bootDesktopHost({ home: '/home', frontendIndexPath: '/frontend/index.html' })
    expect(state.host.create).not.toHaveBeenCalled()
  })

  it('reuses an existing timer when adding HMR', async () => {
    state.host = fakeHost({ timer: true })
    await bootDesktopHost({ home: '/home', frontendIndexPath: '/frontend/index.html' })
    expect(state.host.create).toHaveBeenCalledOnce()
    expect(state.host.create).toHaveBeenCalledWith({
      name: '@deepseek-ai/cordis-plugin-hmr',
      config: { root: [] },
    })
  })

  it('propagates watcher failures while the loader remains mounted', async () => {
    mocks.watchUserPatches.mockRejectedValueOnce(new Error('watch failed'))
    await expect(bootDesktopHost({ home: '/home', frontendIndexPath: '/frontend/index.html' }))
      .rejects.toThrow('watch failed')
  })

  it('swallows watcher failure after the loader is removed by disposal', async () => {
    mocks.watchUserPatches.mockImplementationOnce(async () => {
      state.host.services.delete('loader')
      throw new Error('disposed during setup')
    })
    await expect(bootDesktopHost({ home: '/home', frontendIndexPath: '/frontend/index.html' }))
      .resolves.toMatchObject({ runtime })
  })
})

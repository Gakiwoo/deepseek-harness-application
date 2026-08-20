import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  createDesktopUpdater,
  DesktopUpdateError,
  downloadUpdate,
  parseChecksum,
  planApply,
  selectUpdate,
  versionFromTag,
  type DesktopUpdateAsset,
  type DesktopUpdateInfo,
  type DesktopUpdateNative,
  type DesktopUpdateRelease,
} from '../src/updates.ts'

const ZIP_ARTIFACT = 'DeepSeek-Harness-0.2.0-mac-arm64.zip'
const DMG_ARTIFACT = 'DeepSeek-Harness-0.2.0-mac-arm64.dmg'
const EXE_ARTIFACT = 'DeepSeek-Harness-0.2.0-win-x64.exe'

function release(overrides: Partial<DesktopUpdateRelease> = {}): DesktopUpdateRelease {
  const assets: DesktopUpdateAsset[] = overrides.assets ?? [
    { name: ZIP_ARTIFACT, url: `https://example.com/${ZIP_ARTIFACT}`, size: 100 },
    { name: `${ZIP_ARTIFACT}.sha256`, url: `https://example.com/${ZIP_ARTIFACT}.sha256`, size: 64 },
  ]
  return {
    tagName: 'v0.2.0',
    publishedAt: '2026-08-01T00:00:00Z',
    prerelease: false,
    assets,
    ...overrides,
  }
}

function info(overrides: Partial<DesktopUpdateInfo> = {}): DesktopUpdateInfo {
  return {
    version: '0.2.0',
    releaseName: 'v0.2.0',
    publishedAt: '2026-08-01T00:00:00Z',
    artifact: {
      name: ZIP_ARTIFACT,
      url: `https://example.com/${ZIP_ARTIFACT}`,
      size: 100,
      kind: 'zip',
      checksumUrl: `https://example.com/${ZIP_ARTIFACT}.sha256`,
    },
    ...overrides,
  }
}

function sha256Of(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function fakeNative(overrides: Partial<DesktopUpdateNative> = {}): DesktopUpdateNative {
  return {
    fetch: vi.fn(),
    spawn: vi.fn(),
    env: {},
    plistBundleVersion: () => '0.2.0',
    ...overrides,
  }
}

describe('update selection', () => {
  it('picks the newest channel-eligible zip for the platform', () => {
    const selected = selectUpdate(
      [
        release({ tagName: 'v0.1.9' }),
        release(),
      ],
      'darwin',
      'arm64',
      '0.1.0-rc.6',
    )
    expect(selected?.version).toBe('0.2.0')
    expect(selected?.artifact.kind).toBe('zip')
  })

  it('keeps prereleases invisible on a stable channel', () => {
    const selected = selectUpdate(
      [release({ tagName: 'v0.2.0', prerelease: true })],
      'darwin',
      'arm64',
      '0.1.0',
    )
    expect(selected).toBeUndefined()
  })

  it('returns undefined when up to date', () => {
    expect(selectUpdate([release({ tagName: 'v0.1.0' })], 'darwin', 'arm64', '0.1.0')).toBeUndefined()
  })

  it('prefers the zip over the dmg on macOS', () => {
    const selected = selectUpdate(
      [release({ assets: [
        { name: DMG_ARTIFACT, url: `https://example.com/${DMG_ARTIFACT}`, size: 100 },
        { name: `${DMG_ARTIFACT}.sha256`, url: `https://example.com/${DMG_ARTIFACT}.sha256`, size: 64 },
        { name: ZIP_ARTIFACT, url: `https://example.com/${ZIP_ARTIFACT}`, size: 100 },
        { name: `${ZIP_ARTIFACT}.sha256`, url: `https://example.com/${ZIP_ARTIFACT}.sha256`, size: 64 },
      ] })],
      'darwin',
      'arm64',
      '0.1.0',
    )
    expect(selected?.artifact.kind).toBe('zip')
  })

  it('matches the win installer artifact', () => {
    const selected = selectUpdate(
      [release({ assets: [
        { name: EXE_ARTIFACT, url: `https://example.com/${EXE_ARTIFACT}`, size: 100 },
        { name: `${EXE_ARTIFACT}.sha256`, url: `https://example.com/${EXE_ARTIFACT}.sha256`, size: 64 },
      ] })],
      'win32',
      'x64',
      '0.1.0',
    )
    expect(selected?.artifact.kind).toBe('exe')
  })

  it('fails loud when a release ships an artifact without its checksum sidecar', () => {
    expect(() =>
      selectUpdate(
        [release({ assets: [{ name: ZIP_ARTIFACT, url: 'https://example.com/z', size: 100 }] })],
        'darwin',
        'arm64',
        '0.1.0',
      ),
    ).toThrow(DesktopUpdateError)
  })

  it('fails loud when the newest release has no artifact for this platform', () => {
    expect(() =>
      selectUpdate([release({ assets: [{ name: 'other.tgz', url: 'https://example.com/o', size: 1 }] })], 'darwin', 'arm64', '0.1.0'),
    ).toThrow(/ships no darwin artifact/)
  })

  it('ignores tags that are not versions and unknown platforms', () => {
    expect(selectUpdate([release({ tagName: 'housekeeping' })], 'darwin', 'arm64', '0.1.0')).toBeUndefined()
    expect(() => selectUpdate([release()], 'linux', 'x64', '0.1.0')).toThrow(/not offered on linux/)
  })

  it('extracts versions from tagged and bare tags', () => {
    expect(versionFromTag('v0.1.0-rc.6')).toBe('0.1.0-rc.6')
    expect(versionFromTag('0.1.0')).toBe('0.1.0')
    expect(versionFromTag('junk')).toBeUndefined()
  })

  it('parses shasum sidecar content', () => {
    expect(parseChecksum(`${'a'.repeat(64)}  DeepSeek-Harness-0.2.0-mac-arm64.zip\n`)).toBe('a'.repeat(64))
    expect(() => parseChecksum('not a checksum')).toThrow(DesktopUpdateError)
  })
})

describe('download with checksum verification', () => {
  it('streams, verifies, and atomically renames the artifact', async () => {
    const content = new TextEncoder().encode('artifact-bytes')
    const digest = sha256Of(content)
    const native = fakeNative({
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('.sha256')) {
          return new Response(`${digest}  ${ZIP_ARTIFACT}\n`, { status: 200 })
        }
        return new Response(Readable.toWeb(Readable.from([content])) as BodyInit, { status: 200 })
      }),
    })
    const directory = mkdtempSync(join(tmpdir(), 'dsh-updates-'))
    const progress = vi.fn()

    const path = await downloadUpdate(native, info(), directory, progress)

    expect(path).toBe(join(directory, ZIP_ARTIFACT))
    expect(readFileSync(path)).toEqual(Buffer.from(content))
    expect(existsSync(join(directory, `${ZIP_ARTIFACT}.part`))).toBe(false)
    expect(progress).toHaveBeenCalledWith({ received: content.length, total: 100 })
  })

  it('rejects a mismatched digest and removes the partial file', async () => {
    const content = new TextEncoder().encode('artifact-bytes')
    const native = fakeNative({
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('.sha256')) {
          return new Response(`${'b'.repeat(64)}  ${ZIP_ARTIFACT}\n`, { status: 200 })
        }
        return new Response(Readable.toWeb(Readable.from([content])) as BodyInit, { status: 200 })
      }),
    })
    const directory = mkdtempSync(join(tmpdir(), 'dsh-updates-'))

    await expect(downloadUpdate(native, info(), directory)).rejects.toThrow(/does not match/)
    expect(existsSync(join(directory, `${ZIP_ARTIFACT}.part`))).toBe(false)
    expect(existsSync(join(directory, ZIP_ARTIFACT))).toBe(false)
  })

  it('fails loud on a missing or failing checksum sidecar', async () => {
    const native = fakeNative({
      fetch: vi.fn(async () => new Response('gone', { status: 404 })),
    })
    await expect(downloadUpdate(native, info(), mkdtempSync(join(tmpdir(), 'dsh-updates-')))).rejects.toThrow(
      /checksum sidecar responded 404/,
    )
  })
})

describe('apply planning and staging', () => {
  it('plans a swap for a macOS zip and rejects a dmg', () => {
    expect(planApply(info(), 'darwin')).toBe('swap')
    expect(planApply(info({ artifact: { ...info().artifact, kind: 'dmg' } }), 'darwin')).toBe('unsupported')
    expect(planApply(info({ artifact: { ...info().artifact, kind: 'exe' } }), 'win32')).toBe('silent-install')
    expect(planApply(info(), 'linux')).toBe('unsupported')
  })

  it('stages a macOS zip by extraction and version verification', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const artifactDir = mkdtempSync(join(tmpdir(), 'dsh-artifacts-'))
    const artifactPath = join(artifactDir, ZIP_ARTIFACT)
    writeFileSync(artifactPath, 'zip')

    const spawn = vi.fn((command: string, args: string[]) => {
      if (command === 'ditto' && args[0] === '-x') {
        mkdirSync(join(args[3], 'DeepSeek Harness.app', 'Contents'), { recursive: true })
      }
      return { on: (_event: string, listener: (code: number) => void) => { listener(0) }, unref: vi.fn() }
    })
    const plistBundleVersion = vi.fn(() => '0.2.0')
    const updater = createDesktopUpdater(fakeNative({ spawn, plistBundleVersion }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir,
    })

    await updater.stage(info(), artifactPath)

    expect(spawn).toHaveBeenCalledWith('ditto', ['-x', '-k', artifactPath, join(userDataDir, 'updates', 'extracted-0.2.0')])
    expect(spawn).toHaveBeenCalledWith('xattr', ['-dr', 'com.apple.quarantine', join(userDataDir, 'updates', 'extracted-0.2.0', 'DeepSeek Harness.app')])
    expect(plistBundleVersion).toHaveBeenCalledWith(join(userDataDir, 'updates', 'extracted-0.2.0', 'DeepSeek Harness.app'))
    expect(updater.pendingUpdate()?.version).toBe('0.2.0')
  })

  it('rejects a staged bundle whose version does not match the release', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const artifactPath = join(mkdtempSync(join(tmpdir(), 'dsh-artifacts-')), ZIP_ARTIFACT)
    writeFileSync(artifactPath, 'zip')
    const updater = createDesktopUpdater(fakeNative({
      spawn: (command: string, args: string[]) => {
        if (command === 'ditto') mkdirSync(join(args[3], 'DeepSeek Harness.app'), { recursive: true })
        return { on: (_event: string, listener: (code: number) => void) => { listener(0) }, unref: vi.fn() }
      },
      plistBundleVersion: () => '0.1.9',
    }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir,
    })

    await expect(updater.stage(info(), artifactPath)).rejects.toThrow(/does not match release 0.2.0/)
    expect(updater.pendingUpdate()).toBeUndefined()
  })
})

describe('clean-exit apply', () => {
  it('swaps the running macOS bundle and clears the pending marker', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updatesDir = join(userDataDir, 'updates')
    const currentAppDir = mkdtempSync(join(tmpdir(), 'dsh-apps-'))
    const currentAppPath = join(currentAppDir, 'DeepSeek Harness.app')
    const stagedAppPath = join(updatesDir, 'extracted-0.2.0', 'DeepSeek Harness.app')
    mkdirSync(join(stagedAppPath, 'Contents'), { recursive: true })
    writeFileSync(join(stagedAppPath, 'Contents', 'Info.plist'), 'new')
    mkdirSync(join(currentAppPath, 'Contents'), { recursive: true })
    writeFileSync(join(currentAppPath, 'Contents', 'Info.plist'), 'old')
    writeFileSync(join(updatesDir, 'pending.json'), JSON.stringify(info()))

    const spawn = vi.fn((command: string, args: string[]) => {
      if (command === 'ditto' && args.length === 2) cpSync(args[0], args[1], { recursive: true })
      return { on: (_event: string, listener: (code: number) => void) => { listener(0) }, unref: vi.fn() }
    })
    const updater = createDesktopUpdater(fakeNative({ spawn }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath,
      userDataDir,
    })

    await updater.applyPending()

    expect(readFileSync(join(currentAppPath, 'Contents', 'Info.plist'), 'utf8')).toBe('new')
    expect(existsSync(join(currentAppDir, 'DeepSeek Harness.app.old'))).toBe(false)
    expect(existsSync(join(updatesDir, 'pending.json'))).toBe(false)
    expect(existsSync(join(updatesDir, 'extracted-0.2.0'))).toBe(false)
  })

  it('rolls back the swap when moving the staged copy fails', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updatesDir = join(userDataDir, 'updates')
    const currentAppDir = mkdtempSync(join(tmpdir(), 'dsh-apps-'))
    const currentAppPath = join(currentAppDir, 'DeepSeek Harness.app')
    const stagedAppPath = join(updatesDir, 'extracted-0.2.0', 'DeepSeek Harness.app')
    mkdirSync(join(stagedAppPath, 'Contents'), { recursive: true })
    mkdirSync(join(currentAppPath, 'Contents'), { recursive: true })
    writeFileSync(join(currentAppPath, 'Contents', 'Info.plist'), 'old')
    writeFileSync(join(updatesDir, 'pending.json'), JSON.stringify(info()))

    const spawn = vi.fn((command: string, args: string[]) => {
      if (command === 'ditto' && args.length === 2) {
        cpSync(args[0], args[1], { recursive: true })
        chmodSync(currentAppDir, 0o500)
      }
      return { on: (_event: string, listener: (code: number) => void) => { listener(0) }, unref: vi.fn() }
    })
    const updater = createDesktopUpdater(fakeNative({ spawn }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath,
      userDataDir,
    })

    await expect(updater.applyPending()).rejects.toThrow(DesktopUpdateError)
    expect(existsSync(currentAppPath)).toBe(true)
    expect(existsSync(join(updatesDir, 'pending.json'))).toBe(true)
    chmodSync(currentAppDir, 0o700)
  })

  it('spawns the silent installer on Windows and consumes the marker', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updatesDir = join(userDataDir, 'updates')
    mkdirSync(updatesDir, { recursive: true })
    writeFileSync(join(updatesDir, EXE_ARTIFACT), 'installer')
    writeFileSync(join(updatesDir, 'pending.json'), JSON.stringify(info({
      artifact: { ...info().artifact, name: EXE_ARTIFACT, kind: 'exe' },
    })))

    const spawn = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }))
    const updater = createDesktopUpdater(fakeNative({ spawn }), {
      enabled: true,
      platform: 'win32',
      arch: 'x64',
      currentVersion: '0.1.0',
      currentAppPath: 'C:\\DeepSeek Harness',
      userDataDir,
    })

    await updater.applyPending()

    expect(spawn).toHaveBeenCalledWith(join(updatesDir, EXE_ARTIFACT), ['/S'], { detached: true, stdio: 'ignore' })
    expect(existsSync(join(updatesDir, 'pending.json'))).toBe(false)
  })

  it('no-ops without a pending marker and cancels cleanly', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updater = createDesktopUpdater(fakeNative(), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir,
    })
    await expect(updater.applyPending()).resolves.toBeUndefined()
    updater.cancelPending()
  })

  it('rejects checks and applies when disabled', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updatesDir = join(userDataDir, 'updates')
    mkdirSync(updatesDir, { recursive: true })
    writeFileSync(join(updatesDir, 'pending.json'), JSON.stringify(info()))
    const updater = createDesktopUpdater(fakeNative(), {
      enabled: false,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir,
    })
    await expect(updater.check()).rejects.toThrow(/disabled/)
    await expect(updater.applyPending()).rejects.toThrow(/disabled/)
  })

  it('honors the repository override from the environment', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('/repos/owner/repo/releases')
      return new Response(JSON.stringify([]), { status: 200 })
    })
    const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-userdata-'))
    const updater = createDesktopUpdater(fakeNative({
      fetch: fetchMock,
      env: { DSH_DESKTOP_UPDATE_REPOSITORY: 'owner/repo' },
    }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir,
    })
    await updater.check()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('fails loud on a non-OK feed response', async () => {
    const updater = createDesktopUpdater(fakeNative({
      fetch: vi.fn(async () => new Response('rate-limited', { status: 403 })),
    }), {
      enabled: true,
      platform: 'darwin',
      arch: 'arm64',
      currentVersion: '0.1.0',
      currentAppPath: join('/Applications', 'DeepSeek Harness.app'),
      userDataDir: mkdtempSync(join(tmpdir(), 'dsh-userdata-')),
    })
    await expect(updater.check()).rejects.toThrow(/feed responded 403/)
  })
})

/** verify-packaged-runtime: artifact locating and startup-state parsing. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  hasDisplay,
  locatePackagedApp,
  startupStateFile,
  startupStateIsGood,
} from './verify-packaged-runtime.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verify-packed-'))
  dirs.push(dir)
  return dir
}

describe('locatePackagedApp', () => {
  it('locates the macOS app bundle and its resources', () => {
    const dist = tempDir()
    mkdirSync(join(dist, 'mac', 'DeepSeek Harness.app', 'Contents', 'MacOS'), { recursive: true })
    const app = locatePackagedApp(dist, 'darwin')
    expect(app).toEqual({
      executable: join(dist, 'mac', 'DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness'),
      resources: join(dist, 'mac', 'DeepSeek Harness.app', 'Contents', 'Resources'),
    })
  })

  it('locates the Windows unpacked executable', () => {
    const dist = tempDir()
    mkdirSync(join(dist, 'win-unpacked'))
    writeFileSync(join(dist, 'win-unpacked', 'DeepSeek Harness.exe'), '')
    const app = locatePackagedApp(dist, 'win32')
    expect(app).toEqual({
      executable: join(dist, 'win-unpacked', 'DeepSeek Harness.exe'),
      resources: join(dist, 'win-unpacked', 'resources'),
    })
  })

  it('reports undefined when the builder output is absent', () => {
    expect(locatePackagedApp(join(tempDir(), 'missing'), 'darwin')).toBeUndefined()
    expect(locatePackagedApp(tempDir(), 'win32')).toBeUndefined()
    expect(locatePackagedApp(tempDir(), 'linux')).toBeUndefined()
  })
})

describe('startup state', () => {
  it('committed lastGood counts as ready', () => {
    const dir = tempDir()
    const file = startupStateFile(dir)
    writeFileSync(file, JSON.stringify({ pending: 'x', lastGood: { launchId: 'x', at: 'now' } }))
    expect(startupStateIsGood(file)).toBe(true)
  })

  it('pending-only, missing, or unparseable files are not ready', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'pending.json'), JSON.stringify({ pending: 'x' }))
    expect(startupStateIsGood(join(dir, 'pending.json'))).toBe(false)
    expect(startupStateIsGood(join(dir, 'missing.json'))).toBe(false)
    writeFileSync(join(dir, 'broken.json'), '{oops')
    expect(startupStateIsGood(join(dir, 'broken.json'))).toBe(false)
  })
})

describe('hasDisplay', () => {
  it('always has a display outside headless Linux', () => {
    expect(hasDisplay('darwin', {})).toBe(true)
    expect(hasDisplay('win32', {})).toBe(true)
  })

  it('requires a display variable on Linux', () => {
    expect(hasDisplay('linux', {})).toBe(false)
    expect(hasDisplay('linux', { DISPLAY: ':0' })).toBe(true)
    expect(hasDisplay('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(true)
  })
})

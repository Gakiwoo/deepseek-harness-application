import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCrashEvidence,
  crashEvidenceDir,
  writeCrashEvidence,
  type CrashEvidence,
} from '../src/crash-evidence.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crash-evidence-'))
  dirs.push(dir)
  return dir
}

const versions = { node: '24.0.0', electron: '38.0.0', chrome: '138.0.0' } as NodeJS.ProcessVersions

describe('buildCrashEvidence', () => {
  it('captures the failure facts and environment', () => {
    const evidence = buildCrashEvidence({
      reason: 'Startup failure',
      detail: 'Error: boom',
      appVersion: '0.1.0-rc.6',
      platform: 'darwin',
      arch: 'arm64',
      packaged: true,
      env: { DSH_HOME: '/tmp/custom-home', PATH: '/usr/bin:/bin' },
      versions,
      uptimeMs: 1234,
    })
    expect(evidence).toMatchObject({
      reason: 'Startup failure',
      detail: 'Error: boom',
      appVersion: '0.1.0-rc.6',
      electronVersion: '38.0.0',
      chromeVersion: '138.0.0',
      nodeVersion: '24.0.0',
      platform: 'darwin',
      arch: 'arm64',
      packaged: true,
      uptimeMs: 1234,
      dshHome: '/tmp/custom-home',
      path: '/usr/bin:/bin',
    })
    expect(new Date(evidence.at).getTime()).toBeGreaterThan(0)
  })

  it('omits detail and Electron versions when absent', () => {
    const evidence = buildCrashEvidence({
      reason: 'renderer crashed',
      appVersion: '0.1.0-rc.6',
      platform: 'win32',
      arch: 'x64',
      packaged: false,
      env: {},
      versions: { node: '24.0.0' } as NodeJS.ProcessVersions,
      uptimeMs: 0,
    })
    expect(evidence.detail).toBeUndefined()
    expect(evidence.electronVersion).toBeUndefined()
    expect(evidence.chromeVersion).toBeUndefined()
    expect(evidence.dshHome).toMatch(/\.dsh$/)
    expect(evidence.path).toBe('')
  })
})

describe('crashEvidenceDir', () => {
  it('resolves under the DSH_HOME override', () => {
    expect(crashEvidenceDir({ DSH_HOME: '/tmp/custom-home' })).toBe('/tmp/custom-home/diagnostics')
  })

  it('resolves under the default home when DSH_HOME is blank', () => {
    expect(crashEvidenceDir({ DSH_HOME: '   ' })).toMatch(/[\\/]\.dsh[\\/]diagnostics$/)
  })
})

describe('writeCrashEvidence', () => {
  it('creates the directory and persists parseable JSON', () => {
    const dir = tempDir()
    const evidence: CrashEvidence = {
      at: '2026-08-20T00:00:00.000Z',
      reason: 'renderer crashed',
      appVersion: '0.1.0-rc.6',
      nodeVersion: '24.0.0',
      platform: 'darwin',
      arch: 'arm64',
      packaged: true,
      uptimeMs: 12,
      home: '/Users/me',
      dshHome: '/Users/me/.dsh',
      path: '/usr/bin',
    }
    const file = writeCrashEvidence(dir, evidence)
    expect(file).toBe(join(dir, 'crash-2026-08-20T00-00-00-000Z.json'))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(evidence)
  })

  it('writes sibling snapshots without overwriting', () => {
    const dir = tempDir()
    const base = {
      at: '2026-08-20T00:00:00.000Z',
      reason: 'x',
      appVersion: '0.1.0-rc.6',
      nodeVersion: '24.0.0',
      platform: 'darwin',
      arch: 'arm64',
      packaged: true,
      uptimeMs: 0,
      home: '/Users/me',
      dshHome: '/Users/me/.dsh',
      path: '/usr/bin',
    }
    writeCrashEvidence(dir, base)
    writeCrashEvidence(dir, { ...base, at: '2026-08-20T00:00:01.000Z' })
    expect(existsSync(join(dir, 'crash-2026-08-20T00-00-00-000Z.json'))).toBe(true)
    expect(existsSync(join(dir, 'crash-2026-08-20T00-00-01-000Z.json'))).toBe(true)
  })
})

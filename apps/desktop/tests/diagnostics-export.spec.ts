import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import {
  collectDiagnosticsFacts,
  diagnosticsExportDir,
  exportDiagnosticsArchive,
  type ArchiveSpawn,
} from '../src/diagnostics-export.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'diagnostics-export-'))
  dirs.push(dir)
  return dir
}

const versions = { node: '24.0.0' } as NodeJS.ProcessVersions
const options = {
  appVersion: '0.1.0-rc.6',
  platform: 'darwin' as const,
  arch: 'arm64',
  packaged: true,
  env: { DSH_HOME: '/tmp/custom-home', PATH: '/usr/bin:/bin' },
  versions,
  uptimeMs: 1234,
}

/** A fake tar child that records argv and resolves the given exit code. */
function fakeTar(exitCode: number | null): { spawnChild: ArchiveSpawn; calls: string[][] } {
  const calls: string[][] = []
  const spawnChild: ArchiveSpawn = (argv) => {
    calls.push([...argv])
    const child = new EventEmitter() as ChildProcess
    if (exitCode === null) {
      setImmediate(() => { child.emit('error', new Error('spawn tar ENOENT')) })
    } else {
      setImmediate(() => { child.emit('close', exitCode) })
    }
    return child
  }
  return { spawnChild, calls }
}

describe('diagnosticsExportDir', () => {
  it('resolves the exports directory under the Harness home', () => {
    expect(diagnosticsExportDir({ DSH_HOME: '/tmp/custom-home' })).toBe('/tmp/custom-home/exports')
  })
})

describe('collectDiagnosticsFacts', () => {
  it('adds the session-log listing to the environment facts', () => {
    const root = tempDir()
    const sessions = join(root, 'sessions')
    mkdirSync(sessions)
    writeFileSync(join(sessions, 'b.jsonl'), '{}')
    writeFileSync(join(sessions, 'a.jsonl'), '{}')
    const facts = collectDiagnosticsFacts(options, sessions)
    expect(facts).toMatchObject({
      dshHome: '/tmp/custom-home',
      path: '/usr/bin:/bin',
      sessionLogs: ['a.jsonl', 'b.jsonl'],
    })
  })

  it('reports no session logs when the directory is absent', () => {
    expect(collectDiagnosticsFacts(options, join(tempDir(), 'missing')).sessionLogs).toEqual([])
  })
})

describe('exportDiagnosticsArchive', () => {
  it('archives the existing members and stages the facts file', async () => {
    const home = tempDir()
    const sessions = join(home, 'sessions')
    mkdirSync(sessions)
    writeFileSync(join(sessions, 'x.jsonl'), '{}')
    const { spawnChild, calls } = fakeTar(0)

    const output = await exportDiagnosticsArchive(home, collectDiagnosticsFacts(options, sessions), spawnChild)

    expect(calls).toEqual([
      ['-czf', output, '-C', home, 'diagnostics', 'sessions'],
    ])
    expect(output.startsWith(join(home, 'exports', 'diagnostics-'))).toBe(true)
    expect(output.endsWith('.tar.gz')).toBe(true)
    const facts = JSON.parse(readFileSync(join(home, 'diagnostics', 'export-facts.json'), 'utf8')) as {
      sessionLogs: string[]
    }
    expect(facts.sessionLogs).toEqual(['x.jsonl'])
  })

  it('skips the missing sessions directory and still ships the facts file', async () => {
    const home = tempDir()
    const { spawnChild, calls } = fakeTar(0)

    await exportDiagnosticsArchive(home, collectDiagnosticsFacts(options, join(home, 'sessions')), spawnChild)

    expect(calls).toEqual([
      ['-czf', expect.stringContaining('diagnostics-'), '-C', home, 'diagnostics'],
    ])
  })

  it('fails loud when tar exits non-zero', async () => {
    const home = tempDir()
    const { spawnChild } = fakeTar(2)
    await expect(
      exportDiagnosticsArchive(home, collectDiagnosticsFacts(options, join(home, 'sessions')), spawnChild),
    ).rejects.toThrow('tar exited with code 2')
  })

  it('rejects when the tar process cannot spawn', async () => {
    const home = tempDir()
    const { spawnChild } = fakeTar(null)
    await expect(
      exportDiagnosticsArchive(home, collectDiagnosticsFacts(options, join(home, 'sessions')), spawnChild),
    ).rejects.toThrow('spawn tar ENOENT')
  })
})

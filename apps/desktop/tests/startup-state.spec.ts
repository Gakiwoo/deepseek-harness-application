import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  beginStartup,
  commitStartup,
  readStartupState,
  writeStartupState,
} from '../src/startup-state.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempStateFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'startup-state-'))
  dirs.push(dir)
  return join(dir, 'startup-state.json')
}

describe('startup state', () => {
  it('records a fresh launch as pending without reporting recovery', () => {
    const stateFile = tempStateFile()
    const result = beginStartup(stateFile, 'launch-1', 1000)
    expect(result).toEqual({ recovered: false })
    expect(readStartupState(stateFile)).toEqual({
      pending: { launchId: 'launch-1', at: 1000 },
    })
  })

  it('reports recovery when the previous launch left a stale pending', () => {
    const stateFile = tempStateFile()
    beginStartup(stateFile, 'launch-1', 1000)
    const result = beginStartup(stateFile, 'launch-2', 2000)
    expect(result).toEqual({
      recovered: true,
      previousAttempt: { launchId: 'launch-1', at: 1000 },
    })
    expect(readStartupState(stateFile).pending).toEqual({ launchId: 'launch-2', at: 2000 })
  })

  it('does not report recovery for the same launch id', () => {
    const stateFile = tempStateFile()
    beginStartup(stateFile, 'launch-1', 1000)
    expect(beginStartup(stateFile, 'launch-1', 2000)).toEqual({ recovered: false })
  })

  it('promotes the pending launch to lastGood on commit', () => {
    const stateFile = tempStateFile()
    beginStartup(stateFile, 'launch-1', 1000)
    commitStartup(stateFile)
    expect(readStartupState(stateFile)).toEqual({
      lastGood: { launchId: 'launch-1', at: 1000 },
    })
  })

  it('keeps the previous lastGood when committing without a pending record', () => {
    const stateFile = tempStateFile()
    writeStartupState(stateFile, { lastGood: { launchId: 'launch-0', at: 0 } })
    commitStartup(stateFile)
    expect(readStartupState(stateFile)).toEqual({ lastGood: { launchId: 'launch-0', at: 0 } })
  })

  it('treats a malformed state file as clean state', () => {
    const stateFile = tempStateFile()
    writeFileSync(stateFile, '{not json')
    expect(readStartupState(stateFile)).toEqual({})
    expect(beginStartup(stateFile, 'launch-1', 1000)).toEqual({ recovered: false })
  })

  it('drops records that fail validation', () => {
    const stateFile = tempStateFile()
    writeFileSync(stateFile, JSON.stringify({ lastGood: { launchId: 7 }, pending: { at: 'x' } }))
    expect(readStartupState(stateFile)).toEqual({})
  })

  it('writes atomically without leaving the temp file behind', () => {
    const stateFile = tempStateFile()
    beginStartup(stateFile, 'launch-1', 1000)
    commitStartup(stateFile)
    expect(existsSync(`${stateFile}.tmp`)).toBe(false)
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({
      lastGood: { launchId: 'launch-1', at: 1000 },
    })
  })
})

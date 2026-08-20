import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPendingProfile,
  DEFAULT_DESKTOP_PROFILE,
  listDesktopProfiles,
  readPendingProfile,
  resolveBootProfile,
  writePendingProfile,
} from '../src/profile-switch.ts'
import { readStartupState, writeStartupState } from '../src/startup-state.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDirs(): { home: string; userDataDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'profile-switch-'))
  dirs.push(root)
  const home = join(root, 'home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userDataDir, { recursive: true })
  return { home, userDataDir }
}

function writeProfile(home: string, name: string, bundles: string[]): void {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ dsh: { profile: { bundles } } })}\n`)
}

describe('profile listing', () => {
  it('lists desktop-bootable and custom profiles with flags and ordering', () => {
    const { home } = tempDirs()
    writeProfile(home, 'custom', [])
    writeProfile(home, 'desktop', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-desktop-app'])
    writeProfile(home, 'web', ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(listDesktopProfiles(home, 'desktop')).toEqual([
      { name: 'desktop', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-desktop-app'], bootable: true, current: true },
      { name: 'custom', bundles: [], bootable: false, current: false },
      { name: 'web', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], bootable: false, current: false },
    ])
  })

  it('skips the module fallback, non-profile dirs, and malformed manifests', () => {
    const { home } = tempDirs()
    mkdirSync(join(home, 'profiles'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'node_modules'), '')
    writeFileSync(join(home, 'profiles', 'notes'), 'not a directory')
    mkdirSync(join(home, 'profiles', 'broken'))
    writeFileSync(join(home, 'profiles', 'broken', 'package.json'), '{not json')
    expect(listDesktopProfiles(home, 'desktop')).toEqual([
      { name: 'desktop', bundles: [], bootable: false, current: true },
    ])
  })

  it('always lists the current profile even when its directory is missing', () => {
    const { home } = tempDirs()
    expect(listDesktopProfiles(home, 'running')).toEqual([
      { name: 'running', bundles: [], bootable: false, current: true },
    ])
  })
})

describe('pending profile marker', () => {
  it('round-trips a pending switch', () => {
    const { userDataDir } = tempDirs()
    writePendingProfile(userDataDir, 'custom', 'desktop', 1000)
    expect(readPendingProfile(userDataDir)).toEqual({ name: 'custom', from: 'desktop', at: 1000 })
  })

  it('reads a missing or malformed marker as no switch', () => {
    const { userDataDir } = tempDirs()
    expect(readPendingProfile(userDataDir)).toBeUndefined()
    writeFileSync(join(userDataDir, 'pending-profile.json'), '{not json')
    expect(readPendingProfile(userDataDir)).toBeUndefined()
    writeFileSync(join(userDataDir, 'pending-profile.json'), JSON.stringify({ name: 'x' }))
    expect(readPendingProfile(userDataDir)).toBeUndefined()
  })

  it('clears the marker', () => {
    const { userDataDir } = tempDirs()
    writePendingProfile(userDataDir, 'custom', 'desktop')
    clearPendingProfile(userDataDir)
    expect(readPendingProfile(userDataDir)).toBeUndefined()
    clearPendingProfile(userDataDir)
  })
})

describe('boot profile resolution', () => {
  it('boots the last good profile without a marker', () => {
    const { userDataDir } = tempDirs()
    expect(resolveBootProfile(userDataDir, {})).toEqual({ profile: DEFAULT_DESKTOP_PROFILE })
    expect(resolveBootProfile(userDataDir, { lastGood: { launchId: 'l', at: 1, profile: 'custom' } }))
      .toEqual({ profile: 'custom' })
  })

  it('boots the marker profile and keeps the marker until commit', () => {
    const { userDataDir } = tempDirs()
    writePendingProfile(userDataDir, 'custom', 'desktop', 1000)
    expect(resolveBootProfile(userDataDir, {})).toEqual({ profile: 'custom' })
    expect(readPendingProfile(userDataDir)).toEqual({ name: 'custom', from: 'desktop', at: 1000 })
  })

  it('reverts a switch whose launch never reached readiness', () => {
    const { userDataDir } = tempDirs()
    writePendingProfile(userDataDir, 'custom', 'desktop', 1000)
    expect(resolveBootProfile(userDataDir, { pending: { launchId: 'previous', at: 900 } })).toEqual({
      profile: 'desktop',
      reverted: { name: 'custom', from: 'desktop', at: 1000 },
    })
    expect(readPendingProfile(userDataDir)).toBeUndefined()
  })

  it('reverts to the marker origin even without a last good record', () => {
    const { userDataDir } = tempDirs()
    writePendingProfile(userDataDir, 'custom', 'web', 1000)
    expect(resolveBootProfile(userDataDir, { pending: { launchId: 'previous', at: 900 } }))
      .toEqual({ profile: 'web', reverted: { name: 'custom', from: 'web', at: 1000 } })
  })

  it('reads the startup state the shell persists', () => {
    const { home, userDataDir } = tempDirs()
    const stateFile = join(home, 'startup-state.json')
    writeStartupState(stateFile, { lastGood: { launchId: 'l', at: 1, profile: 'custom' } })
    expect(resolveBootProfile(userDataDir, readStartupState(stateFile))).toEqual({ profile: 'custom' })
  })
})

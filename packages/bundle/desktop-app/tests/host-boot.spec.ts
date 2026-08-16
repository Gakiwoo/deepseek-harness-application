/** host-boot: desktop profile composition + settle + dispose, in-process (no Electron). */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bootDesktopHost } from '../src/host-boot.ts'

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-host-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

describe('bootDesktopHost', () => {
  it('boots the desktop profile and settles desktopRuntime', { timeout: 120_000 }, async () => {
    const handle = await bootDesktopHost({ home, frontendIndexPath: '/tmp/index.html' })
    expect(handle.runtime.frontendIndex()).toBe('/tmp/index.html')
    expect(typeof handle.runtime.fetch).toBe('function')
    expect(handle.runtime.graph().entries.length).toBeGreaterThan(0)
    await handle.dispose()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  handleDesktopWindowClose,
  handleDesktopWindowOpen,
  isDesktopNavigation,
  showDesktopWindow,
  type DesktopWindowFace,
} from '../src/window.ts'
import { createDesktopShutdown } from '../src/lifecycle.ts'

function fakeWindow(options: { minimized?: boolean; destroyed?: boolean } = {}): DesktopWindowFace & { trace: string[] } {
  const trace: string[] = []
  return {
    trace,
    isDestroyed: () => options.destroyed === true,
    isMinimized: () => options.minimized === true,
    restore: () => { trace.push('restore') },
    show: () => { trace.push('show') },
    hide: () => { trace.push('hide') },
    focus: () => { trace.push('focus') },
  }
}

describe('desktop window behavior', () => {
  it('restores, shows, and focuses a minimized window', () => {
    const window = fakeWindow({ minimized: true })
    showDesktopWindow(window)
    expect(window.trace).toEqual(['restore', 'show', 'focus'])
  })

  it('does nothing after the window is destroyed', () => {
    const window = fakeWindow({ destroyed: true })
    showDesktopWindow(window)
    expect(window.trace).toEqual([])
  })

  it('hides a close request until final exit starts', () => {
    const event = { preventDefault: vi.fn() }
    const window = fakeWindow()
    handleDesktopWindowClose(window, event, false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.trace).toEqual(['hide'])
    handleDesktopWindowClose(window, { preventDefault: vi.fn() }, true)
    expect(window.trace).toEqual(['hide'])
  })

  it('observes the live shutdown state for each close request', () => {
    const window = fakeWindow()
    let finish!: () => void
    const shutdown = createDesktopShutdown(
      () => new Promise<void>((resolve) => { finish = resolve }),
      vi.fn(),
    )
    const ordinaryClose = { preventDefault: vi.fn() }
    handleDesktopWindowClose(window, ordinaryClose, shutdown.isPending())
    const pending = shutdown.request(0)
    const finalClose = { preventDefault: vi.fn() }
    handleDesktopWindowClose(window, finalClose, shutdown.isPending())

    expect(ordinaryClose.preventDefault).toHaveBeenCalledOnce()
    expect(finalClose.preventDefault).not.toHaveBeenCalled()
    finish()
    return pending
  })

  it.each([
    ['dsh://app/', true],
    ['dsh://app/settings', true],
    ['dsh://evil/', false],
    ['https://example.com/', false],
    ['not a url', false],
  ])('classifies navigation %s', (url, expected) => {
    expect(isDesktopNavigation(url)).toBe(expected)
  })

  it.each(['https://example.com/', 'http://example.com/', 'mailto:hello@example.com'])(
    'opens allowed external URL %s outside the shell',
    async (url) => {
      const openExternal = vi.fn(async () => {})
      expect(handleDesktopWindowOpen(url, openExternal, vi.fn())).toEqual({ action: 'deny' })
      expect(openExternal).toHaveBeenCalledWith(url)
      await Promise.resolve()
    },
  )

  it.each(['file:///tmp/private', 'javascript:alert(1)', 'not a url'])(
    'rejects unsafe external URL %s',
    (url) => {
      const openExternal = vi.fn(async () => {})
      expect(handleDesktopWindowOpen(url, openExternal, vi.fn())).toEqual({ action: 'deny' })
      expect(openExternal).not.toHaveBeenCalled()
    },
  )

  it('reports an external opener failure', async () => {
    const error = new Error('native opener failed')
    const report = vi.fn()
    handleDesktopWindowOpen('https://example.com/', async () => { throw error }, report)
    await Promise.resolve()
    await Promise.resolve()
    expect(report).toHaveBeenCalledWith(error)
  })
})

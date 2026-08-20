import { describe, expect, it, vi } from 'vitest'
import { createDesktopTray, type DesktopTrayMenuItem, type DesktopTrayNative } from '../src/tray.ts'

function fakeNative(options: { empty?: boolean } = {}): {
  native: DesktopTrayNative
  menuTemplate: DesktopTrayMenuItem[]
  listeners: Map<string, () => void>
  destroy: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  setTemplateImage: ReturnType<typeof vi.fn>
} {
  const menuTemplate: DesktopTrayMenuItem[] = []
  const listeners = new Map<string, () => void>()
  const destroy = vi.fn()
  const resize = vi.fn()
  const setTemplateImage = vi.fn()
  const image = {
    isEmpty: () => options.empty === true,
    resize: (size: { width: number; height: number }) => {
      resize(size)
      return image
    },
    setTemplateImage,
  }
  return {
    menuTemplate,
    listeners,
    destroy,
    resize,
    setTemplateImage,
    native: {
      nativeImage: { createFromDataURL: () => image },
      menu: {
        buildFromTemplate: (template) => {
          menuTemplate.push(...template)
          return template
        },
      },
      createTray: () => ({
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: (event, listener) => { listeners.set(event, listener) },
        off: (event, listener) => {
          if (listeners.get(event) === listener) listeners.delete(event)
        },
        destroy,
      }),
    },
  }
}

describe('desktop tray', () => {
  it('shows the approved menu and routes native actions', () => {
    const fake = fakeNative()
    const show = vi.fn()
    const exportDiagnostics = vi.fn()
    const checkForUpdates = vi.fn()
    const requestQuit = vi.fn()
    createDesktopTray(fake.native, 'linux', show, exportDiagnostics, checkForUpdates, requestQuit)

    expect(fake.menuTemplate.map(item => item.label ?? item.type)).toEqual([
      'Show DeepSeek Harness',
      'separator',
      'Export diagnostics…',
      'Check for updates…',
      'separator',
      'Quit',
    ])
    fake.menuTemplate[0]?.click?.()
    fake.listeners.get('double-click')?.()
    fake.menuTemplate[2]?.click?.()
    fake.menuTemplate[3]?.click?.()
    fake.menuTemplate[5]?.click?.()
    expect(show).toHaveBeenCalledTimes(2)
    expect(exportDiagnostics).toHaveBeenCalledOnce()
    expect(checkForUpdates).toHaveBeenCalledOnce()
    expect(requestQuit).toHaveBeenCalledWith(0)
    expect(fake.resize).toHaveBeenCalledWith({ width: 20, height: 20 })
  })

  it('uses a macOS template image', () => {
    const fake = fakeNative()
    createDesktopTray(fake.native, 'darwin', vi.fn(), vi.fn(), vi.fn(), vi.fn())
    expect(fake.resize).toHaveBeenCalledWith({ width: 18, height: 18 })
    expect(fake.setTemplateImage).toHaveBeenCalledWith(true)
  })

  it('removes listeners and destroys the tray once', () => {
    const fake = fakeNative()
    const tray = createDesktopTray(fake.native, 'linux', vi.fn(), vi.fn(), vi.fn(), vi.fn())
    tray.dispose()
    tray.dispose()
    expect(fake.listeners).toHaveLength(0)
    expect(fake.destroy).toHaveBeenCalledOnce()
  })

  it('fails loud when the native tray image is empty', () => {
    const fake = fakeNative({ empty: true })
    expect(() => createDesktopTray(fake.native, 'linux', vi.fn(), vi.fn(), vi.fn(), vi.fn())).toThrow(
      'desktop tray icon is empty',
    )
  })
})

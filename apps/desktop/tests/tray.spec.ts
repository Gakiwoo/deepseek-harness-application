import { describe, expect, it, vi } from 'vitest'
import { createDesktopTray, type DesktopTrayMenuItem, type DesktopTrayNative, type DesktopTrayOptions } from '../src/tray.ts'
import type { DesktopProfile } from '../src/profile-switch.ts'

function trayOptions(overrides: Partial<DesktopTrayOptions> = {}): DesktopTrayOptions {
  return {
    show: vi.fn(),
    openTerminal: vi.fn(),
    exportDiagnostics: vi.fn(),
    checkForUpdates: vi.fn(),
    switchProfile: vi.fn(),
    requestQuit: vi.fn(),
    profiles: [],
    ...overrides,
  }
}

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
    const options = trayOptions()
    createDesktopTray(fake.native, 'linux', options)

    expect(fake.menuTemplate.map(item => item.label ?? item.type)).toEqual([
      'Show DeepSeek Harness',
      'Open Terminal',
      'separator',
      'Profile',
      'separator',
      'Export diagnostics…',
      'Check for updates…',
      'separator',
      'Quit',
    ])
    fake.menuTemplate[0]?.click?.()
    fake.listeners.get('double-click')?.()
    fake.menuTemplate[1]?.click?.()
    fake.menuTemplate[5]?.click?.()
    fake.menuTemplate[6]?.click?.()
    fake.menuTemplate[8]?.click?.()
    expect(options.show).toHaveBeenCalledTimes(2)
    expect(options.openTerminal).toHaveBeenCalledOnce()
    expect(options.exportDiagnostics).toHaveBeenCalledOnce()
    expect(options.checkForUpdates).toHaveBeenCalledOnce()
    expect(options.requestQuit).toHaveBeenCalledWith(0)
    expect(fake.resize).toHaveBeenCalledWith({ width: 20, height: 20 })
  })

  it('builds the profile submenu with radio items and routes switches', () => {
    const fake = fakeNative()
    const switchProfile = vi.fn()
    const profiles: DesktopProfile[] = [
      { name: 'custom', bundles: [], bootable: false, current: true },
      { name: 'desktop', bundles: ['@deepseek-ai/dsh-desktop-app'], bootable: true, current: false },
      { name: 'web', bundles: ['@deepseek-ai/dsh-web-app'], bootable: false, current: false },
    ]
    createDesktopTray(fake.native, 'linux', trayOptions({ switchProfile, profiles }))

    const profile = fake.menuTemplate[3]
    expect(profile?.submenu?.map(item => ({ label: item.label, checked: item.checked, enabled: item.enabled }))).toEqual([
      { label: 'custom', checked: true, enabled: true },
      { label: 'desktop', checked: false, enabled: true },
      { label: 'web', checked: false, enabled: false },
    ])
    profile?.submenu?.[1]?.click?.()
    profile?.submenu?.[0]?.click?.()
    expect(switchProfile).toHaveBeenNthCalledWith(1, 'desktop')
    expect(switchProfile).toHaveBeenNthCalledWith(2, 'custom')
  })

  it('uses a macOS template image', () => {
    const fake = fakeNative()
    createDesktopTray(fake.native, 'darwin', trayOptions())
    expect(fake.resize).toHaveBeenCalledWith({ width: 18, height: 18 })
    expect(fake.setTemplateImage).toHaveBeenCalledWith(true)
  })

  it('removes listeners and destroys the tray once', () => {
    const fake = fakeNative()
    const tray = createDesktopTray(fake.native, 'linux', trayOptions())
    tray.dispose()
    tray.dispose()
    expect(fake.listeners).toHaveLength(0)
    expect(fake.destroy).toHaveBeenCalledOnce()
  })

  it('fails loud when the native tray image is empty', () => {
    const fake = fakeNative({ empty: true })
    expect(() => createDesktopTray(fake.native, 'linux', trayOptions())).toThrow(
      'desktop tray icon is empty',
    )
  })
})

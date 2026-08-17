/** Minimal native tray with injected Electron operations for deterministic tests. */

import { Menu, Tray, nativeImage } from 'electron'

const TEMPLATE_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAACWUlEQVRYhe2WTYiOURTHf2aYD2SkqclqfCxI+YoaseC1GGJnDAslUxZY2JBioaRZsDArkZ1pWOhNpiZEahYijK9iZjOrSTGmhhjSGEa3/q+O233mPo/Xu/L+69TznHu+7rn3nHugjDJKg3lA7l8anAvU6nsOsA/oBgaBx8AsT/4I0F+Mw2XABRn5AUyKRoBv5t9RU0D/utYuAw0JPppCWaoCOoCfnpOpaG3A+C2z/hFYJ/4CYAtwAvgCnLZKlUBPBscFGga2egGc92QeAFcDuq1W6cxfOC/Qd6DN2NqUQucDMLOgsAQYLyKASR3bYRPElYj8Xrv7ziKd2yAOmPvUFZBxd2KPdT4dGNXiENAHvCsyiFOyu9PwnwAtwGz/xq6WQK/HXwgcAl5FHE4AD1Wilv9amyn8u4sZxDYJ3E8SAHYDbxMC6FeZuQZ1Y4pAjycZ3yUBl/ZYe+0NGP6sO7QDqAFeJATgl+pv5IzQ4kgQ1Qm7/ATsl8yaQCMbV4aCWGQEjxKH6/vPAkE8BeYrU2+8tXsxo0PmPCtSBNGocgpVwESA/0fZhXDJCLs7kQZtKcvSvZgzYsaWm3Nz6atLGUR3ip7gHp9UyBvFm2okfpAngXrDqw+ct6VzZECD1wHzZghxWCX+e2C74W/Q0+o7vxPYRBQ54Ksx8hxYadYfmdR2qCxRmv1BxfWMZmBa1iA2A2PeObqx67aeXevkpTppjfSGA5kYUGlmwlKvj6chN7qdVS/JK1t3gXYNO5lRBRxUGcWcu3dkIyVCJbAeOKYh85roogaQFaVyXMb/gV/dRWbOp9K5uAAAAABJRU5ErkJggg=='
const BLUE_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAADSUlEQVRYhe1WXYhMcRS/rG9Cm9q21Fpz/jOasogiHlgPiDcMD2Tdc8aE4oUUDzbJAw88ibwRHiRRQqQ8iKzv8lHaUqKde860Nl/Jx16dOx935s7dmdlln+ypf839z/+c8/ufc37n/C1rSIZkECROPfURlNZ/ZrCp7ePkqYl3Y/U3bMhMNOhsNsRXDEonIHe0bOwaX3zekOwC5FcDdgh2Jm6IT6gRg/zbkLi6AEUMyvf8t7fszPwyfeJL3nni082UbgjzoXplUYon3FGG5Jgh7i1xUmHFUOaVGUe5XjiD3APJzALdj7V1TYskneUGeZ9B+QokB32thFsHJFdrdew7ECdCzorSFPDx0nN8D1DOB3WBOFGEmg/323khNfwTyLHztiIkS6rr8cfG1IdxnkIMJQbIPwYKIGew1xDvLLrQuYrn7cym4pCd+TvnPghA2erXE58tTxn3AMqGgvPF7e4Ig9ydM/DOoDwyKOm/igTKAbULSWdtUb4fAjpr4tudCaWUQZ6TO3SneD+a7GoGlO0G+UUVh78M8n2PoqX7L73L+N/Hw+hoGeKV2UKSu6EHFAzxekPS1UcBvlKaZRsUX+4baGZvqPGIzetydEr3BcDLKfXUa5TKAcjnbA1lVje1vR0DJM/CAASp6gNAaS0YSzmRSiBgx5vRYbcE4k9R4qRnLylzg41MGaYRCk+BnZ7uV6jstqqI9n1D8iTklo9npLhRIwXE7wMAblc0arT6c/m02t3h1UBMw+4mpVMfveBXSJp82oUJkJwq5MrmddUAZHUcuyZaonTOTbkjKxqLbU7PzOdNwzc91T2pFhDeSK7SE3T41GLLMiQX/aKSa9pIgiCBeH809WFKfk9/B/MduP1Rq1ZppnRDoANezD9CPIBJZ3Zunw3yqgIIchbpaA1puTeDl6gqkSwlvxUVz1NjO7Py/wPyA7/Y5JjS0tPzZnzgoUJyBzCzzLLcYf0CEU3KUiD5UjpguMOg3NCxG6ju59pJtQGpnr4NQjrla6Vm/0CkZEZpH6+l2vk3EB/RXqLp02gB8S0gOaSPHau/Ek+4o4Bkm9KomnOdI2DzYmtQJOHWRbY4C4Fkjz4yDckFXYB8Uh8gUUq3DI7jIflf5A8E1QULjH3uGwAAAABJRU5ErkJggg=='

/** Menu entry used by the native tray adapter. */
export interface DesktopTrayMenuItem {
  /** Visible command label. */
  readonly label?: string

  /** Native separator marker. */
  readonly type?: 'separator'

  /** Invokes the menu command. */
  readonly click?: () => void
}

/** Native image operations used by tray construction. */
export interface DesktopTrayImage {
  /** @returns Whether decoding produced no pixels. */
  isEmpty(): boolean

  /** @returns An image resized for the current native tray. */
  resize(size: { width: number; height: number }): DesktopTrayImage

  /** Marks a macOS image for automatic light and dark adaptation. */
  setTemplateImage(template: boolean): void
}

/** Native tray operations owned by the desktop shell. */
export interface DesktopTrayFace {
  /** Sets hover text. */
  setToolTip(tooltip: string): void

  /** Attaches the native context menu. */
  setContextMenu(menu: unknown): void

  /** Adds the restore gesture listener. */
  on(event: 'double-click', listener: () => void): unknown

  /** Removes the restore gesture listener. */
  off(event: 'double-click', listener: () => void): unknown

  /** Releases the native tray item. */
  destroy(): void
}

/** Injectable native adapter used to construct a tray. */
export interface DesktopTrayNative {
  /** Native image decoder. */
  readonly nativeImage: { createFromDataURL(dataUrl: string): DesktopTrayImage }

  /** Native context-menu builder. */
  readonly menu: { buildFromTemplate(template: DesktopTrayMenuItem[]): unknown }

  /** Creates the platform tray item. */
  createTray(image: DesktopTrayImage): DesktopTrayFace
}

/** Owned native tray resource. */
export interface DesktopTrayHandle {
  /** Removes listeners and releases the native tray item. */
  dispose(): void
}

/** Electron implementation of the injected native tray operations. */
export const electronTrayNative: DesktopTrayNative = {
  nativeImage: { createFromDataURL: dataUrl => nativeImage.createFromDataURL(dataUrl) },
  menu: {
    buildFromTemplate: template => Menu.buildFromTemplate(template),
  },
  createTray: image => new Tray(image as Electron.NativeImage),
}

/**
 * Creates the two-command native tray and restore gesture.
 * @param native Native tray operations.
 * @param platform Current Node.js platform.
 * @param show Restores the desktop window.
 * @param requestQuit Starts orderly process shutdown.
 * @returns The owned tray handle.
 */
export function createDesktopTray(
  native: DesktopTrayNative,
  platform: NodeJS.Platform,
  show: () => void,
  requestQuit: (code: number) => void,
): DesktopTrayHandle {
  const macOS = platform === 'darwin'
  const source = macOS ? TEMPLATE_TRAY_ICON : BLUE_TRAY_ICON
  const size = macOS ? 18 : 20
  const image = native.nativeImage.createFromDataURL(source).resize({ width: size, height: size })
  if (macOS) image.setTemplateImage(true)
  if (image.isEmpty()) throw new Error('desktop tray icon is empty')

  const template: DesktopTrayMenuItem[] = [
    { label: 'Show DeepSeek Harness', click: show },
    { type: 'separator' },
    { label: 'Quit', click: () => { requestQuit(0) } },
  ]
  const tray = native.createTray(image)
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(native.menu.buildFromTemplate(template))
  tray.on('double-click', show)

  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      tray.off('double-click', show)
      tray.destroy()
    },
  }
}

/** Main window: sandboxed renderer, close-to-tray behavior, and navigation policy. */

import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** BrowserWindow operations needed by pure lifecycle behavior. */
export interface DesktopWindowFace {
  /** @returns Whether the native window can no longer be used. */
  isDestroyed(): boolean

  /** @returns Whether the native window is minimized. */
  isMinimized(): boolean

  /** Restores a minimized native window. */
  restore(): void

  /** Makes the native window visible. */
  show(): void

  /** Makes the native window invisible without closing it. */
  hide(): void

  /** Gives the native window keyboard focus. */
  focus(): void
}

/** Owned main-window resources and operations. */
export interface DesktopWindowHandle {
  /** Native renderer window. */
  readonly window: BrowserWindow

  /** Restores and focuses the native renderer window. */
  show(): void

  /** Removes listeners and destroys the native renderer window. */
  dispose(): void
}

/**
 * Restores, shows, and focuses a usable desktop window.
 * @param window Native window operations.
 */
export function showDesktopWindow(window: DesktopWindowFace): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/**
 * Hides an ordinary close request while allowing final process exit.
 * @param window Native window operations.
 * @param event Cancellable native close event.
 * @param quitting Whether final application shutdown has started.
 */
export function handleDesktopWindowClose(
  window: DesktopWindowFace,
  event: { preventDefault(): void },
  quitting: boolean,
): void {
  if (quitting) return
  event.preventDefault()
  if (!window.isDestroyed()) window.hide()
}

/**
 * Checks whether a main-frame URL belongs to the desktop renderer.
 * @param raw Candidate navigation URL.
 * @returns Whether the URL has the exact dsh://app authority.
 */
export function isDesktopNavigation(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'dsh:' && url.hostname === 'app'
  } catch {
    return false
  }
}

/**
 * Denies every child window and delegates safe external schemes to the OS.
 * @param raw Requested child-window URL.
 * @param openExternal Native external URL opener.
 * @param report Receives opener failures.
 * @returns Electron's deny decision.
 */
export function handleDesktopWindowOpen(
  raw: string,
  openExternal: (url: string) => Promise<void>,
  report: (error: unknown) => void,
): { action: 'deny' } {
  try {
    if (!EXTERNAL_PROTOCOLS.has(new URL(raw).protocol)) return { action: 'deny' }
    void openExternal(raw).catch(report)
  } catch (error) {
    if (error instanceof TypeError) return { action: 'deny' }
    report(error)
  }
  return { action: 'deny' }
}

/**
 * Creates the terminal window over dsh://app/terminal.html. Unlike the main
 * window it closes for real: a terminal session is user-owned and reaps on
 * host dispose, so a hidden lingering window would only leak the session.
 * @returns The owned terminal-window handle.
 */
export function createTerminalWindow(): DesktopWindowHandle {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 480,
    minHeight: 320,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'Terminal',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const onReady = (): void => { showDesktopWindow(window) }
  const onFrameNavigate = (event: Electron.Event<Electron.WebContentsWillFrameNavigateEventParams>): void => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault()
  }
  const onRedirect = (event: Electron.Event<Electron.WebContentsWillRedirectEventParams>): void => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault()
  }

  void window.loadURL('dsh://app/terminal.html')
  window.once('ready-to-show', onReady)
  window.webContents.on('will-frame-navigate', onFrameNavigate)
  window.webContents.on('will-redirect', onRedirect)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let disposed = false
  return {
    window,
    show: () => { showDesktopWindow(window) },
    dispose() {
      if (disposed) return
      disposed = true
      window.off('ready-to-show', onReady)
      window.webContents.off('will-frame-navigate', onFrameNavigate)
      window.webContents.off('will-redirect', onRedirect)
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

/**
 * Creates the main window over the splash page; the host gate later loads dsh://app/.
 * @param resourcesDir Packaged resources directory containing the splash page.
 * @param isQuitting Reports whether final application shutdown has started.
 * @param reportExternalOpenError Receives native external-opener failures.
 * @returns The owned main-window handle.
 */
export function createMainWindow(
  resourcesDir: string,
  isQuitting: () => boolean,
  reportExternalOpenError: (error: unknown) => void,
): DesktopWindowHandle {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'DeepSeek Harness',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const onReady = (): void => { showDesktopWindow(window) }
  const onClose = (event: Electron.Event): void => {
    handleDesktopWindowClose(window, event, isQuitting())
  }
  const onFrameNavigate = (event: Electron.Event<Electron.WebContentsWillFrameNavigateEventParams>): void => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault()
  }
  const onRedirect = (event: Electron.Event<Electron.WebContentsWillRedirectEventParams>): void => {
    if (event.isMainFrame && !isDesktopNavigation(event.url)) event.preventDefault()
  }

  void window.loadFile(join(resourcesDir, 'splash.html'))
  window.once('ready-to-show', onReady)
  window.on('close', onClose)
  window.webContents.on('will-frame-navigate', onFrameNavigate)
  window.webContents.on('will-redirect', onRedirect)
  window.webContents.setWindowOpenHandler(({ url }) => handleDesktopWindowOpen(
    url,
    externalUrl => shell.openExternal(externalUrl),
    reportExternalOpenError,
  ))

  let disposed = false
  return {
    window,
    show: () => { showDesktopWindow(window) },
    dispose() {
      if (disposed) return
      disposed = true
      window.off('ready-to-show', onReady)
      window.off('close', onClose)
      window.webContents.off('will-frame-navigate', onFrameNavigate)
      window.webContents.off('will-redirect', onRedirect)
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

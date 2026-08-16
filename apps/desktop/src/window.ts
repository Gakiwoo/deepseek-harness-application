/** Main window: sandboxed renderer, splash-then-ready gate. */

import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * Create the main window over the splash page; the dsh:// frontend loads
 * after the host settles (main.ts drives that transition).
 * @param resourcesDir - packaged resources dir (host closure + frontend dist + splash).
 * @returns the created window.
 */
export function createMainWindow(resourcesDir: string): BrowserWindow {
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
  void window.loadFile(join(resourcesDir, 'splash.html'))
  window.once('ready-to-show', () => { window.show() })
  // External links leave the shell; dsh:// stays inside.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('dsh://')) return { action: 'deny' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  return window
}

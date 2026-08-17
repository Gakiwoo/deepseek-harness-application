/** Desktop shell entry: single instance, host boot, window gate, IPC pump, lifecycle. */

import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DesktopHostHandle } from '@deepseek-ai/dsh-desktop-app/host-boot'
import type { IpcInvokeRegistrar } from './host-glue/fetch-pump.ts'
import { registerDshScheme, mountDshProtocol } from './protocol.ts'
import { createMainWindow, type DesktopWindowHandle } from './window.ts'
import { mountFetchPump } from './host-glue/fetch-pump.ts'

interface ShellState {
  window?: DesktopWindowHandle
  host?: DesktopHostHandle
  quitting: boolean
  pump?: { dispose(): void }
}

const state: ShellState = { quitting: false }

/** Wrap ipcMain as the pump's injectable registrar. */
function ipcFace(): IpcInvokeRegistrar {
  return {
    handle: (channel, listener) => { ipcMain.handle(channel, (_event, raw) => listener(raw)) },
    removeHandler: (channel) => { ipcMain.removeHandler(channel) },
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { state.window?.show() })
  registerDshScheme()
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => {
    if (state.window === undefined && state.host !== undefined) void loadReady()
  })
  void app.whenReady().then(main).catch(fatal)
}

async function main(): Promise<void> {
  const resourcesDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  // Host boot lives in the packaged closure (dev resolves the workspace lib).
  const hostBootPath = app.isPackaged
    ? join(process.resourcesPath, 'host', 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
    : join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
  const { bootDesktopHost } = await import(pathToFileURL(hostBootPath).href) as typeof import('@deepseek-ai/dsh-desktop-app/host-boot')
  state.window = createMainWindow(resourcesDir, () => state.quitting, reportExternalOpenError)
  try {
    state.host = await bootDesktopHost({
      frontendIndexPath: join(resourcesDir, 'frontend', 'index.html'),
      requestExit: (code) => { app.exit(code) },
    })
  } catch (error) {
    await showError(state.window.window, error)
    app.exit(1)
    return
  }
  // GUI fail-loud: late unhandled rejections surface, then exit non-zero.
  process.on('unhandledRejection', (reason) => {
    dialog.showErrorBox('DeepSeek Harness', `Unexpected failure:\n${String(reason)}`)
    app.exit(1)
  })
  mountDshProtocol(state.host.runtime)
  state.pump = mountFetchPump(ipcFace(), state.window.window.webContents, state.host.runtime.fetch)
  app.on('before-quit', (event) => {
    if (state.quitting || state.host === undefined) return
    state.quitting = true
    event.preventDefault()
    const host = state.host
    void Promise.race([host.dispose(), new Promise((resolve) => { setTimeout(resolve, 5000) })])
      .then(() => { app.quit() })
  })
  await loadReady()
}

async function loadReady(): Promise<void> {
  const host = state.host
  if (host === undefined) throw new Error('desktop: cannot load the renderer before the host is ready')
  const handle = state.window ?? createMainWindow(
    join(app.getAppPath(), 'resources'),
    () => state.quitting,
    reportExternalOpenError,
  )
  state.window = handle
  state.pump?.dispose()
  state.pump = mountFetchPump(ipcFace(), handle.window.webContents, host.runtime.fetch)
  await handle.window.loadURL('dsh://app/')
}

async function showError(window: Electron.BrowserWindow, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.message}\n\n${String(error.stack ?? '')}` : String(error)
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;background:#1e1e1e;color:#eee;padding:40px">'
    + `<h1>启动失败 / Startup failure</h1><pre>${message.replaceAll('<', '&lt;')}</pre>`
    + '<p>日志 / Logs: ~/.dsh/logs/</p></body>',
  ))
}

function fatal(error: unknown): void {
  dialog.showErrorBox('DeepSeek Harness', error instanceof Error ? error.stack ?? error.message : String(error))
  app.exit(1)
}

function reportExternalOpenError(error: unknown): void {
  dialog.showErrorBox('DeepSeek Harness', `Unable to open external link:\n${String(error)}`)
}

/** Desktop shell entry: one native lifecycle over the Host, window, tray, and IPC pump. */

import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DesktopHostHandle } from '@deepseek-ai/dsh-desktop-app/host-boot'
import type { IpcInvokeRegistrar } from './host-glue/fetch-pump.ts'
import {
  createDesktopShutdown,
  disposeDesktopShell,
  installShutdownRequests,
  type DesktopShutdown,
} from './lifecycle.ts'
import { mountDshProtocol, registerDshScheme } from './protocol.ts'
import { createDesktopTray, electronTrayNative, type DesktopTrayHandle } from './tray.ts'
import { createMainWindow, type DesktopWindowHandle } from './window.ts'
import { mountFetchPump } from './host-glue/fetch-pump.ts'

interface ShellState {
  window?: DesktopWindowHandle
  tray?: DesktopTrayHandle
  host?: DesktopHostHandle
  pump?: { dispose(): void }
}

const state: ShellState = {}

/** Wraps ipcMain as the pump's injectable registrar. */
function ipcFace(): IpcInvokeRegistrar {
  return {
    handle: (channel, listener) => {
      ipcMain.handle(channel, (_event, raw) => listener(raw))
    },
    removeHandler: (channel) => { ipcMain.removeHandler(channel) },
  }
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  let disposeNativeListeners = (): void => {}
  const shutdown = createDesktopShutdown(
    () => disposeDesktopShell({
      pump: state.pump,
      host: state.host,
      native: {
        dispose: () => {
          disposeNativeListeners()
          state.tray?.dispose()
          state.window?.dispose()
        },
      },
    }),
    (code) => { app.exit(code) },
  )

  const onSecondInstance = (): void => { state.window?.show() }
  const onActivate = (): void => { state.window?.show() }
  const onUnhandledRejection = (reason: unknown): void => {
    reportFailure('Unexpected failure', reason, shutdown)
  }
  const disposeShutdownRequests = installShutdownRequests(
    process,
    app,
    (code) => { void shutdown.request(code) },
  )

  app.on('second-instance', onSecondInstance)
  app.on('activate', onActivate)
  process.on('unhandledRejection', onUnhandledRejection)
  disposeNativeListeners = () => {
    disposeShutdownRequests()
    app.off('second-instance', onSecondInstance)
    app.off('activate', onActivate)
    process.off('unhandledRejection', onUnhandledRejection)
  }

  try {
    registerDshScheme()
    void app.whenReady()
      .then(() => { return bootPrimaryInstance(shutdown) })
      .catch((error) => { reportFailure('Unexpected failure', error, shutdown) })
  } catch (error) {
    reportFailure('Startup failure', error, shutdown)
  }
}

async function bootPrimaryInstance(shutdown: DesktopShutdown): Promise<void> {
  const resourcesDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const window = createMainWindow(
    resourcesDir,
    () => shutdown.isPending(),
    reportExternalOpenError,
  )
  state.window = window
  state.tray = createDesktopTray(
    electronTrayNative,
    process.platform,
    () => { state.window?.show() },
    (code) => { void shutdown.request(code) },
  )

  // Host boot lives in the packaged closure; development resolves the workspace build.
  const hostBootPath = app.isPackaged
    ? join(process.resourcesPath, 'host', 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
    : join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
  const { bootDesktopHost } = await import(pathToFileURL(hostBootPath).href) as typeof import('@deepseek-ai/dsh-desktop-app/host-boot')

  let host: DesktopHostHandle
  try {
    host = await bootDesktopHost({
      frontendIndexPath: join(resourcesDir, 'frontend', 'index.html'),
      requestExit: (code) => { void shutdown.request(code) },
    })
  } catch (error) {
    reportFailure('Startup failure', error, shutdown)
    return
  }

  state.host = host
  mountDshProtocol(host.runtime)
  state.pump = mountFetchPump(ipcFace(), window.window.webContents, host.runtime.fetch)
  await window.window.loadURL('dsh://app/')
}

function reportFailure(title: string, error: unknown, shutdown: DesktopShutdown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  dialog.showErrorBox('DeepSeek Harness', `${title}:\n${message}`)
  process.stderr.write(`[desktop] ${title}: ${message}\n`)
  void shutdown.request(1)
}

function reportExternalOpenError(error: unknown): void {
  dialog.showErrorBox('DeepSeek Harness', `Unable to open external link:\n${String(error)}`)
}

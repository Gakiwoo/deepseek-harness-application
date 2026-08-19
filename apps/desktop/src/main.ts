/** Desktop shell entry: one native lifecycle over the Host, window, tray, and IPC pump. */

import { randomUUID } from 'node:crypto'
import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { DesktopHostHandle } from '@deepseek-ai/dsh-desktop-app/host-boot'
import type { IpcInvokeRegistrar } from './host-glue/fetch-pump.ts'
import {
  createDesktopShutdown,
  disposeDesktopShell,
  installShutdownRequests,
  type DesktopShutdown,
} from './lifecycle.ts'
import { mountDshProtocol, registerDshScheme } from './protocol.ts'
import {
  buildCrashEvidence,
  crashEvidenceDir,
  writeCrashEvidence,
  type EnvironmentFactsOptions,
} from './crash-evidence.ts'
import { collectDiagnosticsFacts, exportDiagnosticsArchive } from './diagnostics-export.ts'
import { recoverShellEnvironment } from './shell-environment.ts'
import { beginStartup, commitStartup } from './startup-state.ts'
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
      .catch((error: unknown) => { reportFailure('Unexpected failure', error, shutdown) })
  } catch (error) {
    reportFailure('Startup failure', error, shutdown)
  }
}

async function bootPrimaryInstance(shutdown: DesktopShutdown): Promise<void> {
  const stateFile = join(app.getPath('userData'), 'startup-state.json')
  const startup = beginStartup(stateFile, randomUUID())

  // Finder-launched packaged apps inherit a minimal PATH; recover the login
  // shell environment before anything spawns tool processes. Dev launches
  // keep the terminal environment unless explicitly opted in.
  await recoverShellEnvironment({
    enabled: app.isPackaged || process.env.DSH_DESKTOP_SHELL_ENV === '1',
  })

  const resourcesDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const window = createMainWindow(
    resourcesDir,
    () => shutdown.isPending(),
    reportExternalOpenError,
  )
  state.window = window
  window.window.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    recordCrashEvidence(`renderer ${details.reason}`, `exitCode: ${details.exitCode}`)
  })
  state.tray = createDesktopTray(
    electronTrayNative,
    process.platform,
    () => { state.window?.show() },
    runDiagnosticsExport,
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
  state.pump = mountFetchPump(
    ipcFace(),
    window.window.webContents,
    request => host.runtime.fetch(request),
  )
  await window.window.loadURL('dsh://app/')
  commitStartup(stateFile)
  if (startup.recovered) {
    process.stderr.write(`[desktop] previous launch ${startup.previousAttempt?.launchId ?? 'unknown'} did not complete\n`)
    if (app.isPackaged) {
      // The window may already be gone when the message box resolves; nothing
      // to do about that, so the rejection is swallowed.
      void dialog.showMessageBox(window.window, {
        type: 'warning',
        title: 'DeepSeek Harness',
        message: 'The previous launch did not complete.',
        detail: 'The previous launch exited before the window was ready, usually because it crashed or was force-quit. If this keeps happening, report it with the log files from the Harness home directory.',
        buttons: ['OK'],
      }).catch(() => {})
    }
  }
}

function reportFailure(title: string, error: unknown, shutdown: DesktopShutdown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  recordCrashEvidence(title, message)
  dialog.showErrorBox('DeepSeek Harness', `${title}:\n${message}`)
  process.stderr.write(`[desktop] ${title}: ${message}\n`)
  void shutdown.request(1)
}

/** Best-effort snapshot before the failure path runs; a write failure must not become a second failure. */
function recordCrashEvidence(reason: string, detail: string): void {
  try {
    writeCrashEvidence(crashEvidenceDir(), buildCrashEvidence({
      reason,
      detail,
      ...environmentFactsOptions(),
    }))
  } catch (error) {
    process.stderr.write(`[desktop] crash evidence failed: ${String(error)}\n`)
  }
}

/** The desktop facts every diagnostics surface collects. */
function environmentFactsOptions(): EnvironmentFactsOptions {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    env: process.env,
  }
}

/** Create the diagnostics archive and report the result to the user. */
function runDiagnosticsExport(): void {
  void (async () => {
    const home = resolveDshHome()
    const path = await exportDiagnosticsArchive(
      home,
      collectDiagnosticsFacts(environmentFactsOptions(), join(home, 'sessions')),
    )
    void dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness',
      message: 'Diagnostics exported.',
      detail: `Attach this file to your report:\n${path}`,
      buttons: ['OK'],
    })
  })().catch((error: unknown) => {
    dialog.showErrorBox('DeepSeek Harness', `Unable to export diagnostics:\n${String(error)}`)
  })
}

function reportExternalOpenError(error: unknown): void {
  dialog.showErrorBox('DeepSeek Harness', `Unable to open external link:\n${String(error)}`)
}

/** Desktop shell entry: one native lifecycle over the Host, window, tray, and IPC pump. */

import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { app, dialog, ipcMain, Notification } from 'electron'
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
import {
  createDesktopUpdater,
  UPDATE_APPLY_TIMEOUT_MS,
  type DesktopUpdateHandle,
  type DesktopUpdateNative,
} from './updates.ts'
import { createMainWindow, type DesktopWindowHandle } from './window.ts'
import { mountFetchPump } from './host-glue/fetch-pump.ts'

interface ShellState {
  window?: DesktopWindowHandle
  tray?: DesktopTrayHandle
  host?: DesktopHostHandle
  pump?: { dispose(): void }
  updater?: DesktopUpdateHandle
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
      updater: state.updater
        ? { applyPending: () => { return state.updater?.applyPending() ?? Promise.resolve() } }
        : undefined,
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
    () => { void runUpdateCheck(shutdown) },
    (code) => { void shutdown.request(code) },
  )

  // Update checks run on every install; dev launches opt in through the
  // environment so the dialogs stay out of development. Apply happens during
  // the shutdown disposal of the packaged app only.
  state.updater = createDesktopUpdater(updateNative(), {
    enabled: app.isPackaged || process.env.DSH_DESKTOP_UPDATE_CHECK === '1',
    platform: process.platform,
    arch: process.arch,
    currentVersion: app.getVersion(),
    currentAppPath: join(app.getPath('exe'), '..', '..', '..'),
    userDataDir: app.getPath('userData'),
  })

  // Host boot lives in the packaged closure; development resolves the workspace build.
  // The deploy lands the dsh-desktop-app package at the resources/host root, so the
  // packaged host boot is resources/host/lib/host-boot.js, not a node_modules path.
  const hostBootPath = app.isPackaged
    ? join(process.resourcesPath, 'host', 'lib', 'host-boot.js')
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

/** Native operations of the updates capability, backed by Electron primitives. */
function updateNative(): DesktopUpdateNative {
  return {
    fetch: (input, init) => { return fetch(input, init) },
    spawn: (command, args, options) => {
      return spawn(command, args, options ?? {})
    },
    env: process.env,
    plistBundleVersion: (appPath) => {
      return execFileSync(
        'plutil',
        ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(appPath, 'Contents', 'Info.plist')],
        { encoding: 'utf8' },
      ).trim()
    },
  }
}

/**
 * Checks the release feed and drives the download/install dialogs.
 * @param shutdown The desktop shutdown controller, used for quit-to-install.
 */
function runUpdateCheck(shutdown: DesktopShutdown): Promise<void> {
  return (async () => {
    const updater = state.updater
    if (updater === undefined) return
    const info = await updater.check()
    if (info === undefined) {
      void dialog.showMessageBox({
        type: 'info',
        title: 'DeepSeek Harness',
        message: 'DeepSeek Harness is up to date.',
        detail: `You are running the newest release (${app.getVersion()}).`,
        buttons: ['OK'],
      })
      return
    }

    const downloadChoice = await dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness',
      message: `DeepSeek Harness ${info.version} is available.`,
      detail: `You are running ${app.getVersion()}. The update downloads in the background and installs when you quit.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (downloadChoice.response !== 0) return

    const artifactPath = await updater.download(info, (progress) => {
      notifyProgress(info.version, progress.received / progress.total)
    })
    await updater.stage(info, artifactPath)

    const installChoice = await dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness',
      message: `Update ${info.version} is ready.`,
      detail: 'Install it now and quit, or it installs next time you quit the app.',
      buttons: ['Install now and quit', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (installChoice.response === 0) {
      // A bundle swap outlives the ordinary shutdown budget.
      void shutdown.request(0, UPDATE_APPLY_TIMEOUT_MS)
    }
  })().catch((error: unknown) => {
    dialog.showErrorBox('DeepSeek Harness', `Unable to check for updates:\n${String(error)}`)
  })
}

/** Reports download progress through native notifications at quarter steps. */
function notifyProgress(version: string, ratio: number): void {
  const step = Math.floor(ratio * 4)
  if (step < 1 || step > 4) return
  const body = ['downloaded 25%.', 'downloaded 50%.', 'downloaded 75%.', 'is ready to install.'][step - 1]
  new Notification({
    title: `DeepSeek Harness ${version}`,
    body,
  }).show()
}

/** Maximum time the desktop shell waits for orderly disposal. */
export const DESKTOP_SHUTDOWN_TIMEOUT_MS = 5_000

/** Coordinates one orderly desktop shutdown and immediate repeat-request escalation. */
export interface DesktopShutdown {
  /**
   * Starts disposal or escalates an already pending shutdown.
   * @param code Requested process exit code.
   * @returns The first shutdown attempt.
   */
  request(code: number): Promise<void>

  /** @returns Whether shutdown has been requested. */
  isPending(): boolean
}

/** Process signal listener surface used by the desktop shell. */
export interface DesktopSignalSource {
  /** Adds a signal listener. */
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown

  /** Removes a signal listener. */
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown
}

/** Native quit event needed by the orderly shutdown bridge. */
export interface DesktopQuitEvent {
  /** Defers Electron's native quit until disposal finishes. */
  preventDefault(): void
}

/** Electron application listener surface used by the orderly shutdown bridge. */
export interface DesktopQuitSource {
  /** Adds the native quit listener. */
  on(event: 'before-quit', listener: (event: DesktopQuitEvent) => void): unknown

  /** Removes the native quit listener. */
  off(event: 'before-quit', listener: (event: DesktopQuitEvent) => void): unknown
}

/**
 * Creates a bounded, single-use desktop shutdown controller.
 * @param dispose Releases desktop resources in their required order.
 * @param exit Terminates the native application with an exit code.
 * @param timeoutMs Maximum disposal duration before forced exit.
 * @returns The desktop shutdown controller.
 */
export function createDesktopShutdown(
  dispose: () => Promise<void>,
  exit: (code: number) => void,
  timeoutMs = DESKTOP_SHUTDOWN_TIMEOUT_MS,
): DesktopShutdown {
  let pending: Promise<void> | undefined
  let exited = false

  const exitOnce = (code: number): void => {
    if (exited) return
    exited = true
    exit(code)
  }

  return {
    request(code) {
      if (pending !== undefined) {
        exitOnce(code)
        return pending
      }

      pending = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          exitOnce(code === 0 ? 1 : code)
          resolve()
        }, timeoutMs)

        void dispose().then(
          () => {
            clearTimeout(timeout)
            exitOnce(code)
            resolve()
          },
          () => {
            clearTimeout(timeout)
            exitOnce(code === 0 ? 1 : code)
            resolve()
          },
        )
      })
      return pending
    },
    isPending: () => pending !== undefined,
  }
}

/**
 * Routes process signals and Electron quit requests through one controller.
 * @param signals Process signal source.
 * @param nativeApp Electron application quit source.
 * @param requestQuit Starts or escalates orderly shutdown.
 * @returns A listener disposer.
 */
export function installShutdownRequests(
  signals: DesktopSignalSource,
  nativeApp: DesktopQuitSource,
  requestQuit: (code: number) => void,
): () => void {
  const onInterrupt = (): void => { requestQuit(130) }
  const onTerminate = (): void => { requestQuit(0) }
  const onBeforeQuit = (event: DesktopQuitEvent): void => {
    event.preventDefault()
    requestQuit(0)
  }

  signals.on('SIGINT', onInterrupt)
  signals.on('SIGTERM', onTerminate)
  nativeApp.on('before-quit', onBeforeQuit)

  return () => {
    signals.off('SIGINT', onInterrupt)
    signals.off('SIGTERM', onTerminate)
    nativeApp.off('before-quit', onBeforeQuit)
  }
}

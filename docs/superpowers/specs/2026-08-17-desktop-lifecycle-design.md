# Desktop Lifecycle and Tray Design

## Scope

This change gives the existing Electron carrier a complete native lifecycle without replacing its `dsh://` protocol or IPC fetch transport. Closing the window hides it while the Host remains active; the tray, Dock activation, or a second application launch restores the same window; only an explicit quit disposes the Host and ends the process.

The first phase adds a two-command tray, bounded shutdown, single-window restoration, exact navigation policy, and the tests and documentation that own those behaviors. Profile switching, plugin management, a desktop terminal, update delivery, advanced native materials, remote control, and a migration to loopback HTTP/WebSocket remain outside this phase.

## Existing defects

The current close path destroys the only window on non-macOS platforms and then quits, while macOS retains a stale `state.window` reference after destruction and therefore cannot recreate the window from `activate`. A second-instance event only calls `focus()`, which does not restore a hidden or minimized window.

The current `before-quit` handler is installed only after Host boot and races a five-second timer against `host.dispose()` without handling disposal rejection or a repeated quit request. The Host's `requestExit` callback calls `app.exit()` directly and bypasses Host disposal.

The BrowserWindow denies new windows but does not guard main-frame navigation or redirects. Failed `shell.openExternal()` promises reach the fail-loud unhandled-rejection handler and terminate the application.

A clean checkout exposes two build defects at the current `HEAD`. The pure `@deepseek-ai/dsh-client-connection/desktop-bridge` export has no source-plane path mapping, so the desktop unit test cannot resolve it before a build. The preload esbuild command does not externalize `electron`; after a fresh install it bundles the npm Electron launcher instead of retaining `require("electron")`, so `contextBridge` is unavailable at runtime.

## Reference and alternatives

The design adopts lifecycle semantics from [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop): a single-instance window, close-to-tray behavior, exact renderer navigation policy, and bounded orderly shutdown. It does not copy that project's loopback Web carrier, profile launcher, update system, terminal, or advanced presentation because the current application already owns a packaged Host closure and private IPC fetch carrier.

Three implementation approaches were considered. Directly extending `main.ts` minimizes the file count but leaves Electron globals and asynchronous exit races coupled and difficult to test. Migrating the complete reference architecture provides a larger feature set but replaces the current transport and crosses unrelated package responsibilities. The selected approach adds small lifecycle and tray modules behind injectable native interfaces while retaining the current window, protocol, and Host packages.

## Components

`apps/desktop/src/main.ts` remains the composition root. It acquires the single-instance lock, registers the scheme, constructs the lifecycle coordinator before Host boot, creates the window and tray after Electron becomes ready, mounts the Host and IPC bridge, and routes every fatal or explicit exit through the coordinator.

`apps/desktop/src/lifecycle.ts` owns the process exit state. Its first request marks final exit, starts one Host/native disposer, and sets a five-second deadline. Successful disposal preserves the requested exit code; disposal failure or timeout converts a zero code to `1`; a request received while disposal is pending exits immediately. The module also installs and removes `SIGINT`, `SIGTERM`, and `before-quit` listeners.

`apps/desktop/src/window.ts` keeps BrowserWindow construction and owns native window behavior. A close event hides the window unless final exit has started. Every restoration source uses one operation that restores a minimized window, shows it, and focuses it. Main-frame navigation and redirects are allowed only when the target protocol is `dsh:` and the hostname is `app`. New windows are always denied; valid HTTP, HTTPS, and mail links are delegated to the operating system with handled rejection.

`apps/desktop/src/tray.ts` creates one Tray from a PNG derived from the existing fish mark. macOS uses the template representation and Windows uses the fixed representation. The menu contains only `Show DeepSeek Harness` and `Quit`; a double click invokes the same show operation. Its disposer removes listeners and destroys the tray.

The root `tsconfig.base.json` maps the pure desktop bridge export to `packages/client/connection/src/client/desktop-bridge.ts`, preserving source-plane tests on a clean checkout. The desktop `build:shell` command externalizes `electron` in both main and preload bundles, and a built-artifact check rejects a preload that contains the npm Electron launcher.

## Lifecycle

After `app.whenReady()`, the application creates the splash window and tray before starting the Host. The tray can therefore restore a splash window hidden during a slow boot and can request final exit before the Host settles.

Successful Host boot mounts `dsh://`, installs the IPC fetch pump, and loads `dsh://app/` into the existing window. The current redundant pump mount is removed: one renderer owns one pump until final cleanup.

Closing the window prevents the native close event and hides the window. Dock activation, the tray show command, a tray double click, and the `second-instance` event restore the same BrowserWindow. Normal close never creates a second window and does not stop the Host.

The tray quit command, Electron `before-quit`, Host `requestExit`, `SIGTERM`, and `SIGINT` call the same shutdown request. Cleanup marks the window as quitting, disposes the IPC pump, waits for the Host disposer, removes tray and window listeners, destroys native objects, and calls `app.exit()` exactly once. A second request or the deadline can end the process while a wedged Host disposer remains pending.

## Failure behavior

Host boot failure shows a native error dialog, records the diagnostic on stderr, cleans up the pump, tray, and window, and requests exit code `1`. The application does not keep a non-functional tray process alive.

Malformed or non-`dsh://app` navigation is prevented. An external URL is opened only for `http:`, `https:`, or `mailto:` from a new-window request; malformed and unsupported schemes are denied. Operating-system open failures are reported to stderr and do not become unhandled rejections.

Tray image creation fails loud when the PNG is missing or empty because a hidden window without a visible recovery command violates close-to-tray behavior.

## Verification

Development follows red-green-refactor. Lifecycle unit tests first prove single disposal, failure exit codes, deadline escalation, repeated-request escalation, and removable signal and Electron listeners. Window tests prove close-to-hide, final close, minimized restoration, internal navigation, denied redirects, delegated external links, and handled open failures. Tray tests prove the two-command menu, double-click restoration, explicit quit, and idempotent disposal.

A keyless lifecycle snapshot runs the real controller against trace-recording native adapters and records `boot → hide → restore → graceful quit`. It protects the product-visible event order without requiring a graphical CI session.

The focused verification set is the desktop unit tests, the desktop lifecycle snapshot, the desktop Host bundle tests, `build:shell`, a built-preload assertion, the affected TypeScript compiler face, documentation synchronization, lint, and `git diff --check`. A macOS Electron smoke verifies splash startup, close-to-tray, tray restoration, second-instance restoration, external link delegation, and explicit quit. Windows-native tray and installer behavior remains CI and target-platform evidence.

## Documentation

The desktop application README documents close-to-tray behavior and the explicit quit command. The desktop subsystem English and Chinese references define lifecycle ownership, restoration sources, navigation rules, shutdown failure behavior, and the two-item tray. A new implemented Agent Note owns the decision to keep native lifecycle in the Electron carrier while the Host closure remains Electron-independent.

## Acceptance criteria

- A clean checkout can run `apps/desktop/tests/fetch-pump.spec.ts` without prebuilt connection artifacts.
- Both desktop shell bundles retain Electron as a runtime external, and the preload bundle uses Electron's `contextBridge` instead of the npm launcher module.
- Closing the main window hides it without disposing the Host or ending the process.
- The tray show command, tray double click, Dock activation, and a second launch restore and focus the existing window.
- The tray contains only show and quit commands in this phase.
- Every explicit exit source disposes the Host once, has a five-second deadline, and escalates immediately on a repeated request.
- Main-frame navigation remains inside `dsh://app`; only valid HTTP, HTTPS, and mail links requested as new windows reach the operating system.
- Startup, disposal, tray-image, and external-open failures follow the documented visible or stderr failure behavior.

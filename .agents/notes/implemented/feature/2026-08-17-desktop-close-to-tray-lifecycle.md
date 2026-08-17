# Agent Note: Desktop close-to-tray lifecycle

Status: implemented

English | [中文](2026-08-17-desktop-close-to-tray-lifecycle.zh.md)

## Problem

The first desktop shell treated native window and process events as independent callbacks. Closing the last window quit on non-macOS platforms, a Host exit request called `app.exit()` without releasing the Host, and the `before-quit` disposer was installed only after successful Host boot. Repeated quit requests, disposal rejection, early startup failure, second-instance restoration, tray ownership, and unsafe main-frame navigation had no single policy.

Desktop users expect a long-running agent task to survive an accidental window close. The process therefore needs a native lifecycle that distinguishes hiding the only window from ending the Host and that still fails within a bounded time when cleanup wedges.

## Decision

Native lifecycle ownership stays in `apps/desktop`. The Electron entry acquires the single-instance lock first, then creates one `DesktopShutdown` controller before application readiness. The controller receives tray Quit, operating-system quit, signals, Host exit requests, and fatal shell failures. An ordinary BrowserWindow close only hides the window; tray actions, activation, and a second launch restore the same handle.

Shutdown releases the IPC pump, the Host, then the tray and window. The first request waits at most five seconds. Disposal rejection or timeout maps a clean request to exit code `1`; a second request exits immediately. Main-frame navigation accepts only the exact `dsh://app` authority, every child window is denied, and only `http:`, `https:`, and `mailto:` requests are delegated to the operating system.

The Host bundle remains Electron-independent. It continues to expose a settled handle and a `requestExit` callback, while Electron-specific windows, menus, images, process signals, and application events remain in the shell. This preserves one reusable Host boot path and prevents the Cordis tree from depending on a native UI runtime.

## Verification

- `apps/desktop/tests/lifecycle.spec.ts` pins single disposal, timeout, rejection, repeated-request escalation, listener removal, and resource order.
- `apps/desktop/tests/window.spec.ts` pins close-to-hide, restoration, exact navigation, external URL delegation, and opener failure reporting.
- `apps/desktop/tests/tray.spec.ts` pins the two-command menu, double-click restoration, image validation, and idempotent cleanup.
- `apps/desktop/tests/lifecycle.snapshot.ts` records the keyless close, restore, ordered disposal, and clean-exit transcript.
- The desktop TypeScript program and Electron main/preload bundles provide the source and packaging checks. Target-platform tray appearance remains Windows CI and manual-test evidence because injected tests cannot validate operating-system rendering.

## Alternatives considered

**Keep lifecycle flags and callbacks directly in `main.ts`.** Rejected because the previous arrangement already allowed Host, window, and Electron quit paths to bypass one another. A small injected controller makes timeout and repeat-request behavior deterministic without hiding resource ownership.

**Migrate the desktop carrier to a loopback HTTP server while changing lifecycle.** Rejected because the private IPC carrier already provides the required renderer transport without a shared port. A carrier migration would increase exposure and change unrelated protocol behavior without solving native ownership.

**Quit whenever the last window closes.** Rejected because it terminates in-progress Host work and conflicts with the approved tray behavior.

## Consequences

Window visibility no longer indicates process lifetime. Users must choose tray Quit or an operating-system quit action to end the Host. The release adds a persistent tray with only Show and Quit; profile controls, updates, and terminal shortcuts remain separate follow-up work.

The shutdown behavior is testable without Electron or a display server, while platform integration remains thin. Future native resources must join the same ordered disposer rather than adding a direct `app.exit()` or a parallel `before-quit` path.

# Desktop App

English | [中文](desktop-app.zh.md)

The desktop surface bundle: [dsh-desktop-app](../../packages/bundle/desktop-app) provides `ctx.desktopRuntime` (`DesktopRuntime`) — the single consumption face through which the Electron shell drives the same Cordis tree the web and CLI surfaces share. It is an optional capability of the desktop GUI stack, not part of the agent-loop spine, and it is a consumer of [dsh-client-connection](../../packages/client/connection): the `/api` dispatch face (TypertGateway interceptor + apiproxy fallback) the IPC fetch pump consumes carries every renderer call. The desktop tree has no web server, no HMR, and no LAN surface; the transport between the renderer and the host is a private IPC bridge, laid out in [the desktop carrier design](../../.agents/notes/implemented/architecture/2026-08-15-desktop-carrier-layering.md).

Source: [`packages/bundle/desktop-app/src/index.ts`](../../packages/bundle/desktop-app/src/index.ts)

## The consumption face

`DesktopRuntime` is what the Electron main process imports from the packaged host closure. `fetch(request)` dispatches a renderer fetch against the `/api` face — the same interceptor-plus-fallback composition an HTTP request would hit, minus the HTTP server. `graph()` returns the current composed `window.__DSH_BOOT__` graph, `clientPath(id)` the absolute path of one plugin's built client bundle, and `frontendIndex()` the absolute path of the frontend `index.html` this surface serves. `host-boot` (in the same package) boots the desktop profile end to end and returns a settled handle carrying this face; because the shell and the plugin tree load that boot from the same packaged closure, they share one Cordis instance.

## The transport

The renderer runs under the `dsh://` custom protocol (an opaque origin). Its only privileged surface is the preload-exposed `window.__DSH_DESKTOP__` bridge, which ships fetch requests over six fixed IPC channels (`request` upstream; `response`/`chunk`/`end`/`error` downstream; `abort` upstream). The renderer's `DesktopApiClient` — a third `AbstractApiClient` carrier alongside fixture and web — moves bytes across that bridge and rebuilds a streaming WHATWG `Response`. No new protocol, no WebSocket, no shared port: the renderer talks to the same process over a private channel.

## Native carrier lifecycle

The Electron main process owns one window, one tray, and one IPC pump; the Electron-independent Host handle continues to own the Cordis tree. An ordinary window close is cancelled and hides the window without touching the Host. The tray Show command, a tray double-click, a second application launch, and the operating-system activation event all restore and focus the same window. `window-all-closed` does not end the process.

Main-frame navigation stays inside the exact `dsh://app` authority. Child-window requests are always denied; only `http:`, `https:`, and `mailto:` URLs are delegated to the operating system, and native opener failures are reported without becoming unhandled rejections.

Tray Quit, operating-system quit, `SIGINT`, `SIGTERM`, Host exit requests, and fatal shell failures enter one shutdown controller. It removes the IPC pump, disposes the Host, then destroys native resources. The first request receives up to five seconds for orderly disposal; disposal rejection or timeout turns a clean request into exit code `1`, and a repeated request exits immediately.

A packaged POSIX launch recovers the login-shell environment before boot: it runs the user's login shell non-interactively to print `export -p`, takes `PATH` from the result, imports allowlisted locale/toolchain/package-manager names only when the launching environment lacks them, and keeps the inherited environment on timeout or failure ([`apps/desktop/src/shell-environment.ts`](../../apps/desktop/src/shell-environment.ts)). Each launch records a pending marker under Electron user data before boot and promotes it to lastGood only after the renderer loads `dsh://app/`; a stale pending makes the next launch report that the previous one did not complete ([`apps/desktop/src/startup-state.ts`](../../apps/desktop/src/startup-state.ts)).

Main-process failures and non-clean renderer crashes write a timestamped JSON snapshot — failure reason and detail, runtime versions, and PATH plus the resolved homes — to `$DSH_HOME/diagnostics` before the failure path runs ([`apps/desktop/src/crash-evidence.ts`](../../apps/desktop/src/crash-evidence.ts)); a write failure never turns into a second failure.

The tray "Export diagnostics…" command creates `$DSH_HOME/exports/diagnostics-<timestamp>.tar.gz` — the diagnostics directory, the session logs, and an environment-facts file, packed with the platform `tar` — and reports the archive path in a dialog ([`apps/desktop/src/diagnostics-export.ts`](../../apps/desktop/src/diagnostics-export.ts)).

Every pack ends with the packaged-runtime verification ([`scripts/verify-packaged-runtime.ts`](../../scripts/verify-packaged-runtime.ts)): it boots the deployed host closure under plain Node with a temp Harness home and creates one empty session through the IPC-wire client, asserts the packaged bundle carries `THIRD_PARTY_NOTICES.md`, and launches the packaged executable to confirm the renderer reaches readiness (the `lastGood` startup state, skipped on headless Linux or with `DSH_VERIFY_SKIP_LIVE=1`). The packaged host boot resolves the deployed closure root at `resources/host/lib/host-boot.js`; the deploy lands the desktop-app package at the host root, not under `node_modules`.

## The service

`desktopRuntime` (defined in [`packages/bundle/desktop-app/src/index.ts`](../../packages/bundle/desktop-app/src/index.ts)) exposes the four reads above; signatures are in the generated [service catalog](#ctxdesktopruntime--desktopruntime). The glue also registers the `app:desktop-surface` prompt section, orienting newly created sessions to the desktop window (no URL, port, or browser tab; no hot reload; native dialogs available through the usual host tools).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktopruntime--desktopruntime"></a>

### `ctx.desktopRuntime` — `DesktopRuntime`

The Electron main process's consumption face over the settled desktop tree.

```ts cordis-catalog
/**
 * /api dispatch (TypertGateway interceptor + apiproxy fallback) — the IPC pump's carrier.
 * @param request - the fetch request to dispatch against the /api face.
 * @returns the response from the host dispatch.
 */
fetch(request: Request): Promise<Response>

/**
 * Current composed `window.__DSH_BOOT__` graph.
 * @returns the composed client module graph.
 */
graph(): WebBootGraph

/**
 * Absolute path of one plugin's built client bundle.
 * @param id - the client module package id.
 * @returns the resolved bundle path, or undefined when the id is not in the graph.
 */
clientPath(id: string): string | undefined

/**
 * Absolute path of the frontend index.html this surface serves.
 * @returns the frontend index path.
 */
frontendIndex(): string
```

Types: [WebBootGraph](client-modules.md)

Source: [`packages/bundle/desktop-app/src/index.ts:41`](../../packages/bundle/desktop-app/src/index.ts)
<!-- END GENERATED cordis-surface -->

# Agent Note: Desktop carrier layering (IPC fetch bridge)

Status: implemented

English | [中文](2026-08-15-desktop-carrier-layering.zh.md)

## Problem

The browser surface uses `WebApiClient` (HTTP POST + WebSocket downlink) over `127.0.0.1:3080`. An Electron desktop shell cannot use HTTP without a real server — the host process and the renderer are the same OS process, and the renderer runs in a sandboxed `dsh://` opaque origin with no network to the host.

A desktop shell needed a transport that: (a) reuses the entire `AbstractApiClient` protocol layer (rpcId minting, four-quadrant envelope, SSE framing, timeout, zod parse), (b) carries no LAN exposure, (c) survives the renderer's opaque origin, and (d) plugs into the existing `IApiClient` domain methods without changing any business code.

## Decision

**A new `DesktopApiClient` subclass of `AbstractApiClient` replaces `doFetch` with an IPC bridge.** The bridge is a preload-exposed `window.__DSH_DESKTOP__` object (`DesktopFetchBridge`) that carries six wire channels over `ipcRenderer.invoke` / `ipcMain.handle`:

- `dsh-fetch/request` (upstream): serialized URL + method + headers + body as JSON
- `dsh-fetch/abort` (upstream): abort a pending request by id
- `dsh-fetch/response` / `dsh-fetch/chunk` / `dsh-fetch/end` / `dsh-fetch/error` (downstream): streamed response reconstruction

The main process's `fetch-pump` (`mountFetchPump`) receives these IPC invocations, rewrites the fake authority to `http://127.0.0.1`, dispatches through `desktopRuntime.fetch`, and streams the response back chunk-by-chunk. The renderer's `DesktopApiClient` rebuilds a WHATWG `Response` with a `ReadableStream` fed by the chunk events.

The `/api` trust fence treats IPC as loopback-equivalent: the private process-local channel is constructed as a loopback carrier, so the privileged-method pinning (credential access, system prompt authority) applies to desktop IPC calls the same way it applies to `127.0.0.1` HTTP calls.

The Electron preload and main-process glue import `@deepseek-ai/dsh-client-connection/desktop-bridge` from the packaged host closure. That subpath therefore points to a dedicated `lib/desktop-bridge.js` ESM bundle selected by `package.json#files`; it never relies on the TypeScript-emitted `lib/types` JavaScript tree, which is not part of the publication payload.

## Layering

```
packages/client/connection/
  src/client/desktop-bridge.ts       # wire constants, wire types, readDesktopBridge()
  src/client/desktop-api-client.ts   # DesktopApiClient extends AbstractApiClient
  src/client/index.ts                # carrier selection: fixture → desktop → web
  src/index.ts                       # host half: webServer optional, exposes ctx.connection.fetch
packages/client/modules/
  src/index.ts                       # webServer lazy injection (no-op without webServer)
packages/bundle/desktop-app/
  src/index.ts                       # desktopRuntime service (fetch + graph + clientPath + frontendIndex)
  src/host-boot.ts                   # Electron-free profile boot
  src/invariant.ts                   # assertDesktopTree
apps/desktop/
  preload.ts                         # contextBridge → __DSH_DESKTOP__
  src/main.ts                        # Electron shell entry
  src/window.ts                      # BrowserWindow (splash → dsh://app/)
  src/protocol.ts                    # dsh:// custom protocol handler
  src/host-glue/fetch-pump.ts        # IPC fetch pump (ipcMain.handle → desktopRuntime.fetch)
```

## Key design decisions

1. **No new protocol.** The existing four-quadrant RPC envelope, SSE `\n\n` framing, and `IApiClient` domain methods are unchanged. The DesktopApiClient only replaces the transport layer (`doFetch`).

2. **No WebSocket.** The browser surface uses WebSocket for downlink events; the desktop carrier streams the entire `Response.body` through the IPC chunk channel, so SSE events arrive as fetch body chunks — no second connection, no reconnect machine.

3. **No webServer in the desktop tree.** `client-connection`'s host half makes the webServer optional (`inject` drops from `['webServer']` to `[]`), and `client-modules` makes its webServer routes lazy. The desktop tree has no HTTP server at all.

4. **`dsh://` is an opaque origin.** `location.origin === 'null'`, so `AbstractApiClient.resolveBase()` falls to `http://dsh.internal` — the same fake authority the in-process client uses. The fetch-pump rewrites this to `http://127.0.0.1` before dispatch so the trust fence sees loopback.

5. **The shared Cordis instance.** `host-boot.ts` lives inside the bundle package (not the Electron shell), so the shell imports it from the packaged host closure. The shell and the plugin tree share one Cordis instance, one profile, and one data directory.

## Testing

- `packages/client/connection/tests/desktop-bridge.client.spec.ts` — wire constants and bridge validation
- `pnpm run publint` — the packaged `./desktop-bridge` runtime and declaration entries both exist in the manifest-selected payload
- `packages/client/connection/tests/desktop-api-client.client.spec.ts` — DesktopApiClient over a fake bridge
- `apps/desktop/tests/fetch-pump.spec.ts` — IPC pump over injected ipc/sender/fetch
- `packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts` — full profile boot + IPC wire round trip (keyless)

## Alternatives considered

**Tauri / Rust backend.** Rejected: the desktop app is an out-of-the-box wrapper for the existing Node.js host; rewriting the host in Rust would duplicate the entire plugin tree.

**`file://` with HTTP to `127.0.0.1`.** Rejected: requires a running server, which is the web surface's shape — the desktop app's goal is zero-configuration with no server process.

**`nodeIntegration: true` with direct `require`.** Rejected: sandbox safety. The preload exposes only the fetch bridge; the renderer has no Node access.

**Shared memory / Cloneable `Response`.** Rejected: Electron's `protocol.handle` can return a `Response`, but the renderer origin is opaque and the body must be streamed through IPC structured clone — `Uint8Array` is the natural wire format.

## Consequences

The desktop shell reuses every client package unchanged. New `IApiClient` domain methods become available to the desktop renderer without any desktop-specific work. The downlink stream (SSE events) works through the same IPC chunk channel as ordinary responses. The profile system (`PROFILE_TEMPLATES.desktop`) and the user patch layer (`~/.dsh/cordis.patch.yml`) are shared between web and desktop — the same `~/.dsh` data directory serves both surfaces.

# Agent Note: User-owned interactive terminals

Status: implemented

English | [中文](2026-08-20-user-owned-terminal-manager.zh.md)

## Problem

The desktop app had no way for the user to reach a shell. The subprocess seam exposed terminal sessions only to agents, and the tray surfaced profile, update, and diagnostics commands but no terminal entry. A desktop terminal window needs a host-side session owner that is independent of the agent loop — no agent minted, no model input assembled — and a renderer page that streams input, output, resizes, and signals over the existing IPC fetch carrier.

## Decision

`@deepseek-ai/dsh-host-terminal-manager` owns user terminal sessions. `TerminalManagerGateway` registers the `terminalManager` service and publishes six direct Remotes — `spawn`, `write`, `read`, `resize`, `signal`, `close` — that drive one shell through the subprocess seam's `spawnTerminal`. The seam gained `SubprocessTerminalHandle.resize` (local `node-pty` and E2B providers), and `dsh-subprocess` publishes a public `./types` subpath so Typert Remote boundaries can import `SubprocessTerminalSignal` from a non-root type export.

Sessions are user-owned: the renderer spawns the shell with a window size, polls output deltas from a bounded per-session scrollback, writes input, resizes the PTY, signals the foreground process group, and closes. Host dispose terminates every live session. The desktop `cordis.patch.yml` mounts the row, the settled-tree assertion requires `terminalManager`, and the `api-remotes` client assembly mounts the namespace.

The renderer half is a standalone `terminal.html` in `apps/web` built as a second Vite entry. Its page-owned RPC bridge mints RPC ids and wraps the connection envelope directly over the preload IPC bridge — no Cordis client kernel — and xterm bridges keystrokes, output deltas, and fit-driven resizes. The terminal window closes for real (the session is user-owned and reaps on host dispose), while the main window keeps close-to-tray.

The IPC fetch pump became sender-routed: one pump serves every window, responses stream back to the requesting webContents, and in-flight aborts are scoped per sender so one window cannot cancel another's requests. The carrier layering itself ([desktop-carrier-layering](../../implemented/architecture/2026-08-15-desktop-carrier-layering.md)) and the subprocess seam ([subprocess-seam](../../implemented/architecture/2026-07-26-subprocess-seam.md)) keep owning their decisions; this note records the terminal capability built on both.

## Verification

- `packages/host/terminal-manager/tests/manager.spec.ts` pins the six Remote verbs, shell resolution, bounded scrollback, exit facts, and host-dispose reaping.
- `apps/web/tests/terminal-session.spec.ts` and `terminal-bridge.spec.ts` pin the poll loop, resize forwarding, close idempotence, and the wire envelope (method targets, rpcId echo, rejected verdicts).
- `apps/desktop/tests/fetch-pump.spec.ts` pins per-sender response routing and abort scoping across windows.
- The desktop boot snapshot and `desktop-app` invariant tests cover the composed row; the desktop TypeScript program and the desktop-mode web build provide the packaging checks.

## Alternatives considered

**Reuse the full Cordis client kernel on the terminal page.** Rejected because the page only needs six Remote verbs; booting the loader, module table, and shell costs startup complexity without adding capability. The page-owned bridge mirrors the shared connection envelope instead.

**Keep the pump per window with one handler per channel.** Rejected because `ipcMain.handle` registers one handler per channel; a second window would silently replace the first's pump. Sender routing keeps one handler and routes by the invoking webContents.

**Hide the terminal window on close like the main window.** Rejected because a hidden terminal session would keep running with no visible surface; the host reaps sessions on dispose, so closing the window is the natural session end.

## Consequences

The terminal surface is desktop-only and depends on the preload IPC bridge; the page fails loud when opened outside the app. Output reads are poll-driven with no push channel, and scrollback over `maxBufferBytes` is dropped irrecoverably with a one-time `truncated` flag. The tray gained one command (Open Terminal) and the main menu shape is pinned by the tray test.

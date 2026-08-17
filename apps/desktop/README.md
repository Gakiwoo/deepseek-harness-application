# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

The DeepSeek Harness desktop shell (Electron). It wraps the service startup, run management, and the browser surface into an out-of-the-box desktop window — the user needs neither Node.js nor a shell command to run the agent.

The shell is a three-layer Electron app: the **main process** boots the packaged host closure through [`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)'s Electron-free `host-boot`, mounts the `dsh://` custom protocol, and runs the IPC fetch pump; the **preload** exposes only the IPC bridge (`window.__DSH_DESKTOP__`); the **renderer** is the ordinary web frontend over the `DesktopApiClient` carrier. The host and the plugin tree share one Cordis instance.

## Native lifecycle

Closing the window hides it to the native tray; the Host and its current work continue running. **Show DeepSeek Harness**, a tray double-click, or a second application launch restores the same single window. Only the tray's **Quit** command or an operating-system quit request disposes the Host and exits the process. Disposal has a five-second deadline, after which the shell forces a nonzero exit; a repeated quit request escalates immediately. This release's tray contains only **Show DeepSeek Harness** and **Quit**.

## Development

From the repository root:

```sh
pnpm run dev:desktop
```

This builds the packages and frontend, prepares the host closure and resources (`--prepare-only`), and starts Electron against them. Hot reload of the shell sources requires rebuilding the shell bundle (`pnpm --filter @deepseek-ai/dsh-desktop run build:shell`) and restarting; there is no HMR in the desktop surface.

## Packaging

```sh
pnpm run pack:desktop
```

This deploys the host closure into `apps/desktop/resources/host`, builds the desktop-mode frontend into `resources/frontend`, bundles the shell, rebuilds `node-pty` against the Electron ABI, and runs electron-builder. Artifacts land in `apps/desktop/dist/` (mac dmg/zip, win nsis/zip), selected by `DSH_DESKTOP_ARCH` when set.

### Unsigned artifacts

Local and CI artifacts are **unsigned**. On macOS, Gatekeeper blocks a downloaded app — right-click → *Open*, or move it to Applications and open once. On Windows, SmartScreen shows "Windows protected your PC" — choose *More info* → *Run anyway*. Signing/notarization and auto-update are deferred follow-up work.

## Expected size

The app bundles a full host closure plus the Electron runtime; expect roughly 250–350 MB per platform artifact.

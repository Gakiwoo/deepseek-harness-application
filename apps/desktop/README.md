# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

The DeepSeek Harness desktop shell (Electron). It wraps the service startup, run management, and the browser surface into an out-of-the-box desktop window — the user needs neither Node.js nor a shell command to run the agent.

The shell is a three-layer Electron app: the **main process** boots the packaged host closure through [`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)'s Electron-free `host-boot`, mounts the `dsh://` custom protocol, and runs the IPC fetch pump; the **preload** exposes only the IPC bridge (`window.__DSH_DESKTOP__`); the **renderer** is the ordinary web frontend over the `DesktopApiClient` carrier. The host and the plugin tree share one Cordis instance.

## Native lifecycle

Closing the window hides it to the native tray; the Host and its current work continue running. **Show DeepSeek Harness**, a tray double-click, or a second application launch restores the same single window. The tray's **Export diagnostics…** command creates a diagnostics archive under the Harness home, and **Check for updates…** drives the updates capability. **Open Terminal** opens a standalone terminal window backed by the host's `terminalManager` Remote: the renderer page spawns the user shell through the subprocess seam and streams input, output, resizes, and signals over the same IPC pump; closing the window ends the session. Only the tray's **Quit** command or an operating-system quit request disposes the Host and exits the process. Disposal has a five-second deadline, after which the shell forces a nonzero exit; a repeated quit request escalates immediately.

## Profiles

A profile is a plugin composition under `$DSH_HOME/profiles/<name>` (the same layout the CLI's `dsh plugin --profile <name>` maintains); the app always runs one profile. The tray's **Profile** submenu lists the profiles found in the Harness home, marks the one currently running, and disables profiles whose bundles do not compose the desktop tree (they miss `@deepseek-ai/dsh-desktop-app`; the CLI's `web`/`headless` templates and bare `dsh plugin` profiles are not desktop-bootable). Choosing another profile writes a pending marker and restarts the app; the next launch boots the chosen profile. If that launch never reaches readiness (crash, forced quit), the next launch reverts to the profile the app ran as when the switch was requested and reports the revert. The last profile that started successfully is remembered in the startup state, so a crash never leaves the app booting a profile it cannot start ([`apps/desktop/src/profile-switch.ts`](../../apps/desktop/src/profile-switch.ts), [`apps/desktop/src/startup-state.ts`](../../apps/desktop/src/startup-state.ts)).

## Updates

The tray's **Check for updates…** command queries the GitHub Releases feed of this repository for the newest release newer than the running version (prereleases only when the running version is a prerelease), matches the platform artifact (`mac-<arch>.zip` preferred on macOS, `win-x64.exe` on Windows), and requires the matching `<artifact>.sha256` sidecar in the same release. The artifact downloads into Electron user data with sha256 verification; a macOS zip is then extracted and version-verified (ditto, quarantine attribute removed) before a pending marker is written. The next clean quit consumes the marker: macOS swaps the running bundle in place (the old bundle is moved aside and restored when the swap fails), Windows spawns the NSIS installer silently. A release without a matching artifact or checksum sidecar fails loud in the check dialog.

Check and download also work in dev with `DSH_DESKTOP_UPDATE_CHECK=1`; apply stays packaged-only. `DSH_DESKTOP_UPDATE_REPOSITORY=owner/repo` overrides the feed. `pnpm run pack:desktop` writes the `.sha256` sidecars next to every artifact in `apps/desktop/dist/`, so a release of those files satisfies the checksum contract ([`apps/desktop/src/updates.ts`](../../apps/desktop/src/updates.ts)).

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

Every pack ends with the packaged-runtime verification (`pnpm run verify:packed`, [scripts/verify-packaged-runtime.ts](../../scripts/verify-packaged-runtime.ts)): it boots the deployed host closure under plain Node with a temp Harness home and creates one empty session through the IPC-wire client, asserts the packaged bundle carries `THIRD_PARTY_NOTICES.md`, and launches the packaged executable to confirm the renderer reaches readiness (`lastGood` startup state). On headless Linux or with `DSH_VERIFY_SKIP_LIVE=1` the live-launch check is skipped; the other checks still run. Every produced artifact additionally gets a `.sha256` sidecar written next to it.

### Unsigned artifacts

Local and CI artifacts are **unsigned**. On macOS, Gatekeeper blocks a downloaded app — right-click → *Open*, or move it to Applications and open once. On Windows, SmartScreen shows "Windows protected your PC" — choose *More info* → *Run anyway*. In-app updates install the same unsigned artifacts: the applied bundle has its quarantine attribute removed during staging, but a signed/notarized release chain remains follow-up work.

## Expected size

The app bundles a full host closure plus the Electron runtime; expect roughly 180–350 MB per platform artifact (measured at 0.1.0-rc.6: 179–247 MB).

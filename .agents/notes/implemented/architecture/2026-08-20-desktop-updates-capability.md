# Agent Note: Desktop updates capability

Status: implemented

English | [中文](2026-08-20-desktop-updates-capability.zh.md)

## Problem

The desktop app had no update path: every release required a manual download, a manual move into Applications, and a manual first launch with the Gatekeeper/SmartScreen exception. The roadmap (phase 2, item 4) requires a `dsh-desktop` updates capability that checks the GitHub Releases feed, downloads with progress and checksum, and applies on a clean exit — with a manual "check for updates" working before signing exists.

## Decision

**The shell owns an updates capability ([`apps/desktop/src/updates.ts`](../../../../apps/desktop/src/updates.ts)) behind a tray "Check for updates…" command**, following the tray/diagnostics precedent: a pure module with injected natives (`fetch`, `spawn`, `env`, `plistBundleVersion`), a typed error (`DesktopUpdateError`), and unit coverage of every decision.

1. **Feed and channel**: `GET https://api.github.com/repos/{owner}/releases?per_page=5` (repository `Gakiwoo/deepseek-harness-application`, overridable through `DSH_DESKTOP_UPDATE_REPOSITORY`). The newest release newer than the running version wins; prereleases count only when the running version is itself a prerelease (the `0.1.0-rc.x` channel can see rc releases, a stable install never can). Tags that are not semver are ignored.
2. **Artifact matching**: `DeepSeek-Harness-*-mac-<arch>.zip` preferred over the dmg on macOS, `DeepSeek-Harness-*-win-x64.exe` on Windows; any other platform fails loud ("not offered"). A newer release without a matching artifact or without the required `<artifact>.sha256` sidecar fails loud in the check dialog — never a silent "up to date".
3. **Download**: streams to `<userData>/updates/<name>.part` with an incremental sha256; the digest must match the release's sidecar content (`hex  filename`, parsed by `parseChecksum`); mismatch or failed sidecar fetch removes the partial and fails loud; success renames atomically into place. Progress reports at quarter steps through native notifications.
4. **Staging**: a macOS zip is extracted with `ditto -x -k` into `<userData>/updates/extracted-<version>`, the `.app` bundle version must equal the release version (`plutil -extract CFBundleShortVersionString`), and the quarantine attribute is removed (`xattr -dr com.apple.quarantine`) because ditto preserves it and a quarantined updated app is Gatekeeper-blocked on first launch. Success writes `pending.json` (the pending marker) under `<userData>/updates/`.
5. **Apply on clean exit**: the marker is consumed during the shutdown disposal, after the Host and native resources are gone, and only when the app is packaged (`DSH_DESKTOP_UPDATE_CHECK=1` opts dev launches into check/download, never apply). macOS swaps the running bundle: `ditto`-copy the staged bundle next to the running one, rename the old bundle aside, rename the staged copy into place, delete the old bundle and extraction; any failure restores the old bundle and rejects the quit (exit code 1), leaving the marker for the next clean exit. Windows spawns the NSIS installer detached with `/S` and consumes the marker. An install-now quit requests the shutdown with a 120-second budget (`UPDATE_APPLY_TIMEOUT_MS`) because a bundle copy outlives the ordinary five-second disposal deadline; `createDesktopShutdown.request` gained an optional per-request budget.
6. **Checksum contract**: `pack-desktop.ts` writes a `.sha256` sidecar next to every produced artifact (`shasum` format), so a GitHub release of `apps/desktop/dist/` satisfies the capability's checksum requirement; `apps/desktop/tests/build-contract.spec.ts` guards the sidecar step and the shell wiring.

## Testing

- `apps/desktop/tests/updates.spec.ts` (23 tests): channel eligibility and newest-wins selection, artifact preference and platform matching, fail-loud on missing artifact/checksum, checksum parsing, streaming download with digest mismatch cleanup, staging (extraction, version check, quarantine removal, marker write), pending-marker lifecycle, macOS swap success and rollback (read-only destination dir), Windows silent-install spawn, disabled-install rejection, feed repository override, and non-OK feed responses.
- `apps/desktop/tests/tray.spec.ts` covers the new menu entry and its wiring; `build-contract.spec.ts` guards the sidecar step, the shell wiring, and the pending-marker disposal slot; `lifecycle.spec.ts` covers the per-request disposal budget.
- Full desktop suite (104 tests), `tsc -p apps/desktop/tsconfig.json`, and oxlint are clean.

## Alternatives considered

**Adopt `electron-updater` (electron-builder's publish tooling).** It owns differential updates and a publish pipeline, but it assumes the electron-builder publish workflow (update-info endpoint, `latest.yml`/`latest-mac.yml` manifests) and its genericZipUpdater path re-signs and re-notarizes — a blocker before signing exists. The roadmap explicitly scopes pre-signing to a manual check against the same feed; the in-house capability is ~600 lines, fully unit-tested, and swap/install logic stays under our control.

**Apply immediately after download instead of on clean exit.** A bundle swap while the app is running is safe only for the files the running process has loaded; the roadmap requires clean-exit apply, and the shutdown disposal (Host disposed first) guarantees no owned file is in use during the swap.

**Extend the shutdown budget globally instead of per request.** A five-second quit would wait two minutes when no update is pending; the per-request budget keeps ordinary quits fast and bounds only install-now quits.

## Consequences

- Every desktop release must now carry the platform artifacts plus their `.sha256` sidecars (the pack script produces both) and must be published to the repository's GitHub Releases.
- The update channel follows the running version: prerelease installs track prerelease releases, stable installs only stable releases.
- The first launch after an update is the new version with no manual step; an unsigned updated app launches because staging strips the quarantine attribute — signing/notarization remains follow-up work.
- Apply failures exit non-zero and retry on the next clean exit (the marker survives), surfacing the failure instead of silently shipping a half-swapped bundle.
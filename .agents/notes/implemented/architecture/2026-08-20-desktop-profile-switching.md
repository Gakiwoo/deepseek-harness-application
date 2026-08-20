# Agent Note: Desktop profile switching

Status: implemented

English | [中文](2026-08-20-desktop-profile-switching.zh.md)

## Problem

The desktop app always boots the shipped `desktop` profile, so a user who maintains a custom composition through the CLI's `dsh plugin --profile <name>` (or wants to flip between compositions) has no way to select it from the app. The roadmap (phase 3, item 8) requires a tray profile selector with pending-then-restart semantics and last-known-good commit, reusing the phase-1 startup-state file.

## Decision

**The shell owns a profile-switching capability ([`apps/desktop/src/profile-switch.ts`](../../../../apps/desktop/src/profile-switch.ts)) behind a tray "Profile" submenu**, following the updates/diagnostics precedent: a pure module with injected paths, unit coverage of every decision, and Electron kept out of the module.

1. **Profile facts**: a profile is a directory under `$DSH_HOME/profiles/<name>` whose `package.json` carries `dsh.profile.bundles` — the same layout the CLI's `dsh plugin --profile <name>` maintains. `listDesktopProfiles` enumerates the Harness home: `node_modules` (the module-fallback sibling) is never a profile, manifests without a valid `dsh.profile.bundles` array are skipped, and the current profile always appears even when its directory is missing. Order: current first, then desktop-bootable, then name.
2. **Bootability**: a profile composes the desktop tree only when its bundles carry `@deepseek-ai/dsh-desktop-app` (the rows `desktopRuntime`, `clientModules`, `apiProxy`); the CLI's `web`/`headless` templates and bare `dsh plugin` profiles never do, and `assertDesktopTree` rejects them loudly at boot. The tray lists non-bootable profiles disabled (they explain why a CLI-created profile is not selectable) and never offers them as a switch.
3. **Pending marker**: selecting a profile writes `<userData>/pending-profile.json` (`{ name, from, at }`, atomic temp+rename, malformed or missing markers treated as no switch) and relaunches (`app.relaunch()` + orderly quit). The marker names both the target and the profile the app ran as — the revert target.
4. **Boot resolution**: `resolveBootProfile` decides the boot profile before the launch records itself. A pending marker with a stale pending startup record means the switched launch never reached readiness: the marker is consumed and the launch reverts to the marker's `from` profile. A pending marker alone boots the marker's profile (the marker survives until the launch commits). Without a marker, the last profile that reached readiness boots (`lastGood.profile`), falling back to `desktop`.
5. **Last-known-good commit**: the startup-state record gained an optional `profile` field (`beginStartup(stateFile, launchId, at, profile)`); commit promotes it into `lastGood`. Once the renderer loads, `clearPendingProfile` consumes the marker so a later crash no longer reverts. A reverted switch reports through the existing recovery dialog with a switch-specific message naming the failed and reverted profiles; non-switch recovery keeps the previous message.
6. **Host boot**: `bootDesktopHost` gained `options.profile` (default `desktop`), passed to `loadProfile`; unknown profiles fail loud there ("does not exist; create it with 'dsh plugin …'"), which is exactly the failure the revert path handles.

## Testing

- `apps/desktop/tests/profile-switch.spec.ts` (14 tests): profile enumeration (bootability flags, current-first ordering, module-fallback/non-profile/malformed-manifest skipping, missing current profile), pending-marker round trip and malformed handling, the full boot-resolution decision table (no marker → lastGood/desktop; marker alone → switch kept; marker + stale pending → revert and consume; revert without a lastGood record), and the startup-state round trip through `writeStartupState`.
- `apps/desktop/tests/startup-state.spec.ts` gained the profile field: begin/commit carry it, legacy records without it stay valid, non-string profiles drop the record.
- `apps/desktop/tests/tray.spec.ts` covers the Profile submenu (radio items, checked current, disabled non-bootable, click routing); `packages/bundle/desktop-app/tests/host-boot-branches.spec.ts` covers the profile option and the default; `build-contract.spec.ts` guards the boot-resolution ordering (resolve before beginStartup) and the tray wiring.
- Full desktop suite (121 tests) plus the desktop-app host suite, `tsc -p apps/desktop/tsconfig.json`, `tsc -b tsconfig.host.json --force`, and oxlint are clean.

## Alternatives considered

**Offer every profile and let boot failure be the only guard.** A switch to `web`/`headless`/bare profiles always fails `assertDesktopTree`, so the selector would offer guaranteed-broken switches; the disabled-item rendering keeps the mechanism honest while the revert path still protects against genuinely broken custom compositions.

**Derive the revert target from `lastGood` instead of the marker.** At switch time the app may itself be an uncommitted launch (the previous switch still pending); the marker's `from` records the profile the user actually saw running, which is the correct revert target even mid-recovery.

**Merge the marker into the startup-state file.** The marker's lifecycle (write at switch, consume at commit, clear at revert) differs from the launch records', and one file would let a stale launch record clobber a fresh switch; two files keep each concern atomic and independently corruptible-safe.

## Consequences

- The desktop app can now run any desktop-bootable profile from `$DSH_HOME/profiles/`, including CLI-managed compositions; a failed switch reverts to the last profile that started successfully with a user-visible report.
- Profiles without `@deepseek-ai/dsh-desktop-app` in their bundles are not selectable; users extend the desktop profile or copy its bundle list into a custom profile.
- The startup-state file format gained an optional field; records without it remain valid, and `SESSION_FORMAT_VERSION`-style versioning is unaffected (the desktop marker is not a session artifact).
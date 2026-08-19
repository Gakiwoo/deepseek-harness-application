# Agent Note: Desktop shell environment recovery and startup rollback

Status: implemented

English | [中文](2026-08-20-desktop-shell-environment-and-startup-rollback.zh.md)

## Problem

Finder and Dock launches on macOS supply a minimal environment: `PATH` is `/usr/bin:/bin:/usr/sbin:/sbin` and locale, toolchain, and package-manager variables are absent. The model's shell and file tools then spawn `git`, `node`, and `pnpm` against that PATH, and the packaged desktop fails for users who never open a terminal.

A startup failure shows an error box and exits; the next launch repeats the same attempt with no memory of the previous failure. A persistently broken generation offers no recovery path, and the user cannot tell whether the last launch ever reached readiness.

## Decision

**`apps/desktop/src/shell-environment.ts` recovers the login-shell environment on packaged POSIX launches.** Before host boot, `recoverShellEnvironment` runs the user's login shell (`SHELL` when it is an existing zsh or bash, otherwise `/bin/zsh` then `/bin/bash`) with `-ilc 'export -p'`, parses the output (bash `declare -x` and zsh `export` lines, both quote styles), and merges: `PATH` is always taken from the shell (except an empty value); `SHELL_FILL_ALLOWLIST` names (locale/timezone, toolchain locators, package-manager homes) are imported only when the launching environment lacks them. The allowlist is the security boundary: nothing outside it is ever imported, so login-shell credentials never reach the app process. A capture that exceeds the 2-second timeout or the 64 KiB output cap is killed and ignored; a failing or erroring child keeps the inherited environment. Windows and dev launches skip recovery (`app.isPackaged || DSH_DESKTOP_SHELL_ENV === '1'`).

**`apps/desktop/src/startup-state.ts` records a last-known-good marker.** A JSON state file at `join(app.getPath('userData'), 'startup-state.json')` holds `pending` and `lastGood` launch records. `beginStartup` writes a new pending record and reports `recovered` when the previous launch left a stale pending; `commitStartup` promotes the pending record to lastGood and is idempotent. Writes go through a sibling temp file plus rename, so the marker is atomic. Malformed or unreadable state is treated as clean and never blocks startup.

`apps/desktop/src/main.ts` calls `beginStartup` at the top of `bootPrimaryInstance`, awaits `recoverShellEnvironment`, and calls `commitStartup` only after `loadURL('dsh://app/')` succeeds. When the launch recovered a stale pending, the shell writes a stderr line and shows a warning dialog (packaged launches only, fire-and-forget).

## Testing

- `apps/desktop/tests/shell-environment.spec.ts` — parsing (both shell dialects, quoting, bare names), shell resolution and fallbacks, capture success/failure/timeout/truncation over an injectable spawn, and the merge rules (PATH always, missing-only allowlist import, nothing else).
- `apps/desktop/tests/startup-state.spec.ts` — pending/commit transitions, stale-pending recovery, idempotent commit, malformed-state tolerance, atomic write residue.
- The state machine and shell merge are unit-tested; `main.ts` keeps only the orchestration.

## Alternatives considered

**Import `scrubbedParentEnv` from `@deepseek-ai/dsh-subprocess`.** Rejected: the subprocess package imports Cordis, which the Electron shell deliberately does not depend on; the allowlist already guards every imported name, so a scrubbing filter adds nothing.

**Always recover (Windows and dev included).** Rejected: Windows `cmd.exe` semantics differ (no POSIX `export -p`), and dev launches must stay deterministic over the terminal environment.

**Import only PATH.** Rejected: locale and toolchain locators matter just as much for spawned tools, and the allowlist makes the broader import safe.

## Consequences

A packaged POSIX launch can spend up to 2 seconds waiting for the login shell before the window appears; the common case is the user's own fast login shell, and the capture is skipped entirely off POSIX. A force-quit before the renderer loads leaves a stale pending and the next launch reports it honestly ("did not complete") — the commit point is deliberately early. The recovery path is silent when the shell is unavailable, so the app still starts. The desktop shell keeps its zero-dependency boundary: both modules use only Node built-ins.
# Agent Note: Desktop robustness and ecosystem roadmap

Status: proposed

English | [中文](2026-08-20-desktop-robustness-roadmap.zh.md)

## Problem

The desktop shell (`apps/desktop` + `@deepseek-ai/dsh-desktop-app`) is a clean single-instance Electron carrier over one shared Cordis tree, but it lacks the reliability and distribution surfaces a shipped desktop product needs:

- A Finder or Dock launch on macOS supplies a minimal `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`); spawned tool processes then cannot find `git`, `node`, `pnpm`, or language toolchains, breaking the model's shell and file tools in exactly the common case — a user who never opens a terminal.
- A startup failure shows an error box and exits; the next launch repeats the same attempt with no knowledge of the previous failure, so a persistently broken generation offers no recovery path (postmortem 0005 documents a real instance of this class).
- There is no in-app diagnostics surface: log collection and environment facts require manual shell work that a desktop user cannot be expected to perform.
- The distribution chain is open: unsigned artifacts, no auto-update, no packaging smoke verification of the produced runtime closure.
- Plugin management requires the `dsh` CLI from a terminal; the desktop user has no in-app surface for installing or removing plugins.

The reference project (anywhere-labs/deepseek-harness-desktop) solves these with login-shell PATH recovery, startup-state commits with last-known-good rollback, crash-evidence collection, diagnostics export, an update lifecycle, and an in-app plugin market. This roadmap adapts the valuable parts to this codebase's stronger carrier design (`dsh://` single instance, no HTTP loopback) rather than copying its architecture.

## Proposal

Three phases, each independently shippable and verified.

### Phase 1 — Reliability foundations (this change)

1. **Login-shell environment recovery** (`apps/desktop/src/shell-environment.ts`): packaged macOS/Linux launches run the user's login shell (`SHELL` zsh/bash, `/bin/zsh`/`/bin/bash` fallbacks) in login mode, capture `export -p`, and merge the result: `PATH` always, allowlisted locale/toolchain/package-manager names only when the launching environment lacks them. A 2-second timeout and any spawn failure keep the inherited environment. Windows and dev launches skip recovery.
2. **Startup state commit** (`apps/desktop/src/startup-state.ts`): a small JSON state file under Electron user data records a `pending` launch id before boot and promotes it to `lastGood` only after the renderer loads `dsh://app/`. A stale `pending` on the next launch means the previous run never reached readiness; the shell then reports the recovery fact (dialog when packaged, stderr line always) and continues.
3. **Crash evidence** (follow-up within this phase): unhandled rejection and renderer-crash hooks write a timestamped snapshot (log tail, environment facts, versions) under the Harness home diagnostics directory before the failure path runs.

### Phase 2 — Release closure

4. **Auto-update**: a `dsh-desktop` updates capability checks the GitHub Releases feed for a newer version, downloads with progress and checksum, and applies on a clean exit. Before signing exists, a manual "check for updates" works against the same feed.
5. **Packaging verification chain**: after `scripts/pack-desktop.ts`, run a packaged-runtime smoke (`verify-packaged-runtime`) that boots the produced closure, asserts host readiness and a live renderer, and creates one empty session; add closure/license verify steps alongside the existing pack scripts.
6. **Diagnostics export**: a settings entry and shell command that bundle the desktop log files, the session log directory listing, and scrubbed environment facts into one archive the user can attach to an issue.

### Phase 3 — Ecosystem differentiation

7. **In-app plugin management**: a `ctx.desktopPlugins`-style Host service wrapping the `dsh plugin --profile desktop` CLI semantics (install with pre-spawn snapshot, sealed on success, restored on failure), surfaced as a settings page in the `dsh://` renderer.
8. **Profile switching**: a tray profile selector with pending-then-restart semantics and last-known-good commit, reusing the phase-1 state file.
9. **Built-in terminal**: a window hosting the existing `packages/terminal` PTY capability.

## Alternatives considered

**Adopt the reference project's architecture wholesale (loopback HTTP carrier, desktop as a separately shipped npm plugin).** It works and is community-proven, but it trades this codebase's stronger isolation (`dsh://` opaque origin, no LAN socket, no web server) for ecosystem convenience. The carrier is a security-relevant choice; only the feature set is borrowed, not the transport.

**Switch the upstream relationship from vendored fork to git submodule + patches before phase 1.** This is the largest maintenance win the reference project demonstrates, but it is a repository-wide restructuring with its own risk; it stays out of the roadmap until upstream `0.1.0-rc.7` stability settles.

**Do nothing and ship the current release chain.** Distribution remains limited to manual installs with no recovery, update, or diagnostics story; the postmortem already classifies this as the main product risk.

## Acceptance criteria

Phase 1 (this change):

- A packaged macOS app launched from Finder runs `git`/`node`/`pnpm` through the model's shell tools with no manual PATH setup, and the login shell environment is never consulted on Windows or in dev launches.
- A launch that never reaches the renderer (forced kill mid-startup, boot failure) makes the next launch report the previous failure; a launch that reaches the renderer never false-positives afterwards.
- The state file and its transitions are covered by unit tests; recovery failure never blocks the app from starting.
- Desktop documentation records both mechanisms; Agent Notes ship with the change.

## Risks

- **Startup latency**: login-shell capture adds up to the timeout (2 s) on packaged POSIX launches; the shell is the user's own login shell, so the common case is fast. Mitigation: capture runs once, before host boot, and is skipped when disabled.
- **Shell side effects**: an interactive login shell executes the user's rc files, which can be slow or interactive; the capture runs non-interactively with a timeout and kills on budget, and a failed capture is silent.
- **False recovery reports**: force-quitting before the renderer loads leaves a stale `pending`; the next launch reports a failed startup that was actually a user quit. Accepted: the report is honest ("previous launch did not complete"), and the commit point is deliberately early (renderer load).
- **Allowlist drift**: toolchains move into new environment names; the fixed allowlist needs a documented maintenance path in the shell-environment module JSDoc.
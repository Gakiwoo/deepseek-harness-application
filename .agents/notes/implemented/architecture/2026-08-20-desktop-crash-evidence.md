# Agent Note: Desktop crash evidence snapshots

Status: implemented

English | [中文](2026-08-20-desktop-crash-evidence.zh.md)

## Problem

When the desktop shell fails — a startup failure, an unhandled rejection, or a crashed renderer — the failure path shows an error box and exits. The user has no record of what happened: no reason, no versions, no environment facts, no way to attach evidence to an issue. Postmortem 0005 diagnosed a startup failure whose root cause took manual shell archaeology to reconstruct.

## Decision

**`apps/desktop/src/crash-evidence.ts` writes a timestamped JSON snapshot to the Harness home diagnostics directory before the failure path runs.** `crashEvidenceDir` resolves `$DSH_HOME/diagnostics` (default `~/.dsh/diagnostics`) through `@deepseek-ai/dsh-home-paths`, the same canonical home resolver the packages use. `buildCrashEvidence` captures the failure reason and detail, the application version, runtime versions (electron/chrome optional, absent in plain-Node runtimes), platform and arch, packaged state, uptime, the OS home, the resolved Harness home, and PATH. The environment facts are deliberately minimal: PATH and the homes are the only environment values — credentials are never captured. `writeCrashEvidence` creates the directory as needed and embeds the ISO timestamp in the file name (`crash-<timestamp>.json`), so snapshots never overwrite each other.

`apps/desktop/src/main.ts` hooks two failure paths:

- `reportFailure` (the funnel for unhandled rejections and startup failures) writes evidence synchronously before the error box and exit.
- The `render-process-gone` listener records non-clean renderer exits (`reason` + `exitCode`); `clean-exit` is not a crash and is ignored.

Evidence writes are best-effort: a write failure logs one stderr line and the failure path proceeds unchanged. `@deepseek-ai/dsh-home-paths` joins the shell's workspace dependencies; its main entry imports no Cordis, so the shell's runtime boundary is unchanged.

## Testing

- `apps/desktop/tests/crash-evidence.spec.ts` — snapshot contents (facts, versions, env, optional omission), `DSH_HOME` override and blank fallback for the diagnostics directory, parseable JSON persistence, and sibling snapshots without overwrite.

## Alternatives considered

**Read a stderr log tail into the snapshot.** Rejected: the shell does not write a log file, so there is no tail to read; capturing stderr requires redirection at launch and is packaging work, not evidence work. The snapshot carries the facts that diagnose startup and PATH failures.

**Hand-roll `DSH_HOME` resolution in the shell.** Rejected: `@deepseek-ai/dsh-home-paths` is the canonical resolver (blank override, tilde expansion) with zero Cordis in its main entry; duplicating it would fork home semantics.

**Record only the failure reason.** Rejected: versions and environment facts are what make a snapshot useful for diagnosis, and they cost nothing to capture.

## Consequences

Every main-process failure and renderer crash leaves a durable, machine-readable record under the Harness home. The recovery dialog's advice ("report it with the log files from the Harness home directory") now has a concrete artifact to point at. Snapshots accumulate without overwriting, and the tray diagnostics export ([desktop diagnostics export](2026-08-20-desktop-diagnostics-export.md)) archives the diagnostics directory as-is. The shell gains one workspace dependency, bundled into `out/main.js` by esbuild.
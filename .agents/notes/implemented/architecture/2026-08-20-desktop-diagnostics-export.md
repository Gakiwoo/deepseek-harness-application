# Agent Note: Desktop diagnostics export

Status: implemented

English | [中文](2026-08-20-desktop-diagnostics-export.zh.md)

## Problem

Users can now collect crash evidence, but nothing assembles it into something attachable to an issue. Reporting a bug means hunting through `$DSH_HOME` by hand — the diagnostics directory, the session logs, versions. The roadmap (phase 2, item 6) calls for a settings entry and shell command; the desktop shell has neither a settings window nor a CLI command surface. It has a tray menu.

## Decision

**The desktop tray gains an "Export diagnostics…" item that creates `$DSH_HOME/exports/diagnostics-<timestamp>.tar.gz` and reports the path in a dialog.** `apps/desktop/src/diagnostics-export.ts` owns the export:

- The archive members are the existing `diagnostics` and `sessions` directories under the Harness home, filtered by existence. A missing sessions directory is tolerated; the export never fails because there are no session logs yet.
- An `export-facts.json` is staged into the diagnostics directory before archiving, so the archive always carries at least one member. The facts reuse the crash-evidence facts — `collectEnvironmentFacts` was extracted from `buildCrashEvidence` for exactly this reuse — plus a sorted listing of the session-log files.
- The archive is created with the platform `tar -czf` (`bsdtar` ships on macOS, Linux, and Windows 10+), spawned with the injectable `ArchiveSpawn` surface. The shell keeps its zero-archive-dependency stance; a non-zero exit fails loud with the code.
- The output lands in `$DSH_HOME/exports`, a sibling of `diagnostics`, so archives never include earlier archives.
- `main.ts` wires the tray item to `runDiagnosticsExport`, which collects facts in the main process and reports the archive path (or the error) through a dialog.

The roadmap proposed a settings entry and shell command; the tray item is the settings surface the shell has today, and the export's machine-readable output keeps a future CLI or settings entry trivial to add.

## Testing

- `apps/desktop/tests/diagnostics-export.spec.ts` — export directory resolution, facts composition (with and without a sessions directory), archive argv (members present and skipped), output path naming, non-zero tar exit rejection, and spawn failure rejection.
- `apps/desktop/tests/tray.spec.ts` — the menu now shows the three commands and routes the export item to its handler.
- `apps/desktop/tests/crash-evidence.spec.ts` — unchanged; the extraction of `collectEnvironmentFacts` preserved the snapshot surface.

## Alternatives considered

**A CLI command (`dsh export diagnostics`).** Rejected: CLI commands run in the booted application tree through `@deepseek-ai/dsh-cmdline`, a heavy surface for one action, and the desktop shell does not ship a CLI entry point.

**Zip through a Node archive library.** Rejected: tar is present on every supported platform, matches the shell's zero-dependency character, and the `ArchiveSpawn` seam keeps it testable.

**Include the whole Harness home.** Rejected: the home can hold arbitrary user data; diagnostics and session logs are the reportable surface.

## Consequences

A user can produce an attachable archive from the tray without touching the filesystem. The export is best-effort user action, never automatic, so it writes nothing until invoked. `collectEnvironmentFacts` is now the single facts collector shared by crash snapshots and exports. The facts file ships alongside the logs, so an archive is self-describing even when the reporter cannot describe the environment. The tray template and its test both changed; the window/quit behavior is unchanged.
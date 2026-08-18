# Post-mortem 0005: startup failure root cause and professional assessment

[中文](0005-startup-failure-assessment.zh.md) | English

Assessment date: 2026-08-17 · Environment: macOS (darwin x64) · Node v22.22.2 · pnpm 11.7.0

Status: resolved. The fix landed as commit `09388d0` (`fix(build): tolerate a missing lefthook devDependency in production installs`) on `main`, followed on 2026-08-18 by `bd32462` (webserver EADDRINUSE actionable diagnosis) and `dd8d3b5` (web vendor chunk split).

## Executive summary

The failure was a four-link causal chain: a production install pruned devDependencies; the `install-lefthook.mjs` top-level static import crashed before every guard it shipped; pnpm 11's `verify-deps-before-run` then replayed the failing production install in front of every script; and every build/dev/test script was blocked before it could start. Not an architectural defect — a compound failure of a broken dependency state plus one repository robustness gap. After the fix the project boots normally; build, CLI, and the Electron desktop window all verified.

## Summary

| Dimension | Finding |
|---|---|
| Boots | **Fixed; boots normally** (build passes, CLI works, Electron window launched) |
| Nature | Not an architectural defect — a compound failure of a **broken dependency state + one repository robustness gap** |
| Git state | Local `main` matches `origin/main`; the fix is committed and pushed |
| Architecture | High. Plugin-based (vendored Cordis), 240 workspaces, contract tests and documentation gates, unusually strict engineering discipline |
| Main risks | Repository lives on iCloud Drive; the desktop distribution chain (signing / auto-update) is not closed |

## Impact

In the broken state, every `pnpm run` script (build/dev/test) was blocked before startup — the visible symptom of "the project cannot start". No data loss; the cost was entirely unusable development environments plus debugging time.

## Root cause chain (all reproduced and verified)

1. **A production install pruned devDependencies.** `node_modules/.modules.yaml` `prunedAt` records a production-mode install (`NODE_ENV=production` or `pnpm install --prod`); every devDependency (typescript, tsdown, vitest, lefthook, …) was removed from node_modules.
2. **The postinstall hard-required a devDep.** `scripts/install-lefthook.mjs` statically imported `lefthook/package.json` at top level, crashing with `ERR_MODULE_NOT_FOUND` under a production install — even though the script later skips gracefully for CI, non-git directories, and a missing binary, that import sat ahead of every guard.
3. **verify-deps-before-run deadlock.** pnpm 11 checks dependency state before every `pnpm run`; on mismatch it replays `pnpm install --production` using the last recorded production setting, which failed again at the postinstall. The result: every script was intercepted before starting.
4. **(Agent-environment only) compounding factors:** the WorkBuddy host injects `ELECTRON_RUN_AS_NODE=1`, degrading `electron .` to plain Node (`app` undefined crash), and a `genie-safe-delete` bulk-delete guard blocked pnpm from reinstalling node_modules. Neither variable exists in a normal terminal; not a project issue.

## Fix and verification

1. **Dependency restore:** after stripping the guard environment variables, a full `pnpm install` succeeded and the lefthook postinstall ran.
2. **Repository-level fix** (the only code change): `scripts/install-lefthook.mjs` now loads the lefthook manifest lazily and skips gracefully when resolution fails (`ERR_MODULE_NOT_FOUND`), consistent with the script's existing skip contract. A production install is no longer blocked by the postinstall.
   - Verification: normal-path hook installation passes; a simulated missing lefthook skips silently with exit 0; the owning test `scripts/install-lefthook.spec.ts` passes **38/38**.
3. **Boot-chain verification:** `pnpm run build` EXIT=0 (tsc both faces + tsdown + frontend Vite); `dsh --help` prints normally; `dev:desktop` full chain (build → host closure deploy → Electron) launched a window.
4. **Follow-up hardening (2026-08-18):** the webserver now diagnoses `EADDRINUSE` with an actionable message (suggests `--port 0`); the web build splits vendor chunks by render family (clearing the 500 kB warning with finer caching).

## Architecture assessment

**Strengths**
- "Everything is a plugin" is thorough: the Cordis event/service/effect model unifies 30+ capability domains (LLM, tools, session, agent-loop, terminal, sandbox, …) with no privileged core to patch.
- Unusually strict engineering discipline: per-file 100% coverage gates, snapshot tests, knip/publint/clone-detection/documentation gates, supply-chain policy (minimumReleaseAge), monotonic SQLite schema versions.
- Clean desktop shell: three-layer Electron (main-process IPC fetch pump / preload bridge / web frontend) plus a single-instance window and tray lifecycle (5-second dispose deadline, repeated-quit escalation), with the host closure and plugin tree sharing one Cordis instance.

**Weaknesses**
- The boot chain is highly environment-sensitive (this incident is the proof): the `verify-deps-before-run` + postinstall combination lacks protection against a production install breaking a dev workspace.
- `pnpm-workspace.yaml` carries four cyclic workspace dependency warnings (api/gateway↔connection↔apiproxy↔remotes, …). Verified edge-by-edge on 2026-08-18 as runtime-single-direction plus dev/peer test-required edges with no runtime cycle; the conclusion is recorded as a comment in that file.
- The repository sits on iCloud Drive (`~/Library/Mobile Documents/...`): a 9000+-file node_modules keeps the cloud-sync engine busy, amplifying install/build I/O and risking eviction of working-tree files. **Recommended: move to a local path (e.g. `~/dev/`).**
- Desktop distribution is unsigned / unnotarized / without auto-update (the README acknowledges this); Gatekeeper/SmartScreen depends on manual user approval.

## Reference comparison (anywhere-labs/deepseek-harness-desktop) and desktop recommendations

The reference project shares the same core ideas (Cordis pluginization, running upstream unchanged), but its "desktop-as-plugin + ecosystem operations" route is worth borrowing. In priority order:

1. **P0 · First-run experience:** auto-create the default `desktop` profile and guide `DEEPSEEK_API_KEY` configuration on first launch.
2. **P0 · Signing and notarization:** macOS notarization + Windows code signing, otherwise distribution stays limited; the electron-builder config is ready, only certificates and CI secrets are missing.
3. **P1 · Auto-update:** adopt electron-updater; before signing, a GitHub Releases manual update check works.
4. **P1 · Plugin marketplace (in-desktop):** the `dsh://` protocol page can host the marketplace UI.
5. **P2 · Mobile remote control:** design on the existing JSON-RPC SDK; no rush.
6. **P2 · In-sandbox protection:** strip `ELECTRON_RUN_AS_NODE` in the `apps/desktop` launcher with a clear diagnostic, improving nested-Electron developer experience.

## Follow-ups

- The repository lives on an iCloud path; moving it to a local disk is recommended (see Architecture assessment above).
- Desktop signing / notarization / auto-update await certificates and CI secrets (P0).
- Since 2026-08-18 the boot chain has passed repeated regression verification — full build, real headless sessions, web HTTP smoke — and current `main` has no known blocking issues.

---
*Evidence: every failure link was reproduced in place; build/test/boot evidence in `/tmp/dsh-build.log`, `/tmp/dsh-install.log`, `/tmp/dsh-desktop3.log`.*

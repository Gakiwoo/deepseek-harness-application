# Agent Note: Packaged-runtime verification chain

Status: implemented

English | [中文](2026-08-20-desktop-packaged-runtime-verification.zh.md)

## Problem

`pack:desktop` produced an artifact that nobody had ever booted: the packaged app shipped, but nothing verified that the deployed host closure boots, that the packaged executable reaches a live renderer, or that the bundle carries its disclosures. The first real attempts to run the artifact surfaced four genuine packaging bugs that a launch on a user machine would have hit:

1. **Host-boot path**: the shell resolved the packaged host boot at `resources/host/node_modules/@deepseek-ai/dsh-desktop-app/lib/host-boot.js`, a path that does not exist — the `pnpm deploy --legacy` layout lands the desktop-app package at the `resources/host` root, so the packaged app would have shown a startup-failure box on first launch.
2. **Missing `dsh-base`**: the desktop profile bundles `dsh-base` and `dsh-desktop-app`, but the desktop bundle never declared `dsh-base`, so the deployed closure could not compose the profile at all.
3. **Missing preset roster**: the desktop host never shipped the agent-presets roster (the CLI overlays a shipped `config/agent-presets` root; the desktop host had no equivalent), so a fresh home failed `session.create` with `agent-preset-not-found`.
4. **Missing closure peers**: `pnpm deploy` installs only regular dependencies — never peerDependencies. With `auto-install-peers=false`, the closure omitted every peer of every package in the graph (the vendored `cordis`/`cosmokit`/plugin family first, then the 26 workspace service packages such as `dsh-timeout`, `dsh-scope`, `dsh-atomic-write`), and the plugin tree failed to load with a cascade of `ERR_MODULE_NOT_FOUND`.

## Decision

**Every pack ends with `verify:packed` ([`scripts/verify-packaged-runtime.ts`](../../../../scripts/verify-packaged-runtime.ts)), three checks that fail loud:**

1. **Host-closure smoke**: the deployed `resources/host/lib/host-boot.js` boots under plain Node with a temp Harness home; `host.describe` answers; a fresh home lists zero sessions; `session.create` makes one; a re-list sees exactly one. The client is the deployed closure's own `dsh-client-connection` bundle over the same in-memory wire bridge the desktop snapshot suite uses, so the check exercises the real IPC-wire contract end to end.
2. **Bundle disclosure**: the packaged app's resources carry the generated `THIRD_PARTY_NOTICES.md`, which `pack-desktop.ts` now copies into `resources/` so the disclosure ships inside the bundle.
3. **Live renderer**: the packaged executable launches with a temp user-data dir (`--user-data-dir`) and a temp `DSH_HOME`; the check polls the startup-state file (phase 1) until `lastGood` — which the shell commits only after the renderer loads `dsh://app/` — then terminates the process. Headless Linux and `DSH_VERIFY_SKIP_LIVE=1` skip this check; the other two always run.

`apps/desktop/src/main.ts` now resolves the packaged host boot at `resources/host/lib/host-boot.js`, matching the deploy layout.

**The closure fixes live in the deploy root's manifest** (`packages/bundle/desktop-app/package.json`):

- The desktop profile's second bundle (`dsh-base`) is declared as a dependency.
- The shipped preset roster is a real file set: `config/agent-presets/` was copied from `apps/cli/config/agent-presets/` into the bundle (and allowlisted in `files`), and the host boot overlays it as a `trust: 'system'` root on the `agent-presets` row (same pattern as the CLI's `profile-boot.ts`), so a fresh home has presets.
- The full closure peer set is declared as dependencies: the vendored `cordis`, `cosmokit`, `cordis-plugin-loader`, `cordis-plugin-group`, `cordis-plugin-include`, `cordis-plugin-logger-console`, `@standard-schema/spec`, `node-addon-require-builtin`, `clsx`, `react`, `react-dom`, and the 26 workspace service packages the closure's plugin tree imports through peer edges. `pnpm deploy` cannot install peers; the deploy root must carry them. A future fix belongs in the deploy path, not the manifest: peers should be materialized into the closure (the Python SDK deploy ships its own root manifest the same way).

## Testing

- `scripts/verify-packaged-runtime.spec.ts` — artifact locating (macOS bundle, Windows unpacked, missing output), startup-state readiness parsing (committed/pending/missing/broken), and display availability.
- `apps/desktop/tests/build-contract.spec.ts` — the packaged host-boot path stays at the deployed closure root (and never under `node_modules`), the pack script ships the notices, and `pack:desktop` chains `verify:packed`.
- The chain itself runs against a real pack (roadmap acceptance: boots the produced closure, asserts host readiness and a live renderer, creates one empty session). The end-to-end run caught bugs 1–4 above in order: each fix was verified by re-running the chain against a fresh artifact, ending with `verify-packaged-runtime: packed desktop artifact verified`.
- The live-renderer check launches with separate temp dirs for `--user-data-dir` and `DSH_HOME`: Electron writes its profile and the startup-state file under `userData`, while the harness home holds profiles, sessions, and the patch watcher; pointing both at one directory makes the harness's chokidar watcher trip on Chromium's `SingletonSocket`.

## Alternatives considered

**Verify only the host closure in Node.** Rejected: the shell bundles, the startup state, and the renderer load are the parts most likely to rot silently (the host-boot path bug lived entirely outside the closure). The live-launch check closes that gap on every platform with a display.

**A CI gate in `run-gates.ts`.** Rejected: verification needs a real pack (network, electron-builder, native rebuild), which CI does not run per commit; the chain is wired to `pack:desktop` instead, where the artifact is fresh.

**Zip-and-scan the artifact for licenses.** Rejected: the meaningful disclosure check is presence and provenance of the generated notices in the bundle, not a re-derivation of the disclosure.

## Consequences

A pack that cannot boot, cannot render, or ships without notices now fails immediately after electron-builder instead of at the user's machine. All four packaging bugs are fixed in the same change that caught them. `pack:desktop` takes longer (a full app launch plus a closure boot) — bounded by the 90-second renderer budget — and `DSH_VERIFY_SKIP_LIVE=1` shortens it on machines without a display. The script is the smoke surface future phase-2 work (auto-update) can extend: it already launches the real artifact against isolated state. The closure-peer fix is manifest-level and must be revisited when the deploy path learns to materialize peers.
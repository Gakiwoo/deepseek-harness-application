# Agent Note: Desktop plugin manager

Status: implemented

English | [中文](2026-08-20-desktop-plugin-manager.zh.md)

## Problem

The desktop app can mutate its plugins only through the CLI's `dsh plugin --profile <name>` outside the app; the settings surface that lists plugins is read-only (the `pluginInventory` Remote), and the roadmap (phase 3, item 7) requires an in-app mutation path: install and remove plugins in the running profile with the CLI's reconcile semantics and a snapshot-restored-on-failure guarantee the CLI does not have.

## Decision

**A new Host package, [`packages/host/plugin-manager`](../../../../packages/host/plugin-manager), publishes a `pluginManager` Remote with `install(spec)` and `remove(name)`**, mutating one profile through pnpm exactly like `dsh plugin --profile <name>`:

1. **Profile and home come from the row's config** (`profile`, default `desktop`; optional `home`, used by tests), following the `frontend-static` Config pattern (`static Config` via schemastery on the service). The desktop host-boot overlay pins the actually booted profile into this row's config (`hasPluginManagerRow`-gated like the `desktop-runtime` overlay), so mutations target the profile that is running.
2. **Snapshot before spawn, settle after**: the pre-spawn manifest is sealed into the bundle layer list on success and restored on failure — a failed pnpm run (registry 404, blocked build script) can never leave the profile declaring a plugin that did not install. The CLI lacks this restore step.
3. **Reconcile on success**: ported from the CLI's `reconcilePlugins`/`exportsPatch` with `NAME = 'dsh-desktop'` — a dependency resolving to a `dsh.bundle`-declaring package joins the layer stack in dependency order (so git/path/tarball/alias specs reconcile by their true package names); a dependency that no longer resolves as a bundle (removed, or the installed version dropped the declaration) leaves it; template bundles that are never dependencies are untouched; a newly added non-bundle dependency stays a plain dependency with a one-time warning.
4. **Async spawn with captured output**: pnpm runs with the profile directory as cwd; Windows resolves pnpm through its `.cmd` shim, which `spawn()` refuses without a shell since the CVE-2024-27980 hardening; a missing pnpm settles with exit code 127 (`PNPM_NOT_FOUND_EXIT`) instead of throwing, and non-ENOENT spawn failures propagate.
5. **Relative path specs anchor to the process cwd**: a bare `.`/`../plugin` (or their `file:`/`link:` forms) from the renderer would silently resolve inside the profile and self-link it; `anchorPathSpec` rewrites relative specs against the cwd before pnpm runs.
6. **First-use profile init**: an absent profile directory is initialized from its template (`PROFILE_TEMPLATES[profile]` falling back to `DEFAULT_PROFILE_BUNDLES`), mirroring the CLI.

The renderer settings UI stays read-only; the mutation Remotes are mounted and typed (client assembly `api-remotes` gains the namespace and payload types) for a follow-up settings page.

## Testing

- `packages/host/plugin-manager/tests/manager.spec.ts` (15 tests): Remote surface (namespace + `remoteMethods`), install/remove success reconcile, non-bundle and unresolvable-dependency warnings, template-bundle preservation, failure snapshot restore, missing-pnpm and null-close-code settlements, non-ENOENT spawn propagation, first-use init, unknown-profile default template, dsh-less manifests, relative-spec anchoring, and the invariant companion registration — all against a real Cordis context with a mocked `node:child_process` spawn and temp homes; the package's `src/` sits at the per-file 100% coverage gate.
- `packages/bundle/desktop-app/tests/invariant.spec.ts` gained the `pluginManager` shape assertion; the existing host-boot boot test proves the shipped composition settles with the row and overlay.
- `tsc -b tsconfig.host.json --force`, `tsc -b tsconfig.client.json`, and the desktop-app host suite are clean.

## Alternatives considered

**Add the mutation methods to `pluginInventory`.** Inventory is a read-only Loader projection by contract (its JSDoc and README say so); mutation belongs to its own seam, and the packages' invariant rules tie each abstraction to a current consumer, so the new package mirrors the inventory package's structure instead.

**Reuse the CLI's `spawnSync`.** The Remote is async by contract (Typert direct Remotes are async); a synchronous child process inside the host would block the whole tree, and async spawn with captured output is the natural fit.

**Mutate the profile directly without pnpm.** Writing `package.json` by hand skips pnpm's lockfile, `node_modules`, and transitive installs; the CLI semantics (which the roadmap names) run pnpm, so the Remote does too.

## Consequences

- The desktop host can now install and remove profile plugins in-process with the CLI's reconcile semantics plus a snapshot-restore the CLI lacks; a failed mutation leaves the profile byte-identical to before.
- The `api-remotes` client assembly carries the `pluginManager` namespace, so a renderer settings page can invoke mutations with typed results; that page itself is deferred.
- The host composition requires `pnpm` on PATH for mutations; the shipped desktop row is inert (read-only) until a settings page calls it, and missing pnpm settles any call with exit code 127.
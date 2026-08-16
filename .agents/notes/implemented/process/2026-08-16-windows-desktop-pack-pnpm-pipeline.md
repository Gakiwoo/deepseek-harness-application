# Agent Note: Windows desktop pack pnpm pipeline

Status: implemented

English | [中文](2026-08-16-windows-desktop-pack-pnpm-pipeline.zh.md)

## Problem

The desktop app's packaging step ([scripts/pack-desktop.ts](../../../../scripts/pack-desktop.ts)) must run on all three legs of the desktop build matrix (`macos-latest` arm64/x64, `windows-latest` x64). macOS legs passed, but the Windows leg failed at several independent pnpm, node-gyp, and electron-builder stages — not one root cause, but a chain of Windows-specific breaks that only surfaced under the real MSVC toolchain and the `/link:vendor/*` deploy closure:

- `spawnSync('pnpm', …)` throws `ENOENT` because the bare `pnpm` executable does not exist as a file on Windows.
- node-gyp cannot recognize the Visual Studio installed on current `windows-latest` (VS18/2026) — `gyp ERR! find VS unknown version "undefined"` — so electron-rebuild cannot rebuild node-pty against the Electron ABI.
- electron-builder's own `npmRebuild` runs a second node-gyp pass over the same native dependency with a bundled node-gyp that hits the same VS-2026 failure.
- electron-builder's 7-Zip archiver cannot follow the `link:vendor/*` symlinks the deploy closure keeps (`cannot find the path`).

## Decision

Restore the full three-platform matrix (including Windows) and make each step survive its Windows failure mode:

1. **Shell-execute the pnpm binary on Windows.** [pack-desktop.ts](../../../../scripts/pack-desktop.ts) resolves the package manager to `pnpm.cmd` on win32 and runs it with `shell: true`, so `spawnSync` finds a real executable and the batch shim works.

2. **Give node-gyp a toolchain that knows VS 2026.** A [pnpm override](../../../../pnpm-workspace.yaml) lifts the copy electron-rebuild bundles from `electron-rebuild>node-gyp: 9.x` to `^12.0.0` (the first release line to recognize VS 18/2026). The workflow also sources the MSVC development environment via `ilammy/msvc-dev-cmd@v1` before packing, setting `VCINSTALLDIR` so node-gyp takes the VS Command Prompt path instead of the broken vswhere probe.

3. **Keep electron-builder's native rebuild off.** [electron-builder.yml](../../../../apps/desktop/electron-builder.yml) sets `npmRebuild: false`. node-pty is the only Electron-ABI native dependency, and the pack script rebuilds it once, for the Free Electron ABI, in step 4 *before* electron-builder runs. A second automatic pass would only re-fail with another node-gyp.

4. **Materialize the deploy closure's symlinks.** [pack-desktop.ts](../../../../scripts/pack-desktop.ts) adds a recursive `dereferenceSymlinks` that rewrites every symlink under the deployed host closure as a real copy before electron-builder archives it, so 7-Zip never needs to follow a symlink.

The workflow keeps `DEEPSEEK_API_KEY` out of the job, sets `CSC_IDENTITY_AUTO_DISCOVERY: "false"` (unsigned artifacts), passes `DSH_DESKTOP_ARCH` per leg, and uploads dmg/zip/exe per platform. `fail-fast: false` keeps one failing leg from cancelling the others while the matrix iterates.

## Alternatives considered

**Single-nodegyp fix via `ilammy/msvc-dev-cmd` alone.** Rejected: even with `VCINSTALLDIR` set, the node-gyp 9 copy realpath'd by electron-rebuild cannot parse the VS18 version string. The toolchain environment fixes discovery only after the version parser can cope, so the override is required, not optional.

**Keep `npmRebuild` on and fix electron-builder's own node-gyp instead.** Rejected: the pack script already owns a deliberate, framework-consistent rebuild in step 4; disabling the automatic pass removes a duplicate expensive build and a second failure point, and is safer than trying to redirect electron-builder's bundled node-gyp.

**Dereference symlinks via a shell pass or archive setting.** Rejected: the symlink-free closure is the same invariant the Python SDK deploy already establishes; doing it in TypeScript with `realpathSync`/`cpSync` is deterministic, cross-platform, and runs before electron-builder regardless of archiver.

## Consequences

All three legs of the desktop build matrix now succeed and upload native artifacts: `DeepSeek-Harness-0.1.0-rc.5-win-x64.zip`, `.exe` (+ blockmap), macOS dmg/zip for arm64 and x64. The Windows node-pty ConPTY/winpty helper binaries pack correctly into `win-unpacked`.

`npmRebuild: false` shifts the obligation onto the pack script: any future Electron-ABI native package added to the host closure must be rebuilt explicitly in step 4, not inferred from electron-builder. The `electron-rebuild>node-gyp` override is repo-wide, so it also affects any other consumer that rebuilds native modules under the lifted node-gyp. The VS-2026-specific fix is coupled to the current `windows-latest` image; a future toolchain may fold node-gyp's version parser into electron-builder itself, which would make the override and the MSVC-dev-cmd sourcing redundant.
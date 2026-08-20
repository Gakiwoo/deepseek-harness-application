# `@deepseek-ai/dsh-desktop-app`

English | [中文](README.zh.md)

The dsh desktop-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md): it sets the coding persona, inserts the desktop host rows (connection, desktop-runtime), the browser plugin roster, and mounts this package's `desktop-runtime` glue plugin. That plugin provides the `desktopRuntime` service consumed by the Electron main process — the IPC fetch carrier (`desktopRuntime.fetch`), the composed client-module graph, the plugin bundle path table, and the frontend index path. It also registers the `app:desktop-surface` prompt section and the `harness:source` section when `surfaceContext` is true.

The connection row owns both ends of the desktop transport: the node half provides the `/api` dispatch face (`ctx.connection.fetch`) that the IPC pump consumes; the browser half is the `DesktopApiClient` carrier selected by the `__DSH_DESKTOP__` bridge. There is no web server, no HMR, and no LAN exposure — the desktop transport is a private process-local IPC channel.

This bundle also exports `host-boot`, the Electron-free profile boot that the desktop shell imports from the packaged host closure. That boot composes the desktop profile over the empty entry list, settles the tree, and returns the `desktopRuntime` handle. The shell and the plugin tree thus share one Cordis instance. It mounts the `plugin-manager` row when the composition carries it and pins the booted profile into that row's config, so profile plugin mutations target the profile that is actually running.

[`dsh-web-app`](../web-app/README.md) is the sibling browser-surface bundle over the same base; [`dsh-headless`](../headless/README.md) is the one-shot runner.

## Model Experience

### Desktop-surface context

#### What the model sees

When `surfaceContext` is true, the `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:desktop-surface` global section (order −98) orients the model to the GUI: the desktop window, the absence of a URL or port, the cold-edit contract (no hot reload), and the availability of native desktop dialogs.

#### Token effect

One source line and one prompt paragraph per session; constant per process.

#### KV Cache effect

The prompt section sits near the system prompt's head and is stable for the life of the process, so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **The built host closure must be deployed** — the `host-boot` entry resolves the desktop bundle from the packaged resources; dev-mode resolution requires the workspace `lib/` artifacts to be built.
- **No web server, no HMR** — the desktop surface is a private IPC channel; file edits take effect on rerun, not through hot reload.
- **Signing/notarization deferred** — CI artifacts are unsigned; macOS Gatekeeper requires right-click open, Windows SmartScreen needs the "More info → Run anyway" path.
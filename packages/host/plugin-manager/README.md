# @deepseek-ai/dsh-host-plugin-manager

English | [中文](README.zh.md)

Host Remote for profile plugin mutation. `PluginManagerGateway` registers the `pluginManager` service and publishes two generated direct Remotes, `pluginManager/install` and `pluginManager/remove`, that install and remove plugins in one profile through pnpm with the CLI's `dsh plugin --profile <name>` semantics: pnpm runs in the profile directory against its manifest, and the `dsh.profile.bundles` layer list is settled from the installed state.

Every mutation takes a pre-spawn manifest snapshot. On a pnpm failure the snapshot is restored, so a failed run can never leave the profile declaring a plugin that did not install; on success the layer list is reconciled from the installed state — a dependency whose package declares a `dsh.bundle` patch joins the layer stack in dependency order, a dependency that no longer does (removed, or the installed version dropped the declaration) leaves it, and template bundles that are not dependencies are never touched. A newly added non-bundle dependency stays a plain dependency and warns once (a later update that gains a `dsh.bundle` activates it automatically).

The managed profile defaults to `desktop` and the harness home to `resolveDshHome()`; the desktop host-boot overlay pins the actually booted profile into this row's config. A missing pnpm on PATH settles the mutation with exit code 127 instead of throwing. The mutation result carries the pnpm exit code, captured output, and the settled bundle layer list. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only mutation service runs pnpm and registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **pnpm required on the host** — the mutation spawns `pnpm` from PATH; when it is missing the result settles with exit code 127, but no mutation takes place. There is no bundled package manager.
- **No renderer UI** — the mutation Remotes are published and mounted, but the desktop settings surface for invoking them is deferred; the existing plugin inventory page remains read-only.
- **Mutates only one profile** — the config pins a single profile for all calls; there is no cross-profile batch operation.
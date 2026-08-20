# Agent Note：桌面配置文件切换（Profile switching）

Status: implemented

[English](2026-08-20-desktop-profile-switching.md) | 中文

## Problem

桌面应用始终引导随附的 `desktop` profile，因此通过 CLI 的 `dsh plugin --profile <name>` 维护自定义组合（或想在不同组合间切换）的用户无法在应用内选择它。路线图（阶段 3，第 8 项）要求一个托盘 profile 选择器，具备 pending-then-restart（先标记后重启）语义与 last-known-good（最近一次成功）提交，并复用阶段 1 的 startup-state 文件。

## Decision

**壳在托盘新增 "Profile" 子菜单，持有配置文件切换能力（[`apps/desktop/src/profile-switch.ts`](../../../../apps/desktop/src/profile-switch.ts)）**，沿用 updates/diagnostics 的先例：纯模块 + 注入路径 + 每个决策的单元覆盖，Electron 不进入模块。

1. **Profile 事实**：profile 是 `$DSH_HOME/profiles/<name>` 下的目录，其 `package.json` 携带 `dsh.profile.bundles`——与 CLI 的 `dsh plugin --profile <name>` 维护的布局一致。`listDesktopProfiles` 枚举 Harness home：`node_modules`（模块回退兄弟目录）永不是 profile，无有效 `dsh.profile.bundles` 数组的清单被跳过，当前 profile 即使目录缺失也总是出现。排序：当前在前，其次可引导桌面的，再按名称。
2. **可引导性**：只有 bundle 携带 `@deepseek-ai/dsh-desktop-app`（提供 `desktopRuntime`、`clientModules`、`apiProxy` 行的组合）才能组成桌面树；CLI 的 `web`/`headless` 模板与裸 `dsh plugin` profile 永远不能，`assertDesktopTree` 会在引导时大声拒绝。托盘将不可引导的 profile 显示为禁用（解释为何 CLI 创建的 profile 不可选择），绝不提供切换。
3. **待应用标记**：选择 profile 会写入 `<userData>/pending-profile.json`（`{ name, from, at }`，原子 temp+rename；缺失或损坏的标记视为无切换）并重启（`app.relaunch()` + 有序退出）。标记同时记录目标与发起切换时应用所运行的 profile——即回退目标。
4. **引导解析**：`resolveBootProfile` 在本次启动记录自身之前决定引导 profile。pending 标记 + 残留 pending 启动记录，意味着被切换的启动从未达到就绪：消费标记，回退到标记的 `from` profile。仅有 pending 标记则引导标记的 profile（标记存活到本次启动提交）。无标记时引导最近一次达到就绪的 profile（`lastGood.profile`），否则回退 `desktop`。
5. **Last-known-good 提交**：startup-state 记录新增可选 `profile` 字段（`beginStartup(stateFile, launchId, at, profile)`）；commit 将其提升进 `lastGood`。渲染进程加载后 `clearPendingProfile` 消费标记，此后崩溃不再触发回退。回退的切换通过既有恢复对话框报告，附带点名失败与回退 profile 的切换专属文案；非切换恢复保留原文案。
6. **宿主引导**：`bootDesktopHost` 新增 `options.profile`（默认 `desktop`），传入 `loadProfile`；未知 profile 在那里大声失败（"does not exist; create it with 'dsh plugin …'"）——这正是回退路径处理的失败。

## Testing

- `apps/desktop/tests/profile-switch.spec.ts`（14 个测试）：profile 枚举（可引导标志、当前优先排序、模块回退/非 profile/损坏清单跳过、缺失的当前 profile）、pending 标记往返与损坏处理、完整引导解析决策表（无标记 → lastGood/desktop；仅标记 → 切换保留；标记 + 残留 pending → 回退并消费；无 lastGood 记录时仍回退）、经 `writeStartupState` 的 startup-state 往返。
- `apps/desktop/tests/startup-state.spec.ts` 新增 profile 字段：begin/commit 携带它；无 profile 的旧记录仍然有效；非字符串 profile 丢弃记录。
- `apps/desktop/tests/tray.spec.ts` 覆盖 Profile 子菜单（radio 项、当前选中、不可引导禁用、点击路由）；`packages/bundle/desktop-app/tests/host-boot-branches.spec.ts` 覆盖 profile 选项与默认值；`build-contract.spec.ts` 守卫引导解析次序（先 resolve 再 beginStartup）与托盘接线。
- 桌面全量套件（121 个测试）加 desktop-app 宿主套件、`tsc -p apps/desktop/tsconfig.json`、`tsc -b tsconfig.host.json --force` 与 oxlint 全部干净。

## Alternatives considered

**提供所有 profile，让引导失败成为唯一防线。** 切换到 `web`/`headless`/裸 profile 必然触发 `assertDesktopTree` 失败，选择器将提供必然失败的切换；禁用项渲染让机制保持诚实，而回退路径仍然保护真正损坏的自定义组合。

**回退目标取 `lastGood` 而非标记。** 发起切换时应用自身可能是一次未提交的启动（前一次切换仍在 pending）；标记的 `from` 记录的是用户实际看到的运行 profile，即使在恢复中途也是正确的回退目标。

**把标记合并进 startup-state 文件。** 标记的生命周期（切换时写入、提交时消费、回退时清除）与启动记录不同，单一文件会让残留启动记录覆盖新切换；两个文件让各自的原子性与独立容错保持清晰。

## Consequences

- 桌面应用现在可以运行 `$DSH_HOME/profiles/` 下任何可引导桌面的 profile，包括 CLI 管理的组合；失败的切换会回退到最近一次成功启动的 profile，并向用户报告。
- bundle 不含 `@deepseek-ai/dsh-desktop-app` 的 profile 不可选择；用户扩展 desktop profile，或把其 bundle 列表复制进自定义 profile。
- startup-state 文件格式新增可选字段；不含它的旧记录仍然有效，且不涉及 `SESSION_FORMAT_VERSION` 式版本化（桌面标记不是会话产物）。
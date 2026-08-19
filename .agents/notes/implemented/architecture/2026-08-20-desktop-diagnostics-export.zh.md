# Agent Note: 桌面诊断导出

Status: implemented

[English](2026-08-20-desktop-diagnostics-export.md) | 中文

## 问题

用户现在能收集崩溃证据，但没有任何东西把证据组装成可以附到 issue 的东西。报 bug 意味着手工翻 `$DSH_HOME`——诊断目录、会话日志、版本。路线图（阶段 2，第 6 项）要求设置入口与 shell 命令；桌面壳既没有设置窗口也没有 CLI 命令面。它有托盘菜单。

## 决策

**桌面托盘新增"Export diagnostics…"项，创建 `$DSH_HOME/exports/diagnostics-<timestamp>.tar.gz` 并用对话框报告路径。** `apps/desktop/src/diagnostics-export.ts` 负责导出：

- 归档成员是 Harness home 下已有的 `diagnostics` 与 `sessions` 目录，按存在性过滤。缺失 sessions 目录被容忍；导出不会因为还没有会话日志而失败。
- 归档前先把 `export-facts.json` 放入 diagnostics 目录，保证归档至少有一个成员。事实复用崩溃证据事实——`collectEnvironmentFacts` 正是为此从 `buildCrashEvidence` 中抽出的——外加排序后的会话日志文件列表。
- 归档用平台 `tar -czf` 创建（macOS、Linux、Windows 10+ 都自带 bsdtar），通过可注入的 `ArchiveSpawn` 面 spawn。壳保持零归档依赖的立场；非零退出带着退出码响亮失败。
- 输出落在 `$DSH_HOME/exports`，是 `diagnostics` 的兄弟目录，归档永远不会包含更早的归档。
- `main.ts` 把托盘项接到 `runDiagnosticsExport`：主进程采集事实，通过对话框报告归档路径（或错误）。

路线图提出设置入口与 shell 命令；托盘项就是壳今天拥有的设置面，而导出的机器可读输出让未来的 CLI 或设置入口加起来很轻松。

## 测试

- `apps/desktop/tests/diagnostics-export.spec.ts` —— 导出目录解析、事实组成（有/无 sessions 目录）、归档 argv（成员存在与跳过）、输出路径命名、非零 tar 退出拒绝、spawn 失败拒绝。
- `apps/desktop/tests/tray.spec.ts` —— 菜单现在显示三个命令，并把导出项路由到它的处理器。
- `apps/desktop/tests/crash-evidence.spec.ts` —— 不变；抽出 `collectEnvironmentFacts` 保持了快照面。

## 备选方案

**CLI 命令（`dsh export diagnostics`）。** 拒绝：CLI 命令通过 `@deepseek-ai/dsh-cmdline` 在启动的应用树里运行，为一个动作付出重代价，且桌面壳不提供 CLI 入口。

**用 Node 归档库打 zip。** 拒绝：每个支持平台都有 tar，符合壳的零依赖性格，`ArchiveSpawn` 接缝保持可测试。

**把整个 Harness home 打进归档。** 拒绝：home 可能装任意用户数据；diagnostics 与会话日志才是可报告的面。

## 后果

用户无需碰文件系统就能从托盘产出可附的归档。导出是用户主动的 best-effort 动作，绝不自动，未调用前不写任何东西。`collectEnvironmentFacts` 现在是崩溃快照与导出共用的唯一事实采集器。事实文件与日志一起进归档，即使报告者描述不清环境，归档也能自描述。托盘模板与其测试都变了；窗口/退出行为不变。
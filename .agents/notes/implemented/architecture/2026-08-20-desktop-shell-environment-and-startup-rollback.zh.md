# Agent Note: 桌面壳环境恢复与启动回滚

Status: implemented

[English](2026-08-20-desktop-shell-environment-and-startup-rollback.md) | 中文

## 问题

macOS 的 Finder 与 Dock 启动只提供极简环境：`PATH` 为 `/usr/bin:/bin:/usr/sbin:/sbin`，locale、工具链与包管理器变量全部缺失。模型的 shell 与文件工具随后针对这个 PATH 派生 `git`、`node` 和 `pnpm`，打包后的桌面应用对从不打开终端的用户失效。

启动失败只会弹一个错误框然后退出；下次启动对上次失败毫无记忆，会重复同样的尝试。持续损坏的 generation 没有任何恢复路径，用户也无从得知上次启动是否到达就绪状态。

## 决策

**`apps/desktop/src/shell-environment.ts` 在打包后的 POSIX 启动中恢复登录 shell 环境。** 宿主启动之前，`recoverShellEnvironment` 以 `-ilc 'export -p'` 运行用户的登录 shell（`SHELL` 为已存在的 zsh 或 bash 时用 `SHELL`，否则依次探测 `/bin/zsh`、`/bin/bash`），解析输出（bash 的 `declare -x` 与 zsh 的 `export` 两种行式、两种引号风格），然后合并：`PATH` 总是取用 shell 的值（空值除外）；`SHELL_FILL_ALLOWLIST` 中的名称（locale/时区、工具链定位符、包管理器 home）仅在启动环境缺失时导入。白名单就是安全边界：白名单之外的名字一律不导入，登录 shell 里的凭据不会进入应用进程。超过 2 秒超时或 64 KiB 输出上限的捕获会被杀死并忽略；派生失败或报错则保留继承的环境。Windows 与开发启动跳过恢复（`app.isPackaged || DSH_DESKTOP_SHELL_ENV === '1'`）。

**`apps/desktop/src/startup-state.ts` 记录 last-known-good 标记。** `join(app.getPath('userData'), 'startup-state.json')` 下的 JSON 状态文件持有 `pending` 与 `lastGood` 两条启动记录。`beginStartup` 写入新的 pending 记录，并在上次启动残留 stale pending 时报告 `recovered`；`commitStartup` 把 pending 提升为 lastGood，且幂等。写入经过同目录临时文件加 rename，标记因此是原子的。损坏或不可读的状态视为干净状态，绝不阻塞启动。

`apps/desktop/src/main.ts` 在 `bootPrimaryInstance` 开头调用 `beginStartup`，等待 `recoverShellEnvironment`，并只在 `loadURL('dsh://app/')` 成功后调用 `commitStartup`。当本次启动恢复了一次残留的 pending，壳会写一行 stderr 并弹出警告对话框（仅打包启动，fire-and-forget）。

## 测试

- `apps/desktop/tests/shell-environment.spec.ts` —— 解析（两种 shell 方言、引号、裸名称）、shell 解析与回退、注入式 spawn 下的捕获成功/失败/超时/截断，以及合并规则（PATH 总是、白名单仅缺失时导入、其余一律不导入）。
- `apps/desktop/tests/startup-state.spec.ts` —— pending/commit 迁移、stale-pending 恢复、幂等 commit、损坏状态容忍、原子写入无残留。
- 状态机与 shell 合并有单元测试覆盖；`main.ts` 只保留编排。

## 备选方案

**从 `@deepseek-ai/dsh-subprocess` 导入 `scrubbedParentEnv`。** 拒绝：subprocess 包导入 Cordis，而 Electron 壳刻意不依赖它；白名单已经守住每一个导入的名字，再加一个过滤层没有增量。

**任何情况下都恢复（包括 Windows 与开发）。** 拒绝：Windows `cmd.exe` 语义不同（没有 POSIX `export -p`），开发启动必须对终端环境保持确定性。

**只导入 PATH。** 拒绝：locale 与工具链定位符对派生工具同样重要，而白名单让更广的导入保持安全。

## 后果

打包后的 POSIX 启动在窗口出现前最多等待 2 秒用于登录 shell；常见情况是用户自己的快速登录 shell，且非 POSIX 平台完全跳过捕获。渲染进程加载前强退会留下 stale pending，下次启动会诚实报告（"未完成"）——提交点刻意提前。shell 不可用时恢复路径静默，应用照常启动。桌面壳保持零依赖边界：两个模块只用 Node 内置能力。
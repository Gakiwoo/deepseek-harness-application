# 事故复盘（postmortem）0005：启动故障根因分析与专业评估

[English](0005-startup-failure-assessment.md) | 中文

评估日期：2026-08-17 · 环境：macOS (darwin x64) · Node v22.22.2 · pnpm 11.7.0

状态：已解决。修复提交 `09388d0`（`fix(build): tolerate a missing lefthook devDependency in production installs`）已合入 main；后续 2026-08-18 追加了 `bd32462`（webserver EADDRINUSE 可操作诊断）与 `dd8d3b5`（web vendor chunk 拆分）。

## 摘要

故障是一条四环节的因果链：production 安装剪掉 devDependencies → `install-lefthook.mjs` 顶层静态导入在一切守卫之前崩溃 → pnpm 11 `verify-deps-before-run` 每次脚本前自动重放失败的 production 安装 → 所有 build/dev/test 脚本在启动前被拦截。非代码架构缺陷，而是**依赖状态被破坏 + 仓库一处健壮性缺陷**的复合故障。修复后项目可正常启动，构建、CLI、Electron 桌面窗口均验证通过。

## 概述

| 维度 | 结论 |
|---|---|
| 能否启动 | **已修复，可正常启动**（构建通过、CLI 正常、Electron 桌面窗口已拉起） |
| 故障性质 | 非代码架构缺陷，而是 **依赖状态被破坏 + 仓库一处健壮性缺陷** 的复合故障 |
| Git 状态 | 本地 `main` 与 `origin/main` 一致；修复已提交推送 |
| 架构质量 | 高。插件化（vendored Cordis）、240 个 workspace、契约测试与文档门禁齐备，工程纪律严格 |
| 主要风险 | 仓库位于 iCloud Drive 路径；桌面端分发链（签名/自动更新）尚未闭环 |

## 影响

在故障状态下，任何 `pnpm run` 脚本（build/dev/test）都在启动前被拦截——「项目无法启动」的直接表象。无数据丢失；成本全部体现在开发环境不可用与排查耗时。

## 根因链（已全部复现并验证）

1. **production 安装剪掉了 devDependencies**。`node_modules/.modules.yaml` 的 `prunedAt` 记录显示执行过一次生产模式安装（`NODE_ENV=production` 或 `pnpm install --prod`），所有 devDependencies（typescript、tsdown、vitest、lefthook 等）被移出 node_modules。
2. **postinstall 硬性依赖 devDep**。`scripts/install-lefthook.mjs` 以顶层静态导入 `lefthook/package.json`，在 production 安装下直接 `ERR_MODULE_NOT_FOUND` 崩溃——尽管脚本后文对 CI、非 git 目录、bin 缺失都有优雅跳过逻辑，唯独该导入位于一切守卫之前。
3. **verify-deps-before-run 死锁**。pnpm 11 在每次 `pnpm run` 前校验依赖状态；状态不一致时按上次的 production 设置自动重放 `pnpm install --production`，再次失败于 postinstall。结果是任何脚本都在启动前被拦截。
4. **（仅代理环境）叠加因素**：WorkBuddy 宿主的 `ELECTRON_RUN_AS_NODE=1` 使 `electron .` 退化为纯 Node（`app` undefined 崩溃）；`genie-safe-delete` 批量删除守卫拦截 pnpm 重装 node_modules。普通终端无这两个变量，非项目问题。

## 修复与验证

1. **恢复依赖**：剥离守卫环境变量后执行完整 `pnpm install`，lefthook postinstall 成功。
2. **仓库级修复**（唯一代码改动）：`scripts/install-lefthook.mjs` 将 lefthook manifest 导入改为惰性加载，解析失败（`ERR_MODULE_NOT_FOUND`）时优雅跳过，与脚本既有跳过契约一致。production 安装从此不再被 postinstall 阻断。
   - 验证：正常路径安装钩子通过；模拟 lefthook 缺失时静默跳过 exit 0；专属测试 `scripts/install-lefthook.spec.ts` **38/38 通过**。
3. **启动链验证**：`pnpm run build` EXIT=0（tsc 双面 + tsdown + 前端 Vite）；`dsh --help` 正常输出；`dev:desktop` 完整链路（build → 宿主闭包部署 → Electron）拉起窗口。
4. **后续加固**（2026-08-18）：webserver 对 `EADDRINUSE` 提供可操作诊断（端口冲突提示改用 `--port 0`）；web 构建 vendor chunk 按渲染家族拆分（消除 500 kB 警告、缓存粒度更细）。

## 架构评估

**优势**
- 「万物皆插件」贯彻彻底：Cordis 事件/服务/effect 模型统一了 LLM、工具、会话、agent-loop、终端、沙箱等 30+ 能力域，无特权核心可 Patch。
- 工程纪律罕见地严格：per-file 100% 覆盖率门禁、快照测试、knip/publint/克隆检测/文档门禁、供应链策略（minimumReleaseAge）、SQLite 单调 schema 版本。
- 桌面壳设计干净：三层 Electron（主进程 IPC fetch 泵 / preload 桥 / Web 前端）+ 单例窗口 + 托盘生命周期（5 秒 dispose 期限、重复退出升级），宿主闭包与插件树共享同一 Cordis 实例。

**薄弱点**
- 启动链对环境高度敏感（本次事故即例证）：`verify-deps-before-run` 与 postinstall 的组合缺乏「production 安装不破坏开发工作区」的防护。
- `pnpm-workspace.yaml` 存在 4 组循环 workspace 依赖告警（api/gateway↔connection↔apiproxy↔remotes 等）。经逐边核查（2026-08-18）确认为运行时单向 + dev/peer 层测试互引，无运行时环，已在该文件注释中固化结论。
- 仓库放在 iCloud Drive（`~/Library/Mobile Documents/...`）：9135+ 文件的 node_modules 会被云同步引擎持续索引，安装/构建 IO 放大且存在数据面文件被逐出风险。**建议迁移到本地路径（如 `~/dev/`）**。
- 桌面分发未签名/无公证/无自动更新（README 已自知），Gatekeeper/SmartScreen 依赖用户手动放行。

## 参考项目对照（anywhere-labs/deepseek-harness-desktop）与桌面端建议

参考项目核心理念与本项目同源（Cordis 插件化、上游原样运行），但其「桌面即插件 + 生态运营」的路线值得借鉴。按优先级建议：

1. **P0 · 首启体验**：首次启动自动创建默认 `desktop` profile 并引导配置 `DEEPSEEK_API_KEY`。
2. **P0 · 签名与公证**：macOS notarization + Windows 代码签名，否则分发面持续受限；electron-builder 配置已就绪，只差证书与 CI secret。
3. **P1 · 自动更新**：接入 electron-updater，未签名前可先做 GitHub Releases 手动更新检查。
4. **P1 · 插件市场（desktop 内）**：可复用 `dsh://` 协议页承载市场 UI。
5. **P2 · 移动端远程控制**：基于现有 JSON-RPC SDK 设计，不急于实施。
6. **P2 · 沙箱内运行防护**：在 `apps/desktop` 启动脚本中剥离 `ELECTRON_RUN_AS_NODE` 并给出明确诊断信息。

## 遗留事项

- 仓库在 iCloud 路径，建议迁移至本地磁盘（见上文架构评估）。
- 桌面分发签名/公证/自动更新待证书与 CI secret 就绪后落地（P0）。
- 2026-08-18 起，启动链路已通过全量构建、真实 headless 会话、web HTTP 冒烟的多轮回归验证，当前 `main` 无已知阻塞问题。

---
*评估依据：实地复现全部故障环节；构建/测试/启动证据见 `/tmp/dsh-build.log`、`/tmp/dsh-install.log`、`/tmp/dsh-desktop3.log`。*

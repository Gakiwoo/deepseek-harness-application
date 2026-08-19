# Agent Note: 桌面崩溃证据快照

Status: implemented

[English](2026-08-20-desktop-crash-evidence.md) | 中文

## 问题

当桌面壳失败——启动失败、未处理拒绝或渲染进程崩溃——失败路径只会弹一个错误框然后退出。用户对发生了什么没有任何记录：没有原因、没有版本、没有环境事实，也无法把证据附到 issue。Postmortem 0005 诊断的那次启动失败，根因是靠手工 shell 考古才重建出来的。

## 决策

**`apps/desktop/src/crash-evidence.ts` 在失败路径运行前，向 Harness home 诊断目录写入带时间戳的 JSON 快照。** `crashEvidenceDir` 通过 `@deepseek-ai/dsh-home-paths` 解析 `$DSH_HOME/diagnostics`（默认 `~/.dsh/diagnostics`）——与各 package 使用同一个规范 home 解析器。`buildCrashEvidence` 捕获失败原因与详情、应用版本、运行时版本（electron/chrome 可选，纯 Node 运行时没有）、平台与架构、是否打包、运行时长、操作系统 home、解析后的 Harness home 与 PATH。环境事实刻意保持最小：PATH 与 home 是仅有的环境值——凭据绝不采集。`writeCrashEvidence` 按需创建目录，并把 ISO 时间戳嵌入文件名（`crash-<timestamp>.json`），快照之间永不互相覆盖。

`apps/desktop/src/main.ts` 挂接两条失败路径：

- `reportFailure`（未处理拒绝与启动失败的汇聚点）在错误框与退出之前同步写证据。
- `render-process-gone` 监听器记录非干净退出的渲染进程退出（`reason` + `exitCode`）；`clean-exit` 不是崩溃，忽略。

证据写入是 best-effort：写入失败只记一行 stderr，失败路径原样继续。`@deepseek-ai/dsh-home-paths` 加入壳的工作区依赖；其主入口不导入 Cordis，壳的运行时边界不变。

## 测试

- `apps/desktop/tests/crash-evidence.spec.ts` —— 快照内容（事实、版本、环境、可选字段省略）、诊断目录的 `DSH_HOME` 覆盖与空白回退、可解析 JSON 持久化、兄弟快照不覆盖。

## 备选方案

**把 stderr 日志尾部读进快照。** 拒绝：壳不写日志文件，没有尾部可读；捕获 stderr 需要启动时重定向，那是打包工作，不是证据工作。快照携带的是诊断启动与 PATH 失败所需的事实。

**在壳里手写 `DSH_HOME` 解析。** 拒绝：`@deepseek-ai/dsh-home-paths` 是规范解析器（空白覆盖、波浪号展开），主入口零 Cordis；重复实现会把 home 语义分叉。

**只记录失败原因。** 拒绝：版本与环境事实正是快照对诊断有用的地方，采集它们没有成本。

## 后果

每一次主进程失败与渲染进程崩溃都会在 Harness home 下留下持久、机器可读的记录。恢复对话框的建议（"带上 Harness home 目录下的日志文件"）现在有了可以指着的具体产物。快照只增不覆盖，托盘的诊断导出（[桌面诊断导出](2026-08-20-desktop-diagnostics-export.md)）直接打包 diagnostics 目录。壳多一个工作区依赖，由 esbuild 打进 `out/main.js`。
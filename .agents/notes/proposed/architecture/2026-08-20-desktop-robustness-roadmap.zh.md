# Agent Note: 桌面可靠性提升与生态路线图

Status: proposed

[English](2026-08-20-desktop-robustness-roadmap.md) | 中文

## 问题

桌面壳（`apps/desktop` + `@deepseek-ai/dsh-desktop-app`）是架在单一共享 Cordis 树上的干净单实例 Electron 载体，但缺少发布型桌面产品所需的可靠性与分发能力：

- 从 macOS Finder 或 Dock 启动时 `PATH` 极简（`/usr/bin:/bin:/usr/sbin:/sbin`），随后衍生的工具进程找不到 `git`、`node`、`pnpm` 或语言工具链，模型的 shell 与文件工具恰恰在最常见场景——从未打开过终端的用户——中失效。
- 启动失败只弹一个错误框然后退出；下次启动对上次失败一无所知，反复重试同一个损坏的 generation，没有任何恢复路径（postmortem 0005 记录了这一类问题的真实实例）。
- 没有应用内诊断入口：收集日志与环境事实需要手动操作 shell，桌面用户无法完成。
- 分发链路未闭合：产物未签名、无自动更新、打包后的运行时闭包没有冒烟验证。
- 插件管理只能通过终端里的 `dsh` CLI；桌面用户没有应用内安装/卸载插件的界面。

参考项目（anywhere-labs/deepseek-harness-desktop）用登录 shell PATH 恢复、带 last-known-good 回滚的启动状态提交、崩溃证据收集、诊断导出、更新生命周期与应用内插件市场解决了这些问题。本路线图只借鉴其中有价值的功能，适配到本代码库更强的载体设计（`dsh://` 单实例、无 HTTP loopback）上，而不是照搬其架构。

## 提案

三个阶段，各自独立可交付并验证。

### 阶段 1 —— 可靠性基础（本次改动）

1. **登录 shell 环境恢复**（`apps/desktop/src/shell-environment.ts`）：打包后的 macOS/Linux 启动运行用户的登录 shell（`SHELL` 中的 zsh/bash，回退到 `/bin/zsh`/`/bin/bash`），以登录模式执行并捕获 `export -p`，然后合并结果：`PATH` 总是采用，白名单内的 locale/工具链/包管理器名称仅在启动环境缺失时采用。2 秒超时与任何派生失败都保留继承的环境。Windows 与开发启动跳过恢复。
2. **启动状态提交**（`apps/desktop/src/startup-state.ts`）：Electron user data 下的一个小 JSON 状态文件在启动前记录 `pending` 启动 id，仅当渲染进程加载 `dsh://app/` 后才提升为 `lastGood`。下次启动时若 `pending` 残留，说明上次运行从未就绪；壳层随后报告该恢复事实（打包时弹对话框，任何情况写 stderr 一行）并继续。
3. **崩溃证据**（本阶段内的后续项）：未处理拒绝与渲染进程崩溃钩子在失败路径运行前，把带时间戳的快照（日志尾部、环境事实、版本）写入 Harness home 的诊断目录。

### 阶段 2 —— 发布闭环

4. **自动更新**：`dsh-desktop` 更新能力检查 GitHub Releases 源是否有更新版本，带进度与校验下载，并在干净退出后应用。在签名落地前，同一个源支持手动"检查更新"。
5. **打包验证链**：在 `scripts/pack-desktop.ts` 之后运行打包运行时冒烟（`verify-packaged-runtime`），启动产物闭包，断言宿主就绪与渲染进程存活，并创建一个空会话；在现有打包脚本旁补充闭包与许可证验证步骤。
6. **诊断导出**：设置项与 shell 命令把桌面日志文件、会话日志目录列表与脱敏后的环境事实打包成一个压缩包，供用户附到 issue。

### 阶段 3 —— 生态差异化

7. **应用内插件管理**：`ctx.desktopPlugins` 风格的 Host 服务包装 `dsh plugin --profile desktop` CLI 语义（安装前快照、成功密封、失败恢复），以设置页形式呈现在 `dsh://` 渲染进程中。
8. **多 profile 切换**：托盘 profile 选择器，pending-然后-重启语义，复用阶段 1 的状态文件做 last-known-good 提交。
9. **内置终端**：承载现有 `packages/terminal` PTY 能力的窗口。

## 备选方案

**整体照搬参考项目的架构（loopback HTTP 载体、桌面作为独立发布的 npm 插件）。** 可行且经社区验证，但会以本代码库更强的隔离（`dsh://` 不透明 origin、无 LAN socket、无 web 服务器）换取生态便利。载体是安全相关的选择；只借鉴功能集，不借鉴传输层。

**在阶段 1 之前把上游关系从 vendored fork 改为 git submodule + patches。** 这是参考项目展示的最大维护收益，但属于仓库级重构，自带风险；在 upstream `0.1.0-rc.7` 稳定之前不进入路线图。

**什么都不做，维持当前发布链。** 分发仍限于手动安装，没有恢复、更新或诊断能力；postmortem 已将其定性为主要产品风险。

## 验收标准

阶段 1（本次改动）：

- 从 Finder 启动的打包 macOS 应用，无需手动设置 PATH 即可通过模型的 shell 工具运行 `git`/`node`/`pnpm`；Windows 与开发启动绝不查询登录 shell 环境。
- 从未到达渲染进程的启动（中途强杀、启动失败）会让下次启动报告上次失败；到达渲染进程的启动之后绝不误报。
- 状态文件及其状态迁移有单元测试覆盖；恢复失败绝不妨碍应用启动。
- 桌面文档记录两个机制；Agent Notes 随改动一起交付。

## 风险

- **启动延迟**：登录 shell 捕获在打包后的 POSIX 启动中最多消耗超时时间（2 秒）；shell 是用户自己的登录 shell，常见情况很快。缓解：捕获只运行一次，在宿主启动之前，且禁用时跳过。
- **shell 副作用**：交互式登录 shell 会执行用户的 rc 文件，可能很慢或进入交互；捕获以非交互方式运行，带超时并在超预算时杀死进程，捕获失败静默。
- **误报恢复**：渲染进程加载前强退会留下残留的 `pending`；下次启动报告一次实际是用户退出的"启动失败"。接受：报告本身诚实（"上次启动未完成"），且提交点刻意提前（渲染进程加载）。
- **白名单漂移**：工具链会迁移到新的环境变量名；固定白名单需要在 shell-environment 模块的 JSDoc 里写明维护路径。
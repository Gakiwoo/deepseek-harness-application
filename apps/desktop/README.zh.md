# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Harness 桌面壳（Electron）。它把服务启动、运行管理和浏览器表层整合为一个开箱即用的桌面窗口——用户既不需要 Node.js，也不需要执行命令就能运行 agent。

壳是三层 Electron 应用：**主进程**通过 [`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md) 的 Electron 无关 `host-boot` 启动打包后的宿主闭包，挂载 `dsh://` 自定义协议，并运行 IPC fetch 泵；**preload** 只暴露 IPC 桥（`window.__DSH_DESKTOP__`）；**渲染进程**是基于 `DesktopApiClient` 载体的普通 Web 前端。宿主与插件树共享同一个 Cordis 实例。

## 原生生命周期

关闭窗口只会把它隐藏到原生托盘；Host 及其当前工作继续运行。**Show DeepSeek Harness**、双击托盘或再次启动应用都会恢复同一个单例窗口。托盘的 **Export diagnostics…** 命令会在 Harness home 下创建诊断归档，**Check for updates…** 则驱动更新能力。**Open Terminal** 会打开一个独立的终端窗口，由宿主侧的 `terminalManager` Remote 支撑：渲染器页面通过 subprocess seam 启动用户 shell，并经由同一条 IPC pump 流式传输输入、输出、尺寸调整与信号；关闭窗口即结束会话。只有托盘的 **Quit** 命令或操作系统退出请求才会 dispose（资源释放）Host 并结束进程。资源释放的期限为五秒，超时后壳会强制以非零状态退出；重复的退出请求会立即升级。

## 配置文件（Profiles）

配置文件（profile）是 `$DSH_HOME/profiles/<name>` 下的插件组合（与 CLI 的 `dsh plugin --profile <name>` 维护的布局一致）；应用始终运行其中一个 profile。托盘的 **Profile** 子菜单列出 Harness home 中找到的 profile，标记当前运行的 profile，并禁用其 bundle 无法组成桌面树的 profile（缺少 `@deepseek-ai/dsh-desktop-app`；CLI 的 `web`/`headless` 模板与裸 `dsh plugin` profile 都无法引导桌面）。选择其他 profile 会写入待应用标记并重启应用；下一次启动将引导所选 profile。若该次启动未能达到就绪（崩溃、强制退出），下一次启动会回退到发起切换时应用所运行的 profile，并报告回退。启动状态会记住最近一次成功启动的 profile，因此崩溃不会让应用反复引导一个无法启动的 profile（[`apps/desktop/src/profile-switch.ts`](../../apps/desktop/src/profile-switch.ts)、[`apps/desktop/src/startup-state.ts`](../../apps/desktop/src/startup-state.ts)）。

## 更新

托盘的 **Check for updates…** 命令查询本仓库的 GitHub Releases feed，寻找比当前版本更新的最新发布（仅当当前版本是预发布版时才包含预发布版），匹配平台产物（macOS 优先 `mac-<arch>.zip`，Windows 为 `win-x64.exe`），并要求同一发布携带对应的 `<artifact>.sha256` 校验和边车。产物下载到 Electron user data，并做 sha256 校验；macOS zip 随后会被解压并做版本校验（ditto，同时移除隔离属性），然后写入待应用标记。下一次干净退出会消费该标记：macOS 就地替换运行中的 bundle（旧 bundle 移开，交换失败时恢复），Windows 静默启动 NSIS 安装程序。发布缺少匹配产物或校验和边车时，检查对话框会大声失败。

开发模式下可用 `DSH_DESKTOP_UPDATE_CHECK=1` 启用检查与下载；应用只发生在打包应用上。`DSH_DESKTOP_UPDATE_REPOSITORY=owner/repo` 可覆盖 feed。`pnpm run pack:desktop` 会在 `apps/desktop/dist/` 中为每个产物写出 `.sha256` 边车，因此发布这些文件即满足校验和契约（[`apps/desktop/src/updates.ts`](../../apps/desktop/src/updates.ts)）。

## 开发

在仓库根部：

```sh
pnpm run dev:desktop
```

这会构建包与前端、准备宿主闭包与资源（`--prepare-only`），并启动 Electron 指向它们。壳源码的热重载需要重新构建壳 bundle（`pnpm --filter @deepseek-ai/dsh-desktop run build:shell`）并重启；桌面表层没有 HMR。

## 打包

```sh
pnpm run pack:desktop
```

这会把宿主闭包部署到 `apps/desktop/resources/host`，把桌面模式前端构建到 `resources/frontend`，打包壳，针对 Electron ABI 重建 `node-pty`，然后运行 electron-builder。产物落在 `apps/desktop/dist/`（mac dmg/zip、win nsis/zip），设置 `DSH_DESKTOP_ARCH` 时按该架构选择。

每次打包都以打包运行时验证收尾（`pnpm run verify:packed`，[scripts/verify-packaged-runtime.ts](../../scripts/verify-packaged-runtime.ts)）：在纯 Node 下用临时 Harness home 启动部署后的宿主闭包，并通过 IPC 线客户端创建一个空会话；断言打包产物携带 `THIRD_PARTY_NOTICES.md`；启动打包后的可执行文件，确认渲染进程达到就绪（`lastGood` 启动状态）。无头 Linux 或设置 `DSH_VERIFY_SKIP_LIVE=1` 时跳过实机启动检查；其余检查仍会运行。每个产物还会额外写出一个 `.sha256` 边车。

### 未签名产物

本地与 CI 产物均**未签名**。在 macOS 上，Gatekeeper 会阻止下载的应用——右键 → *打开*，或移入 Applications 后打开一次。在 Windows 上，SmartScreen 会显示「Windows 已保护你的电脑」——选择 *更多信息* → *仍要运行*。应用内更新安装的是同样的未签名产物：应用后的 bundle 会在暂存阶段移除隔离属性，但签名/公证的发布链路仍是后续工作。

## 预期体积

应用打包了完整宿主闭包外加 Electron 运行时；每个平台产物预计约 180–350 MB（0.1.0-rc.6 实测为 179–247 MB）。

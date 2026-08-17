# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Harness 桌面壳（Electron）。它把服务启动、运行管理和浏览器表层整合为一个开箱即用的桌面窗口——用户既不需要 Node.js，也不需要执行命令就能运行 agent。

壳是三层 Electron 应用：**主进程**通过 [`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md) 的 Electron 无关 `host-boot` 启动打包后的宿主闭包，挂载 `dsh://` 自定义协议，并运行 IPC fetch 泵；**preload** 只暴露 IPC 桥（`window.__DSH_DESKTOP__`）；**渲染进程**是基于 `DesktopApiClient` 载体的普通 Web 前端。宿主与插件树共享同一个 Cordis 实例。

## 原生生命周期

关闭窗口只会把它隐藏到原生托盘；Host 及其当前工作继续运行。**Show DeepSeek Harness**、双击托盘或再次启动应用都会恢复同一个单例窗口。只有托盘的 **Quit** 命令或操作系统退出请求才会 dispose（资源释放）Host 并结束进程。资源释放的期限为五秒，超时后壳会强制以非零状态退出；重复的退出请求会立即升级。本版本的托盘只包含 **Show DeepSeek Harness** 和 **Quit**。

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

### 未签名产物

本地与 CI 产物均**未签名**。在 macOS 上，Gatekeeper 会阻止下载的应用——右键 → *打开*，或移入 Applications 后打开一次。在 Windows 上，SmartScreen 会显示「Windows 已保护你的电脑」——选择 *更多信息* → *仍要运行*。签名/公证与自动更新是后续工作。

## 预期体积

应用打包了完整宿主闭包外加 Electron 运行时；每个平台产物预计约 250–350 MB。

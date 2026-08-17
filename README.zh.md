# DeepSeek Harness 桌面版

[English](README.md) | 中文

<p align="center">
  <img width="876" height="623" alt="deepseek harness" src="https://github.com/user-attachments/assets/555cf094-cee0-45aa-9d0a-405f619ec3d4" />
</p>

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）开发的桌面应用——这是一个开源、基于插件的智能体 agent harness。它把服务启动、运行时管理与浏览器表层封装成开箱即用的 Electron 窗口——你既不需要 Node.js，也不需要任何 shell 命令就能运行 agent。

底层依旧是运行在 [Cordis](https://github.com/cordiverse/cordis) 上的**一切皆插件**架构。桌面壳只改变载体：宿主进程与渲染进程共享同一个 Cordis 实例，IPC fetch 桥取代了 HTTP，因此不残留任何服务器进程或局域网端口。

## 亮点

- **零配置桌面窗口** —— 应用自带完整的宿主运行时，打开即可使用。
- **单一共享运行时** —— 宿主与插件树运行在同一个 Cordis 实例中，共享一个 profile 与一个数据目录。
- **无服务器、无开放端口** —— 渲染进程通过私有的 loopback 等价 IPC 桥（`dsh://` opaque origin）与宿主通信，而非 `127.0.0.1:3080` 的 HTTP。
- **一切皆插件** —— 包括工具、技能与能力在内的整个框架，仍然是你用 `dsh` 时已熟悉的可配置插件树。
- **跨平台** —— 未签名的 macOS arm64/x64（dmg、zip）与 Windows x64（NSIS、zip）产物。

## 环境要求

首次启动时在应用设置中配置 DeepSeek API key。框架经由标准凭据路径读取它；CI 与无头模式使用 `DEEPSEEK_API_KEY`，桌面应用的设置界面则将其保存给应用使用。

## 安装

桌面产物由仓库的 [Build desktop 工作流](.github/workflows/build-desktop.yml) 生成并作为 GitHub Actions 工件上传，每个平台一个：

| 平台 | 架构 | 下载 | 工件 |
|---|---|---|---|
| macOS | arm64 | dmg、zip | `DeepSeek-Harness-<version>-mac-arm64` |
| macOS | x64 | dmg、zip | `DeepSeek-Harness-<version>-mac-x64` |
| Windows | x64 | NSIS、zip | `DeepSeek-Harness-<version>-win-x64` |

应用会捆绑完整的宿主闭包与 Electron 运行时；每个平台产物体积预计约 250–350 MB。

### 未签名产物

本地与 CI 产物均**未签名**。在 macOS 上 Gatekeeper 会拦截下载的应用——右键 → *打开*，或移入“应用程序”后打开一次。在 Windows 上 SmartScreen 会提示“Windows 已保护你的电脑”——选择 *更多信息* → *仍要运行*。代码签名、公证与自动更新属于后续跟进工作。

## 从源码构建

```sh
git clone https://github.com/Gakiwoo/deepseek-harness-application.git
cd deepseek-harness-application
pnpm install
pnpm run build:lib
pnpm run pack:desktop
```

这会先把宿主闭包部署到 `apps/desktop/resources/host`，构建桌面模式前端，打包外壳，按 Electron ABI 重建 `node-pty`，再运行 electron-builder。产物落在 `apps/desktop/dist/`，由 `DSH_DESKTOP_ARCH`（若设置）选择。

若要开发热循环而非打包应用，运行 `pnpm run dev:desktop`。

## 文档

- [桌面应用](docs/subsystems/desktop-app.md) —— 桌面子系统契约与载体分层。
- [架构](docs/architecture.md) —— 基于插件的框架如何组合。
- [开发](docs/development.md) —— 贡献者环境与日常流程。

在本仓库内工作的 agent 请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

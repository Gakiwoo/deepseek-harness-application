# `@deepseek-ai/dsh-desktop-app`

[English](README.md) | 中文

dsh 桌面表层组合包。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-base`](../base/README.md) 之上：设置 coding persona，插入桌面宿主行（connection、desktop-runtime）、浏览器插件名录，并挂载本包的 `desktop-runtime` 粘合插件。该插件提供 `desktopRuntime` 服务，供 Electron 主进程消费——IPC fetch 载体（`desktopRuntime.fetch`）、组合后的客户端模块图、插件 bundle 路径表，以及前端 index 路径。在 `surfaceContext` 为 true 时，它还注册 `app:desktop-surface` 提示词段落与 `harness:source` 段落。

connection 行持有桌面传输的两端：节点半边提供 IPC 泵消费的 `/api` 分发面（`ctx.connection.fetch`）；浏览器半边是 `__DSH_DESKTOP__` 桥选用的 `DesktopApiClient` 载体。没有 Web 服务器、没有 HMR、也没有 LAN 暴露——桌面传输是一条私有的进程内 IPC 通道。

本包还导出 `host-boot`，即桌面壳从打包后的宿主闭包导入的 Electron 无关 profile 启动器。它把 desktop profile 组合到空条目列表之上、结算整棵树，并返回 `desktopRuntime` 句柄。这样壳与插件树共享同一个 Cordis 实例。

[`dsh-web-app`](../web-app/README.md) 是同一 base 之上的浏览器表层兄弟包；[`dsh-headless`](../headless/README.md) 是一次性运行器。

## 模型体验

### 桌面表层上下文

#### 模型看到的内容

当 `surfaceContext` 为 true 时，`harness:source` 段落标明磁盘上的 Harness 实现，但不会声称它就是工作目录；全局段落 `app:desktop-surface`（顺序 −98）则向模型说明 GUI：桌面窗口、没有 URL 或端口、冷编辑约定（无热重载），以及原生桌面对话框的可用性。

#### Token 影响

每个会话一行源码说明和一段提示词；每个进程内保持恒定。

#### KV Cache 影响

该提示词段落位于系统提示词靠前位置，且在进程整个生命周期内稳定，因此不会使跨轮次缓存失效。

## 已知限制与延期工作

- **宿主闭包必须已部署**：`host-boot` 入口从打包后的 resources 解析桌面 bundle；开发模式解析要求 workspace 的 `lib/` 产物已构建。
- **没有 Web 服务器、没有 HMR**：桌面表层是私有 IPC 通道；文件编辑在重跑时生效，而非热重载。
- **签名/公证延期**：CI 工件未签名；macOS Gatekeeper 需右键打开，Windows SmartScreen 需「更多信息 → 仍要运行」。
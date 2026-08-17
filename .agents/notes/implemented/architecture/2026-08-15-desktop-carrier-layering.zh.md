# Agent Note：桌面载体分层（IPC fetch 桥）

Status: implemented

[English](2026-08-15-desktop-carrier-layering.md) | 中文

## 问题

浏览器表层用 `WebApiClient`（HTTP POST + WebSocket 下行）在 `127.0.0.1:3080` 上通信。Electron 桌面壳不能在没有真实服务器的情况下用 HTTP——宿主进程与渲染进程是同一个 OS 进程，且渲染进程运行在被沙箱化的 `dsh://` opaque origin 中，无法通过网络访问宿主。

桌面壳需要一种传输，它要：(a) 复用整个 `AbstractApiClient` 协议层（rpcId 铸造、四象限信封、SSE 分帧、超时、zod 解析），(b) 不带任何 LAN 暴露，(c) 能在渲染进程的 opaque origin 下存活，(d) 不需要改动任何业务代码就能接入现有 `IApiClient` 域方法。

## 决策

**新增 `AbstractApiClient` 的子类 `DesktopApiClient`，把 `doFetch` 替换为 IPC 桥。** 桥是 preload 暴露的 `window.__DSH_DESKTOP__` 对象（`DesktopFetchBridge`），通过 `ipcRenderer.invoke` / `ipcMain.handle` 携带六条线通道：

- `dsh-fetch/request`（上行）：串行化的 URL + method + headers + body，JSON 形式
- `dsh-fetch/abort`（上行）：按 id 中止一个在途请求
- `dsh-fetch/response` / `dsh-fetch/chunk` / `dsh-fetch/end` / `dsh-fetch/error`（下行）：流式重建响应

主进程的 `fetch-pump`（`mountFetchPump`）接收这些 IPC 调用，把假权威重写为 `http://127.0.0.1`，通过 `desktopRuntime.fetch` 分发，再把响应按 chunk 流式回传。渲染进程的 `DesktopApiClient` 用 `ReadableStream` 重建一个 WHATWG `Response`，由 chunk 事件喂入。

`/api` 信任栅栏把 IPC 视为 loopback 等价：这条私有的进程内通道被构造为 loopback 载体，因此特权方法钉扎（凭据访问、系统提示词权威）对桌面 IPC 调用与对 `127.0.0.1` HTTP 调用同样适用。

Electron preload 与主进程胶水从打包后的宿主闭包导入 `@deepseek-ai/dsh-client-connection/desktop-bridge`。因此该子路径指向由 `package.json#files` 选入的独立 `lib/desktop-bridge.js` ESM bundle；它不会依赖 TypeScript 发射的 `lib/types` JavaScript 树，因为后者不属于发布载荷。

## 分层

```
packages/client/connection/
  src/client/desktop-bridge.ts       # wire constants, wire types, readDesktopBridge()
  src/client/desktop-api-client.ts   # DesktopApiClient extends AbstractApiClient
  src/client/index.ts                # carrier selection: fixture → desktop → web
  src/index.ts                       # host half: webServer optional, exposes ctx.connection.fetch
packages/client/modules/
  src/index.ts                       # webServer lazy injection (no-op without webServer)
packages/bundle/desktop-app/
  src/index.ts                       # desktopRuntime service (fetch + graph + clientPath + frontendIndex)
  src/host-boot.ts                   # Electron-free profile boot
  src/invariant.ts                   # assertDesktopTree
apps/desktop/
  preload.ts                         # contextBridge → __DSH_DESKTOP__
  src/main.ts                        # Electron shell entry
  src/window.ts                      # BrowserWindow (splash → dsh://app/)
  src/protocol.ts                    # dsh:// custom protocol handler
  src/host-glue/fetch-pump.ts        # IPC fetch pump (ipcMain.handle → desktopRuntime.fetch)
```

## 关键设计决策

1. **没有新协议。** 既有四象限 RPC 信封、SSE `\n\n` 分帧、`IApiClient` 域方法都不变。DesktopApiClient 只替换传输层（`doFetch`）。

2. **没有 WebSocket。** 浏览器表层用 WebSocket 做下行事件；桌面载体把整个 `Response.body` 通过 IPC chunk 通道流式传输，因此 SSE 事件以 fetch body chunk 形式到达——没有第二条连接，也没有重连机制。

3. **桌面树里没有 webServer。** `client-connection` 的 host 半边把 webServer 设为可选（`inject` 从 `['webServer']` 降为 `[]`），`client-modules` 把 webServer 路由改为惰性。桌面树完全没有 HTTP 服务器。

4. **`dsh://` 是 opaque origin。** `location.origin === 'null'`，因此 `AbstractApiClient.resolveBase()` 落到 `http://dsh.internal`——与进程内客户端使用的假权威相同。fetch-pump 在分发前把它重写为 `http://127.0.0.1`，让信任栅栏看到 loopback。

5. **共享同一个 Cordis 实例。** `host-boot.ts` 放在 bundle 包内（而非 Electron 壳里），因此壳从打包后的宿主闭包导入它。壳与插件树共享一个 Cordis 实例、一个 profile、一个数据目录。

## 测试

- `packages/client/connection/tests/desktop-bridge.client.spec.ts` —— 线常量与桥校验
- `pnpm run publint` —— 打包后的 `./desktop-bridge` 运行时与声明入口都存在于 manifest 选定的载荷中
- `packages/client/connection/tests/desktop-api-client.client.spec.ts` —— 在假桥上的 DesktopApiClient
- `apps/desktop/tests/fetch-pump.spec.ts` —— 注入式 ipc/sender/fetch 上的 IPC 泵
- `packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts` —— 完整 profile 启动 + IPC 线往返（keyless）

## 备选方案评估

**Tauri / Rust 后端。** 拒绝：桌面应用是现有 Node.js 宿主的开箱即用封装；把宿主重写成 Rust 会复制整棵插件树。

**`file://` + HTTP 到 `127.0.0.1`。** 拒绝：需要一个运行中的服务器，这正是 Web 表层的形态——桌面应用的目标是零配置、无服务器进程。

**`nodeIntegration: true` 直接 `require`。** 拒绝：沙箱安全。preload 只暴露 fetch 桥；渲染进程没有 Node 访问权。

**共享内存 / Cloneable `Response`。** 拒绝：Electron 的 `protocol.handle` 可以返回 `Response`，但渲染进程 origin 是 opaque 的，body 必须通过 IPC structured clone 流式传输——`Uint8Array` 是自然的线格式。

## 影响

桌面壳原样复用所有客户端包。新增的 `IApiClient` 域方法无需任何桌面专属工作即可供桌面渲染进程使用。下行流（SSE 事件）与普通响应走同一条 IPC chunk 通道。profile 系统（`PROFILE_TEMPLATES.desktop`）与用户 patch 层（`~/.dsh/cordis.patch.yml`）在 web 与桌面之间共享——同一个 `~/.dsh` 数据目录同时服务两个表层。

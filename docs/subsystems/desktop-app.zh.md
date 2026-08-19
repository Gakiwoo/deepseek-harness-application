# Desktop 应用

[English](desktop-app.md) | 中文

桌面表层组合包：[dsh-desktop-app](../../packages/bundle/desktop-app) 提供 `ctx.desktopRuntime`（`DesktopRuntime`）——Electron 壳驱动与 web、CLI 表层共享的同一棵 Cordis 插件树的唯一消费面。它是桌面 GUI 栈的一项可选能力，不属于 agent loop（智能体循环）主干，并且是 [dsh-client-connection](../../packages/client/connection) 的消费方：IPC fetch 泵所消费的 `/api` 分发面（TypertGateway 拦截器 + apiproxy 回退）承载每一次渲染进程调用。桌面树没有 web 服务器、没有 HMR、没有 LAN 暴露面；渲染进程与宿主之间的载体是一条私有 IPC 桥，其分层见[桌面载体设计](../../.agents/notes/implemented/architecture/2026-08-15-desktop-carrier-layering.md)。

源码：[`packages/bundle/desktop-app/src/index.ts`](../../packages/bundle/desktop-app/src/index.ts)

## 消费面

`DesktopRuntime` 是 Electron 主进程从打包好的宿主闭包导入的面。`fetch(request)` 把一次渲染进程 fetch 分发到 `/api` 面——与 HTTP 请求命中的拦截器加回退组合相同，只是没有 HTTP 服务器。`graph()` 返回当前组合出的 `window.__DSH_BOOT__` 图，`clientPath(id)` 返回某个插件已构建 client bundle 的绝对路径，`frontendIndex()` 返回该表层提供的 `index.html` 绝对路径。同包中的 `host-boot` 端到端启动 desktop profile，并返回携带该面的已定居句柄；由于壳与插件树从同一个打包闭包加载该启动器，它们共享同一个 Cordis 实例。

## 载体

渲染进程运行在 `dsh://` 自定义协议（不透明 origin）之下。它唯一的特权面是 preload 暴露的 `window.__DSH_DESKTOP__` 桥，它通过六条固定的 IPC 通道承载 fetch 请求（上行 `request`；下行 `response`/`chunk`/`end`/`error`；上行 `abort`）。渲染端的 `DesktopApiClient`——fixture 与 web 之外的第三个 `AbstractApiClient` 载体——在桥上传送字节，并重建一个流式的 WHATWG `Response`。没有新协议、没有 WebSocket、没有共享端口：渲染端通过一条私有通道与同一进程对话。

## 原生载体生命周期

Electron 主进程拥有一个窗口、一个托盘和一个 IPC 泵；Electron 无关 Host 句柄继续拥有 Cordis 树。普通的窗口关闭会被取消，并在不触及 Host 的情况下隐藏窗口。托盘的显示命令、双击托盘、再次启动应用以及操作系统激活事件都会恢复并聚焦同一个窗口。`window-all-closed` 不会结束进程。

主框架导航只能留在精确的 `dsh://app` authority 内。子窗口请求一律拒绝；只有 `http:`、`https:` 和 `mailto:` URL 会交给操作系统处理，原生打开器失败会被报告，不会成为未处理 rejection。

托盘退出、操作系统退出、`SIGINT`、`SIGTERM`、Host 退出请求以及壳的致命故障都会进入同一个关闭控制器。它依次移除 IPC 泵、dispose Host，然后销毁原生资源。第一个请求最多有五秒完成有序资源释放；资源释放拒绝或超时会把干净退出请求改为退出码 `1`，重复请求则立即退出。

打包后的 POSIX 启动会在 boot 之前恢复登录 shell 环境：它以非交互方式运行用户的登录 shell 打印 `export -p`，`PATH` 取用其结果，白名单内的 locale/工具链/包管理器名称仅在启动环境缺失时导入，超时或失败则保留继承的环境（[`apps/desktop/src/shell-environment.ts`](../../apps/desktop/src/shell-environment.ts)）。每次启动都会在 Electron user data 下记录一个 pending 标记，只有渲染进程加载 `dsh://app/` 后才提升为 lastGood；残留的 pending 会让下次启动报告上次启动未完成（[`apps/desktop/src/startup-state.ts`](../../apps/desktop/src/startup-state.ts)）。

主进程失败与非干净退出的渲染进程崩溃会在失败路径运行前，向 `$DSH_HOME/diagnostics` 写入带时间戳的 JSON 快照——失败原因与详情、运行时版本，以及 PATH 和解析后的 home 路径（[`apps/desktop/src/crash-evidence.ts`](../../apps/desktop/src/crash-evidence.ts)）；写入失败绝不会变成第二次失败。

## 服务

`desktopRuntime`（定义于 [`packages/bundle/desktop-app/src/index.ts`](../../packages/bundle/desktop-app/src/index.ts)）暴露上述四个读取面；签名见生成的[服务目录](#ctxdesktopruntime--desktopruntime)。胶水还注册了 `app:desktop-surface` prompt section，把新建的会话引导到桌面窗口（没有 URL、端口或浏览器标签页，没有热重载，经常规宿主工具即可使用原生对话框）。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktopruntime--desktopruntime"></a>

### `ctx.desktopRuntime` — `DesktopRuntime`

The Electron main process's consumption face over the settled desktop tree.

```ts cordis-catalog
/**
 * /api dispatch (TypertGateway interceptor + apiproxy fallback) — the IPC pump's carrier.
 * @param request - the fetch request to dispatch against the /api face.
 * @returns the response from the host dispatch.
 */
fetch(request: Request): Promise<Response>

/**
 * Current composed `window.__DSH_BOOT__` graph.
 * @returns the composed client module graph.
 */
graph(): WebBootGraph

/**
 * Absolute path of one plugin's built client bundle.
 * @param id - the client module package id.
 * @returns the resolved bundle path, or undefined when the id is not in the graph.
 */
clientPath(id: string): string | undefined

/**
 * Absolute path of the frontend index.html this surface serves.
 * @returns the frontend index path.
 */
frontendIndex(): string
```

Types: [WebBootGraph](client-modules.md)

Source: [`packages/bundle/desktop-app/src/index.ts:41`](../../packages/bundle/desktop-app/src/index.ts)
<!-- END GENERATED cordis-surface -->

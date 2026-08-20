# Agent Note：用户自有的交互式终端

Status: implemented

[English](2026-08-20-user-owned-terminal-manager.md) | 中文

## 问题

桌面应用此前没有任何让用户触达 shell 的途径。subprocess seam 只向 agent 暴露终端会话，托盘也只提供 profile、更新与诊断命令，没有终端入口。桌面终端窗口需要一个与 agent 循环无关的宿主侧会话所有者——不铸造 agent、不组装模型输入——以及一个通过既有 IPC fetch 载体流式传输输入、输出、尺寸调整与信号的渲染器页面。

## 决策

`@deepseek-ai/dsh-host-terminal-manager` 拥有用户终端会话。`TerminalManagerGateway` 注册 `terminalManager` 服务，发布六个直接 Remote——`spawn`、`write`、`read`、`resize`、`signal`、`close`——通过 subprocess seam 的 `spawnTerminal` 驱动一个 shell。seam 新增 `SubprocessTerminalHandle.resize`（本地 `node-pty` 与 E2B 提供方），`dsh-subprocess` 发布公共 `./types` 子路径，使 Typert Remote 边界能从非根类型导出导入 `SubprocessTerminalSignal`。

会话为用户自有：渲染器以窗口尺寸启动 shell，从按会话有界的 scrollback 轮询输出增量，写入输入，调整 PTY 尺寸，向前台进程组发送信号并关闭。宿主释放时终止每个存活会话。桌面 `cordis.patch.yml` 挂载该行，settled-tree 断言要求 `terminalManager`，`api-remotes` 客户端装配挂载该命名空间。

渲染器半边是 `apps/web` 中独立的 `terminal.html`，作为第二个 Vite 入口构建。页面自有的 RPC bridge 直接基于 preload IPC bridge 铸造 RPC id 并包装连接信封——不引入 Cordis 客户端内核——xterm 桥接按键、输出增量与 fit 驱动的尺寸调整。终端窗口真实关闭（会话为用户自有，宿主释放时回收），主窗口保持 close-to-tray。

IPC fetch pump 改为按 sender 路由：一个 pump 服务所有窗口，响应流回发起请求的 webContents，在途 abort 按 sender 隔离，因此一个窗口不能取消另一个窗口的请求。载体分层本身（[desktop-carrier-layering](../../implemented/architecture/2026-08-15-desktop-carrier-layering.md)）与 subprocess seam（[subprocess-seam](../../implemented/architecture/2026-07-26-subprocess-seam.md)）继续拥有各自的决策；本注记记录建立在两者之上的终端能力。

## 验证

- `packages/host/terminal-manager/tests/manager.spec.ts` 钉住六个 Remote 动词、shell 解析、有界 scrollback、退出事实与宿主释放回收。
- `apps/web/tests/terminal-session.spec.ts` 与 `terminal-bridge.spec.ts` 钉住轮询循环、resize 转发、close 幂等与线缆信封（方法目标、rpcId 回显、拒绝判定）。
- `apps/desktop/tests/fetch-pump.spec.ts` 钉住跨窗口的按 sender 响应路由与 abort 隔离。
- 桌面启动快照与 `desktop-app` invariant 测试覆盖组合后的行；桌面 TypeScript 程序与桌面模式 web 构建提供打包检查。

## 备选方案

**在终端页面复用完整 Cordis 客户端内核。** 拒绝，因为页面只需要六个 Remote 动词；启动 loader、模块表与 shell 只会增加启动复杂度而不增加能力。页面自有 bridge 改为镜像共享连接信封。

**保持每窗口一个 pump、每通道一个 handler。** 拒绝，因为 `ipcMain.handle` 每通道只注册一个 handler；第二个窗口会静默替换第一个窗口的 pump。按 sender 路由保留单一 handler 并按发起 webContents 路由。

**像主窗口一样在关闭时隐藏终端窗口。** 拒绝，因为隐藏的终端会话会在没有可见界面的情况下继续运行；宿主在释放时回收会话，因此关闭窗口就是自然的会话结束。

## 后果

终端表面仅限桌面，依赖 preload IPC bridge；在应用外打开页面会响亮失败。输出读取为轮询驱动，没有推送通道；超过 `maxBufferBytes` 的 scrollback 被不可恢复地丢弃，并带一次性 `truncated` 标记。托盘新增一条命令（Open Terminal），主菜单形态由托盘测试钉住。

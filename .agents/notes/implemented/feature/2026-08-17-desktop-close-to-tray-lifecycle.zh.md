# Agent Note: 桌面关闭至托盘生命周期

Status: implemented

[English](2026-08-17-desktop-close-to-tray-lifecycle.md) | 中文

## 问题

第一版桌面壳把原生窗口与进程事件作为彼此独立的回调处理。在非 macOS 平台关闭最后一个窗口会退出，Host 退出请求会在不释放 Host 的情况下调用 `app.exit()`，而 `before-quit` disposer 只会在 Host 成功启动后安装。重复退出请求、资源释放拒绝、早期启动故障、第二实例恢复、托盘所有权以及不安全的主框架导航都没有统一策略。

桌面用户期望长时间运行的 agent（智能体）任务不会因误关窗口而中断。因此，进程需要一个原生生命周期，把隐藏唯一窗口与结束 Host 区分开来，并在清理卡死时仍能在限定时间内失败。

## 决策

原生生命周期的所有权留在 `apps/desktop`。Electron 入口先取得单实例锁，再在应用 ready 之前创建唯一的 `DesktopShutdown` 控制器。托盘 Quit、操作系统退出、信号、Host 退出请求以及壳的致命故障都进入该控制器。普通 BrowserWindow 关闭只隐藏窗口；托盘操作、激活事件和再次启动会恢复同一个句柄。

关闭时依次释放 IPC 泵、Host、托盘和窗口。第一个请求最多等待五秒。资源释放拒绝或超时会把干净请求映射为退出码 `1`；第二个请求会立即退出。主框架导航只接受精确的 `dsh://app` authority，所有子窗口一律拒绝，只有 `http:`、`https:` 和 `mailto:` 请求会交给操作系统。

Host 组合包保持 Electron 无关。它继续暴露已定居句柄和 `requestExit` 回调，而 Electron 专属的窗口、菜单、图像、进程信号和应用事件留在壳中。这保留了一条可复用的 Host 启动路径，并防止 Cordis 树依赖原生 UI 运行时。

## 验证

- `apps/desktop/tests/lifecycle.spec.ts` 固定单次资源释放、超时、拒绝、重复请求升级、监听器移除和资源顺序。
- `apps/desktop/tests/window.spec.ts` 固定关闭至隐藏、恢复、精确导航、外部 URL 委托和打开器故障报告。
- `apps/desktop/tests/tray.spec.ts` 固定双命令菜单、双击恢复、图像校验和幂等清理。
- `apps/desktop/tests/lifecycle.snapshot.ts` 记录无密钥的关闭、恢复、有序资源释放和干净退出 transcript（文本记录）。
- 桌面 TypeScript 程序与 Electron main/preload bundle 提供源码与打包检查。目标平台的托盘外观仍由 Windows CI 和手动测试提供证据，因为注入式测试无法验证操作系统渲染。

## 备选方案评估

**继续把生命周期标志和回调直接放在 `main.ts`。** 拒绝，因为旧安排已经允许 Host、窗口和 Electron 退出路径相互绕过。一个小型注入式控制器让超时与重复请求行为可确定测试，同时不隐藏资源所有权。

**在修改生命周期的同时把桌面载体迁移到 loopback HTTP 服务器。** 拒绝，因为私有 IPC 载体已经能在没有共享端口的情况下提供所需渲染进程传输。载体迁移会扩大暴露面并改变无关协议行为，却不能解决原生所有权问题。

**关闭最后一个窗口时退出。** 拒绝，因为这会终止进行中的 Host 工作，并与已批准的托盘行为冲突。

## 影响

窗口可见性不再表示进程生命周期。用户必须选择托盘 Quit 或操作系统退出操作才能结束 Host。本版本增加一个常驻托盘，其中只有 Show 和 Quit；profile 控制、更新和终端快捷入口仍是独立的后续工作。

关闭行为无需 Electron 或显示服务器即可测试，而平台集成层保持精简。未来的原生资源必须加入同一个有序 disposer，不能新增直接 `app.exit()` 或平行的 `before-quit` 路径。

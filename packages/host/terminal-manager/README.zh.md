# @deepseek-ai/dsh-host-terminal-manager

[English](README.md) | 中文

面向用户自有的交互式终端的 Host Remote。`TerminalManagerGateway` 注册 `terminalManager` 服务，发布六个直接 Remote——`spawn`、`write`、`read`、`resize`、`signal`、`close`——通过 subprocess seam 的 `spawnTerminal` 驱动一个用户 shell 会话：渲染器以初始窗口尺寸启动 shell、流式写入输入、轮询输出增量、调整 PTY 窗口大小、向前台进程组发送信号，并关闭会话。

会话为用户自有：不铸造 agent，也不组装模型输入。输出保留在按会话有界（`maxBufferBytes`）的 scrollback 中，读取即消费增量语义；被截断的读取返回整个保留尾部并报告一次 `truncated`，由渲染器重绘。`exited` 事实通过 `read()` 在输出流结束、`done` 收敛或传输故障之后到达。

shell 依次从配置的 `shellPath`、环境变量 `$SHELL`、平台默认值（`/bin/bash`，Windows 为 PowerShell）解析；工作目录默认为用户主目录，并设置 `TERM=xterm-256color`。`close` 终止句柄并移除会话；host 释放时终止每个存活会话。其公开载荷类型位于 `./types`，Typert 生成的 Host 与 Client Remote 产物由 `./typert` 和 `./remote` 暴露。

该服务仅面向 Remote，刻意不在同进程 Cordis `Context` 上合并。客户端包通过显式的 [`api-remotes`](../../api/remotes/README.md) 装配使用它，而不是导入 Host 实现。

## Model Experience

无，用户自有会话只流转终端文本，不注册任何 prompt、工具、消息或 provider 请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与延期工作

- **轮询读取** —— `read()` 按需返回输出增量；没有推送通道，因此轮询节奏由渲染器负责。
- **有界 scrollback 丢弃历史** —— 输出超过 `maxBufferBytes` 后，头部被不可恢复地丢弃，并在首次丢弃时报告一次 `truncated`。
- **无 agent 侧 API** —— 会话为用户自有；不存在能触达终端的工具、prompt 或模型侧表面。
- **尚无渲染器 UI** —— Remote 已发布并挂载，但消费它们的桌面终端窗口延期；终端页面与桌面接线将作为后续工作落在本仓库的 `apps/` 下。

# @deepseek-ai/dsh-host-plugin-manager

[English](README.md) | 中文

用于配置文件（profile）插件变更的 Host Remote。`PluginManagerGateway` 注册 `pluginManager` 服务，发布两个生成的直接 Remote：`pluginManager/install` 与 `pluginManager/remove`，通过 pnpm 在某个 profile 中安装和移除插件，语义与 CLI 的 `dsh plugin --profile <name>` 一致：pnpm 在 profile 目录中针对其 manifest 运行，`dsh.profile.bundles` 层列表按已安装状态收敛。

每次变更都会在 spawn 前对 manifest 做快照。pnpm 失败时恢复快照，因此失败运行绝不会让 profile 声明一个并未安装的插件；成功时按已安装状态重新收敛层列表——包声明了 `dsh.bundle` 补丁的依赖按依赖顺序加入层栈，不再声明的依赖（被移除，或安装的版本丢弃了声明）离开层栈，而非依赖的模板 bundle 永远不会被触碰。新增的非 bundle 依赖保持普通依赖并警告一次（后续更新获得 `dsh.bundle` 时自动激活）。

被管理的 profile 默认为 `desktop`，harness home 默认为 `resolveDshHome()`；桌面 host-boot overlay 会把实际启动的 profile 钉入本行的配置。PATH 中缺少 pnpm 时，变更以退出码 127 收敛而不是抛出异常。变更结果携带 pnpm 退出码、捕获的输出和收敛后的 bundle 层列表。其公开载荷类型位于 `./types`，Typert 生成的 Host 与 Client Remote 产物由 `./typert` 和 `./remote` 暴露。

该服务仅面向 Remote，刻意不在同进程 Cordis `Context` 上合并。客户端包通过显式的 [`api-remotes`](../../api/remotes/README.md) 装配使用它，而不是导入 Host 实现。

## Model Experience

无，这个仅限 Host 的变更服务运行 pnpm，不注册任何 prompt、工具、消息或 provider 请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与延期工作

- **Host 上需要 pnpm** —— 变更从 PATH 中 spawn `pnpm`；缺失时结果以退出码 127 收敛，但不发生任何变更。没有内置包管理器。
- **无渲染器 UI** —— 变更 Remote 已发布并挂载，但调用它们的桌面设置界面延期；现有插件清单页保持只读。
- **仅变更一个 profile** —— 配置为所有调用固定单个 profile；没有跨 profile 批量操作。
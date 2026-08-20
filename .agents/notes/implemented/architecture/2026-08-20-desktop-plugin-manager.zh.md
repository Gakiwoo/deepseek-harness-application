# Agent Note：桌面插件管理器

状态：已实现

[English](2026-08-20-desktop-plugin-manager.md) | 中文

## 问题

桌面应用只能通过应用外的 CLI `dsh plugin --profile <name>` 变更自己的插件；列出插件的设置界面是只读的（`pluginInventory` Remote），路线图（阶段 3 第 7 项）要求应用内变更路径：在运行中的 profile 里安装和移除插件，采用 CLI 的收敛语义，并附加 CLI 所没有的失败时快照恢复保证。

## 决策

**新增 Host 包 [`packages/host/plugin-manager`](../../../../packages/host/plugin-manager)，发布 `pluginManager` Remote，提供 `install(spec)` 与 `remove(name)`**，通过 pnpm 变更单个 profile，与 `dsh plugin --profile <name>` 完全一致：

1. **profile 与 home 来自行的配置**（`profile`，默认 `desktop`；可选的 `home` 供测试使用），沿用 `frontend-static` 的 Config 模式（服务上的 schemastery `static Config`）。桌面 host-boot overlay 把实际启动的 profile 钉入该行配置（与 `desktop-runtime` overlay 一样以 `hasPluginManagerRow` 为门），因此变更针对的正是运行中的 profile。
2. **spawn 前快照、之后收敛**：spawn 前的 manifest 在成功时封入 bundle 层列表，失败时恢复——失败的 pnpm 运行（registry 404、构建脚本被阻断）绝不会让 profile 声明一个并未安装的插件。CLI 没有这一步恢复。
3. **成功时收敛**：从 CLI 的 `reconcilePlugins`/`exportsPatch` 移植，`NAME = 'dsh-desktop'`——解析到声明 `dsh.bundle` 的包的依赖按依赖顺序加入层栈（因此 git/path/tarball/alias spec 按真实包名收敛）；不再作为 bundle 解析的依赖（被移除，或安装的版本丢弃了声明）离开层栈；从不作为依赖的模板 bundle 不被触碰；新加入的非 bundle 依赖保持普通依赖并一次性警告。
4. **带输出捕获的异步 spawn**：pnpm 以 profile 目录为 cwd 运行；Windows 通过 `.cmd` shim 解析 pnpm，而自 CVE-2024-27980 加固以来 `spawn()` 没有 shell 会拒绝运行；缺少 pnpm 时以退出码 127（`PNPM_NOT_FOUND_EXIT`）收敛而不是抛出，非 ENOENT 的 spawn 失败则向上传播。
5. **相对路径 spec 锚定到进程 cwd**：来自渲染器的裸 `.`/`../plugin`（或其 `file:`/`link:` 形式）会在 profile 内部静默解析并自链接；`anchorPathSpec` 在 pnpm 运行前把相对 spec 重写到 cwd 之下。
6. **首次使用初始化 profile**：缺失的 profile 目录按其模板初始化（`PROFILE_TEMPLATES[profile]`，回退到 `DEFAULT_PROFILE_BUNDLES`），与 CLI 一致。

渲染器设置界面保持只读；变更 Remote 已挂载并完成类型化（客户端装配 `api-remotes` 增加了该命名空间与载荷类型），供后续的设置页使用。

## 测试

- `packages/host/plugin-manager/tests/manager.spec.ts`（15 个测试）：Remote 表面（命名空间与 `remoteMethods`）、install/remove 成功收敛、非 bundle 与不可解析依赖警告、模板 bundle 保留、失败快照恢复、缺 pnpm 与 null 退出码收敛、非 ENOENT spawn 传播、首次使用初始化、未知 profile 的默认模板、无 dsh 段 manifest、相对 spec 锚定，以及 invariant 伴生注册——全部基于真实 Cordis 上下文、mock 的 `node:child_process` spawn 与临时 home；包的 `src/` 处于逐文件 100% 覆盖率门限。
- `packages/bundle/desktop-app/tests/invariant.spec.ts` 增加了 `pluginManager` 形状断言；既有 host-boot 启动测试证明出厂组合带行与 overlay 正常结算。
- `tsc -b tsconfig.host.json --force`、`tsc -b tsconfig.client.json` 与 desktop-app 宿主套件均干净。

## 备选方案

**把变更方法加进 `pluginInventory`。** Inventory 按契约是只读的 Loader 投影（其 JSDoc 与 README 均如此声明）；变更属于独立的接缝，且包的 invariant 规则要求每个抽象绑定当前消费者，因此新包镜像 inventory 包的结构。

**复用 CLI 的 `spawnSync`。** Remote 按契约是异步的（Typert 直接 Remote 均为异步）；宿主内同步子进程会阻塞整棵树，带输出捕获的异步 spawn 才是自然选择。

**不经过 pnpm 直接变更 profile。** 手写 `package.json` 会跳过 pnpm 的 lockfile、`node_modules` 与传递安装；路线图点名的 CLI 语义就是运行 pnpm，所以 Remote 也运行 pnpm。

## 影响

- 桌面宿主现在可以在进程内按 CLI 的收敛语义安装与移除 profile 插件，并附加 CLI 所无的快照恢复；失败的变更让 profile 与之前逐字节一致。
- `api-remotes` 客户端装配携带 `pluginManager` 命名空间，渲染器设置页可用类型化结果调用变更；该页面本身延期。
- 宿主组合的变更需要 PATH 中有 pnpm；出厂桌面行在设置页调用前保持惰性（只读），缺 pnpm 时任何调用以退出码 127 收敛。
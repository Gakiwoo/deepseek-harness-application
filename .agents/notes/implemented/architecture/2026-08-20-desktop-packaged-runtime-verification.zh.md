# Agent Note: 打包运行时验证链

Status: implemented

[English](2026-08-20-desktop-packaged-runtime-verification.md) | 中文

## 问题

`pack:desktop` 产出的工件从来没有人真正启动过：打包应用在发，但没有任何东西验证部署后的宿主闭包能启动、打包后的可执行文件能到达活渲染进程、bundle 是否携带其披露文件。第一次真正尝试运行产物恰好暴露了四个真实的打包 bug，任何一台用户机器首次启动都会撞上：

1. **宿主启动路径**：壳把打包后的宿主启动解析到 `resources/host/node_modules/@deepseek-ai/dsh-desktop-app/lib/host-boot.js`——一个不存在的路径——因为 `pnpm deploy --legacy` 布局把 desktop-app 包放在 `resources/host` 根目录，打包应用会在用户首次启动时弹出启动失败框。
2. **缺 `dsh-base`**：desktop profile 的 bundles 是 `dsh-base` 与 `dsh-desktop-app`，但 desktop bundle 从未声明 `dsh-base`，部署后的闭包根本无法组装 profile。
3. **缺 preset 花名册**：桌面宿主从不携带 agent-presets 花名册（CLI 通过 overlay 挂载随包发布的 `config/agent-presets` 根；桌面宿主没有对应物），全新 home 的 `session.create` 报 `agent-preset-not-found`。
4. **缺闭包 peer**：`pnpm deploy` 只装常规依赖，绝不装 peerDependencies；加上 `auto-install-peers=false`，闭包遗漏了图中每个包的每一个 peer（先是 vendored 的 `cordis`/`cosmokit`/插件家族，然后是 `dsh-timeout`、`dsh-scope`、`dsh-atomic-write` 等 26 个工作区服务包），插件树以一连串 `ERR_MODULE_NOT_FOUND` 加载失败。

## 决策

**每次打包都以 `verify:packed` 收尾（[`scripts/verify-packaged-runtime.ts`](../../../../scripts/verify-packaged-runtime.ts)），三项检查，失败即响亮报错：**

1. **宿主闭包冒烟**：部署后的 `resources/host/lib/host-boot.js` 在纯 Node 下用临时 Harness home 启动；`host.describe` 有响应；全新 home 列出 0 个会话；`session.create` 创建一个；重新列出恰好 1 个。客户端用的是部署闭包自带的 `dsh-client-connection` bundle，走与桌面快照套件相同的进程内线桥，因此端到端走的是真实 IPC 线契约。
2. **bundle 披露**：打包应用的资源携带生成的 `THIRD_PARTY_NOTICES.md`——`pack-desktop.ts` 现在把该文件复制进 `resources/`，让披露随 bundle 一起发布。
3. **活渲染进程**：打包后的可执行文件用临时 user-data 目录（`--user-data-dir`）与临时 `DSH_HOME` 启动；检查轮询启动状态文件（阶段 1），直到 `lastGood`——壳只在渲染进程加载 `dsh://app/` 后提交它——然后终止进程。无头 Linux 与 `DSH_VERIFY_SKIP_LIVE=1` 跳过此检查；另外两项始终运行。

`apps/desktop/src/main.ts` 现在把打包后的宿主启动解析到 `resources/host/lib/host-boot.js`，与 deploy 布局一致。

**闭包修复都在 deploy 根包的 manifest 里**（`packages/bundle/desktop-app/package.json`）：

- desktop profile 的第二个 bundle（`dsh-base`）声明为依赖。
- 随包发布的 preset 花名册是真实文件集：`config/agent-presets/` 从 `apps/cli/config/agent-presets/` 复制进 bundle（并在 `files` 白名单里），宿主启动把它作为 `trust: 'system'` 的根 overlay 到 `agent-presets` 行上（与 CLI 的 `profile-boot.ts` 同模式），全新 home 即有 presets。
- 完整闭包 peer 集声明为依赖：vendored 的 `cordis`、`cosmokit`、`cordis-plugin-loader`、`cordis-plugin-group`、`cordis-plugin-include`、`cordis-plugin-logger-console`、`@standard-schema/spec`、`node-addon-require-builtin`、`clsx`、`react`、`react-dom`，以及闭包插件树经 peer 边导入的 26 个工作区服务包。`pnpm deploy` 装不了 peer，deploy 根必须自带。将来修复应在 deploy 路径里（把 peer 物化进闭包），而不是清单——Python SDK deploy 也以同样的方式自带根清单。

## 测试

- `scripts/verify-packaged-runtime.spec.ts` —— 工件定位（macOS bundle、Windows unpacked、缺失产物）、启动状态就绪解析（已提交/仅 pending/缺失/损坏）、显示可用性。
- `apps/desktop/tests/build-contract.spec.ts` —— 打包后的宿主启动路径保持在部署闭包根目录（且绝不在 `node_modules` 下）、打包脚本发布披露文件、`pack:desktop` 串联 `verify:packed`。
- 验证链本身对真实打包产物运行（路线图验收：启动产物闭包、断言宿主就绪与活渲染进程、创建一个空会话）。端到端运行按顺序抓到上面 1–4 四个 bug：每个修复都通过对着新工件重跑验证链确认，最终以 `verify-packaged-runtime: packed desktop artifact verified` 收尾。
- 活渲染进程检查用两个独立的临时目录分别作为 `--user-data-dir` 与 `DSH_HOME`：Electron 把 profile 与启动状态文件写进 `userData`，而 harness home 放 profiles、会话与 patch watcher；两个指向同一目录会让 harness 的 chokidar watcher 被 Chromium 的 `SingletonSocket` 绊倒。

## 备选方案

**只在 Node 里验证宿主闭包。** 拒绝：壳 bundle、启动状态与渲染进程加载恰恰是最容易无声腐坏的部分（宿主启动路径 bug 完全在闭包之外）。实机启动检查在每一个有显示的平台都补上这个缺口。

**在 `run-gates.ts` 里加 CI 门禁。** 拒绝：验证需要真实打包（网络、electron-builder、原生重建），CI 不会每次提交都跑；验证链改为挂在 `pack:desktop` 上，那里工件才是新鲜的。

**对产物做 zip 扫描检查许可证。** 拒绝：有意义的披露检查是 bundle 中生成通知文件的存在性与出处，而不是重新推导披露。

## 后果

无法启动、无法渲染或缺披露的打包产物现在会在 electron-builder 之后立刻失败，而不是在用户的机器上失败。四个打包 bug 都在抓住它们的同一变更里修复。`pack:desktop` 变慢（一次完整应用启动加一次闭包启动）——上限为 90 秒渲染预算——`DSH_VERIFY_SKIP_LIVE=1` 可在没有显示器的机器上缩短。该脚本是未来阶段 2 工作（自动更新）可以扩展的冒烟面：它已经用隔离状态启动真实工件。闭包 peer 修复是清单层面的，当 deploy 路径学会物化 peer 时需要重新审视。
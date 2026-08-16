# Agent Note：Windows 桌面打包 pnpm 流水线

Status: implemented

[English](2026-08-16-windows-desktop-pack-pnpm-pipeline.md) | 中文

## 问题

桌面应用的打包步骤（[scripts/pack-desktop.ts](../../../../scripts/pack-desktop.ts)）必须在桌面构建矩阵的三个腿（`macos-latest` arm64/x64、`windows-latest` x64）上都能运行。macOS 腿通过，但 Windows 腿在几个相互独立的 pnpm、node-gyp 与 electron-builder 阶段失败——不是单一根因，而是一串只在真实 MSVC 工具链和 `/link:vendor/*` deploy 闭包下才暴露的 Windows 专属断点：

- `spawnSync('pnpm', …)` 抛出 `ENOENT`，因为裸 `pnpm` 可执行文件在 Windows 上并不作为一个文件存在。
- node-gyp 无法识别当前 `windows-latest` 安装的 Visual Studio（VS18/2026）——`gyp ERR! find VS unknown version "undefined"`——因此 electron-rebuild 无法按 Electron ABI 重建 node-pty。
- electron-builder 自己的 `npmRebuild` 会对同一原生依赖再跑一次 node-gyp，而其自带的 node-gyp 同样撞上 VS-2026 失败。
- electron-builder 的 7-Zip 归档器无法跟随 deploy 闭包保留的 `link:vendor/*` 符号链接（`cannot find the path`）。

## 决策

恢复完整三平台矩阵（含 Windows），并让每一步在其 Windows 失败模式下存活：

1. **在 Windows 上通过 shell 执行 pnpm 二进制。** [pack-desktop.ts](../../../../scripts/pack-desktop.ts) 在 win32 上把包管理器解析为 `pnpm.cmd` 并以 `shell: true` 运行，使 `spawnSync` 找到真实可执行文件并让批处理垫片生效。

2. **给 node-gyp 一个认识 VS 2026 的工具链。** 一个 [pnpm override](../../../../pnpm-workspace.yaml) 把 electron-rebuild 捆绑的那份从 `electron-rebuild>node-gyp: 9.x` 提升到 `^12.0.0`（首批识别 VS 18/2026 的发布线）。工作流还在打包前用 `ilammy/msvc-dev-cmd@v1` 载入 MSVC 开发环境、设置 `VCINSTALLDIR`，让 node-gyp 走 VS Command Prompt 路径而非失效的 vswhere 探针。

3. **关闭 electron-builder 的原生重建。** [electron-builder.yml](../../../../apps/desktop/electron-builder.yml) 设置 `npmRebuild: false`。node-pty 是唯一的 Electron ABI 原生依赖，打包脚本已在第 4 步、于 electron-builder 运行之前按 Free Electron ABI 重建过一次。额外的自动重建只会用另一个 node-gyp 再次失败。

4. **实体化 deploy 闭包的符号链接。** [pack-desktop.ts](../../../../scripts/pack-desktop.ts) 新增递归的 `dereferenceSymlinks`，在 electron-builder 归档前把已部署宿主闭包下的每个符号链接改写成真实副本，使 7-Zip 永不需跟随符号链接。

工作流保持作业内不含 `DEEPSEEK_API_KEY`，设置 `CSC_IDENTITY_AUTO_DISCOVERY: "false"`（未签名产物），按腿传入 `DSH_DESKTOP_ARCH`，并按平台上传 dmg/zip/exe。`fail-fast: false` 让一个失败的腿不会取消其余腿，从而矩阵得以迭代推进。

## 备选方案评估

**仅靠 `ilammy/msvc-dev-cmd` 的单一 node-gyp 修复。** 拒绝：即使设置了 `VCINSTALLDIR`，electron-rebuild 透视到的 node-gyp 9 副本也无法解析 VS18 版本串。工具链环境只在版本解析器能应付之后才修复发现——因此 override 是必需的，而非可选。

**保持 `npmRebuild` 开启并改为修复 electron-builder 自带的 node-gyp。** 拒绝：打包脚本已在第 4 步拥有一次有意的、与框架一致的构建；关闭自动重建去掉了一次重复的高开销构建和第二个失败点，且比重定向 electron-builder 捆绑的 node-gyp 更稳妥。

**用 shell 过程或归档设定来解引用符号链接。** 拒绝：无符号链接闭包是 Python SDK deploy 已确立的同一不变量；在 TypeScript 里用 `realpathSync`/`cpSync` 实现是确定性的、跨平台的，并且在 electron-builder 之前运行、与归档器无关。

## 影响

桌面构建矩阵的三个腿现在全部成功并上传原生产物：`DeepSeek-Harness-0.1.0-rc.5-win-x64.zip`、`.exe`（含 blockmap），以及 arm64 与 x64 的 macOS dmg/zip。Windows node-pty 的 ConPTY/winpty 助手二进制正确打进 `win-unpacked`。

`npmRebuild: false` 把义务转移到打包脚本：未来任何加入宿主闭包的 Electron ABI 原生包都必须在第 4 步显式重建，而不能由 electron-builder 推断。`electron-rebuild>node-gyp` 的 override 是全仓库的，因此也影响任何其他在提升后的 node-gyp 下重建原生模块的消费者。VS-2026 专属修复与当前 `windows-latest` 镜像耦合；未来工具链可能把 node-gyp 的版本解析器并入 electron-builder 本身，届时 override 与 MSVC-dev-cmd 载入都会变成冗余。
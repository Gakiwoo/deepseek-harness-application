# Agent Note：桌面更新能力

Status: implemented

[English](2026-08-20-desktop-updates-capability.md) | 中文

## Problem

桌面应用没有任何更新路径：每次发布都需要手动下载、手动移入 Applications，并在首次启动时手动处理 Gatekeeper/SmartScreen 例外。路线图（阶段 2，第 4 项）要求 `dsh-desktop` 具备更新能力：检查 GitHub Releases feed、带进度与校验和下载、并在干净退出时应用——在签名存在之前，同一 feed 上还要有一个可用的手动「检查更新」。

## Decision

**壳拥有一个更新能力（[`apps/desktop/src/updates.ts`](../../../../apps/desktop/src/updates.ts)），通过托盘 "Check for updates…" 命令暴露**，沿用托盘/诊断导出的先例：纯模块 + 注入的原生操作（`fetch`、`spawn`、`env`、`plistBundleVersion`）、类型化错误（`DesktopUpdateError`），每个决策都有单元测试覆盖。

1. **Feed 与通道**：`GET https://api.github.com/repos/{owner}/releases?per_page=5`（仓库为 `Gakiwoo/deepseek-harness-application`，可用 `DSH_DESKTOP_UPDATE_REPOSITORY` 覆盖）。最新且比当前版本更新的发布胜出；仅当当前版本本身是预发布版时预发布才可见（`0.1.0-rc.x` 通道能看到 rc 发布，稳定版安装永远看不到）。非 semver 的 tag 被忽略。
2. **产物匹配**：macOS 上优先 `DeepSeek-Harness-*-mac-<arch>.zip`（dmg 次之），Windows 上为 `DeepSeek-Harness-*-win-x64.exe`；其他平台大声失败（"not offered"）。更新的发布缺少匹配产物或必需的 `<artifact>.sha256` 边车时，检查对话框大声失败——绝不明目张胆地报「已是最新」。
3. **下载**：流式写入 `<userData>/updates/<name>.part`，增量计算 sha256；摘要必须与发布边车内容（`hex  文件名`，由 `parseChecksum` 解析）一致；不匹配或边车拉取失败会删除部分文件并大声失败；成功后原子重命名就位。进度以四分之一步进通过原生通知上报。
4. **暂存**：macOS zip 用 `ditto -x -k` 解压到 `<userData>/updates/extracted-<version>`，`.app` bundle 版本必须等于发布版本（`plutil -extract CFBundleShortVersionString`），并移除隔离属性（`xattr -dr com.apple.quarantine`）——ditto 会保留隔离属性，而带隔离的更新后应用首次启动会被 Gatekeeper 拦截。成功后写入 `pending.json`（待应用标记）到 `<userData>/updates/`。
5. **干净退出时应用**：标记在关闭资源释放期间被消费——在 Host 与原生资源释放之后，且仅当应用是打包应用时（`DSH_DESKTOP_UPDATE_CHECK=1` 让开发启动可选检查/下载，绝不应用）。macOS 就地替换 bundle：用 `ditto` 把暂存 bundle 复制到运行 bundle 旁，把旧 bundle 改名移开，把暂存副本改名就位，删除旧 bundle 与解压目录；任何失败都会恢复旧 bundle 并拒绝退出（退出码 1），标记保留到下一次干净退出。Windows 以分离方式静默启动 NSIS 安装程序（`/S`）并消费标记。「立即安装并退出」会以 120 秒预算（`UPDATE_APPLY_TIMEOUT_MS`）请求关闭，因为 bundle 复制会超出普通的五秒释放期限；`createDesktopShutdown.request` 增加了可选的按请求预算。
6. **校验和契约**：`pack-desktop.ts` 为每个产物写出 `.sha256` 边车（`shasum` 格式），因此发布 `apps/desktop/dist/` 即满足能力的校验和要求；`apps/desktop/tests/build-contract.spec.ts` 守护边车步骤与壳接线。

## Testing

- `apps/desktop/tests/updates.spec.ts`（23 个测试）：通道资格与最新者胜出选择、产物偏好与平台匹配、缺失产物/校验和的失败、校验和解析、流式下载与摘要不匹配清理、暂存（解压、版本校验、隔离移除、标记写入）、待应用标记生命周期、macOS 交换成功与回滚（只读目标目录）、Windows 静默安装 spawn、禁用安装的拒绝、feed 仓库覆盖、非 200 feed 响应。
- `apps/desktop/tests/tray.spec.ts` 覆盖新菜单项及其接线；`build-contract.spec.ts` 守护边车步骤、壳接线与标记释放槽位；`lifecycle.spec.ts` 覆盖按请求的释放预算。
- 桌面全套（104 个测试）、`tsc -p apps/desktop/tsconfig.json` 与 oxlint 全部干净。

## Alternatives considered

**采用 `electron-updater`（electron-builder 的发布工具链）。** 它自带差分更新与发布流水线，但假设了 electron-builder 的发布工作流（update-info 端点、`latest.yml`/`latest-mac.yml` 清单），其 genericZipUpdater 路径需要重新签名与重新公证——在签名存在之前这是阻碍。路线图明确把签名前范围限定为同一 feed 上的手动检查；自研能力约 600 行、全部单元测试覆盖，交换/安装逻辑完全可控。

**下载完成后立即应用，而不是干净退出时。** 应用运行时替换 bundle 只对运行进程已加载的文件安全；路线图要求干净退出时应用，且关闭释放顺序（先释放 Host）保证交换期间没有自有文件被占用。

**全局延长关闭预算，而不是按请求延长。** 五秒退出会在没有待应用更新时白等两分钟；按请求预算让普通退出保持快速，只约束「立即安装」退出。

## Consequences

- 每个桌面发布现在必须携带平台产物及其 `.sha256` 边车（打包脚本两者都产出），并发布到仓库的 GitHub Releases。
- 更新通道跟随运行版本：预发布安装跟踪预发布发布，稳定安装只看稳定发布。
- 更新后首次启动即是新版本，无需任何手动步骤；未签名的更新后应用可以启动，因为暂存阶段移除了隔离属性——签名/公证仍是后续工作。
- 应用失败以非零退出并保留标记到下次干净退出重试，把失败暴露出来，而不是静默交付一个半替换的 bundle。
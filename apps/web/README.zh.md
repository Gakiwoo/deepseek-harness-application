# `@deepseek-ai/dsh-web-frontend`

[English](README.md) | 中文

Web 应用入口：基于 [`@deepseek-ai/dsh-client-web`](../../packages/client/web/README.md) 外壳库的 Vite 构建。产出的 `dist/` 由 `dsh web` 提供服务，桌面外壳通过 `build:desktop` 复用同一前端。

## 命令

| 命令 | 用途 |
|---|---|
| `pnpm run dev` | 启动带 HMR 的 Vite 开发服务器，连接运行中的宿主。 |
| `pnpm run build` | 产出生产版 `dist/` 包。 |
| `pnpm run build:desktop` | 产出桌面模式的 `dist/` 包（`vite build --mode desktop`）。 |
| `pnpm run watch` | 每次变更后重建 `dist/`。 |

## 与其他表面的关系

CLI、桌面外壳与本 Web 构建共享同一个客户端：浏览器名单与载体检测都在 client 包中，因此本构建只是一个薄入口。桌面差异仅限于 `__DSH_DESKTOP__` 载体，由共享客户端代码检测，而非在此分叉。

## 测试

端到端浏览器测试位于 [`tests/`](tests/README.md)，通过仓库测试套件运行。

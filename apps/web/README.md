# `@deepseek-ai/dsh-web-frontend`

English | [中文](README.zh.md)

The web application entry: a Vite build over the [`@deepseek-ai/dsh-client-web`](../../packages/client/web/README.md) shell library. The produced `dist/` is what `dsh web` serves, and the desktop shell reuses the same frontend through `build:desktop`.

## Commands

| Command | Purpose |
|---|---|
| `pnpm run dev` | Start the Vite dev server with HMR against a running host. |
| `pnpm run build` | Produce the production `dist/` bundle. |
| `pnpm run build:desktop` | Produce the desktop-mode `dist/` bundle (`vite build --mode desktop`). |
| `pnpm run watch` | Rebuild `dist/` on every change. |

## Relationship to the other surfaces

The CLI, the desktop shell, and this web build share one client: the browser roster and carrier detection live in the client packages, so the web build stays a thin entry. Desktop differences are limited to the `__DSH_DESKTOP__` carrier, detected in the shared client code rather than forked here.

## Tests

End-to-end browser tests live under [`tests/`](tests/README.md) and run through the repository test suites.

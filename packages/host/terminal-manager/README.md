# @deepseek-ai/dsh-host-terminal-manager

English | [中文](README.zh.md)

Host Remote for user-owned interactive terminals. `TerminalManagerGateway` registers the `terminalManager` service and publishes six direct Remotes — `spawn`, `write`, `read`, `resize`, `signal`, `close` — that drive one user shell session through the subprocess seam's `spawnTerminal`: the renderer spawns the shell with an initial window size, streams input, polls output deltas, resizes the PTY window, signals the foreground process group, and closes the session.

Sessions are user-owned: no agent is minted and no model input is assembled. Output is retained in a bounded per-session scrollback with consume-on-read deltas; a truncated read returns the whole retained tail and reports `truncated` once, so the renderer redraws. The `exited` fact arrives through `read()` after the output stream ends, `done` settles, or a transport failure.

The shell resolves from the configured `shellPath`, then the ambient `$SHELL`, then the platform default (`/bin/bash`, PowerShell on Windows); the working directory defaults to the user's home and `TERM=xterm-256color` is set. `close` terminates the handle and removes the session; host dispose terminates every live session. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as user-owned sessions stream terminal text and register no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Polling reads** — `read()` returns output deltas on demand; there is no push channel, so the renderer owns the poll schedule.
- **Bounded scrollback drops history** — once output exceeds `maxBufferBytes`, the head is dropped irrecoverably and `truncated` is reported once at the first drop.
- **No agent-facing API** — sessions are user-owned; there is no tool, prompt, or model-facing surface that reaches a terminal.
- **No renderer UI yet** — the Remotes are published and mounted, but the desktop terminal window that consumes them is deferred; the terminal page and desktop wiring land in this repository's `apps/` as a follow-up.

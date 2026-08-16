# DeepSeek Harness 桌面应用实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [2026-08-15-desktop-app-design.md](../specs/2026-08-15-desktop-app-design.md) 把 dsh 组装为开箱即用的 Electron 桌面应用（mac dmg/zip + win nsis/zip，未签名 CI 工件），host 侧同一棵 Cordis 插件树，唯一新物理载体是 IPC fetch。

**Architecture:** 方案 A——新增 `packages/bundle/desktop-app`（`@deepseek-ai/dsh-desktop-app`，desktop profile 的 deploy 根 + 运行时胶水）与 `apps/desktop`（Electron 壳）；渲染进程经 `window.__DSH_DESKTOP__` IPC 桥 + `DesktopApiClient`（connection 包第三载体）复用 `AbstractApiClient` 全部协议不变量；前端经 `dsh://` 自定义协议加载，manifest 组合复用 client-modules。

**Tech Stack:** Electron（主进程/preload/渲染三层）、cordis + cordis-plugin-loader（既有）、pnpm deploy（host 闭包物化）、electron-builder + @electron/rebuild、vitest。

**关键事实（写计划时已核对源码）：**

- `AbstractApiClient`（`packages/host/apiproxy/src/fetch/client.ts`）只要求子类实现 `doFetch(input: URL, init?: RequestInit): Promise<Response>`；SSE 事件流走基类 `readSse`（fetch body 流），**桌面端不需要 WebSocket**。
- host 侧 `/api` 分发面 = `HostConnectionService.createSharedFetchHandler(API_PATH, fallback)`（`packages/client/connection/src/index.ts` 的 `apply()` 已组装：TypertGateway 经 `rpc.intercept('/api', …)` 挂在同一共享通道上；生产代码无人用 `rpc.handle` 的独立通道，桌面 v1 只需 `/api`）。
- `toFetchHandler(apiProxy).fetch`（`packages/host/apiproxy/src/fetch/handler.ts`）覆盖一元 `/api/<method>`、`/api/respond`、SSE `/api/events.mux|host`、`/api/session.export`。
- `client-connection` host 半边目前 `inject = ['webServer']`，`client-modules` 的 `ClientModuleRegistry` `static inject = ['webServer', 'loader']` —— 两者都要解耦 webServer 才能在桌面树里挂载。
- 渲染端 `dsh://` 是 opaque origin（`location.origin === 'null'`），基类 `resolveBase()` 自动落到 `http://dsh.internal` 假权威，无需改动。
- profile 模板在 `packages/boot/app-boot/src/profile.ts` 的 `PROFILE_TEMPLATES`；`boot(binName, rootConfig, patches, setup)` 与 `healProfilesModuleFallback(installAnchor)` 是既有 API（见 `apps/cli/src/profile-boot.ts`）。

**约定：** 仓库根 = repo（`deepseek-harness-application`）。所有命令在 repo 根执行（除标明 filter 的）。测试命令 `pnpm exec vitest run <file>`；提交信息用 `feat(desktop)/refactor(desktop)/test(desktop)/chore(desktop)/docs(desktop): …`。每个 Task 结束必须全绿才提交。

---

## 文件结构总览

```
packages/client/connection/
  src/client/desktop-bridge.ts        新增：IPC 通道常量 + wire 类型 + readDesktopBridge()
  src/client/desktop-api-client.ts    新增：DesktopApiClient（AbstractApiClient 子类）
  src/client/rpc.ts                   修改：提取 createConnectionRpc(fetcher)
  src/client/index.ts                 修改：载体选择（fixture → desktop → web）
  src/index.ts                        修改：host 半边 webServer 可选化
  src/rpc.ts                          修改：HostConnectionHandle 增加 fetch()
  src/rpc-host.ts                     修改：Service 持有 /api 组装面并暴露 fetch()
  tests/desktop-bridge.client.spec.ts     新增
  tests/desktop-api-client.client.spec.ts 新增
  tests/create-rpc.client.spec.ts          新增
  tests/connection.client.spec.ts          修改（desktop 选择分支）
  tests/node-half.host.spec.ts             修改（无 webServer 用例）
packages/client/modules/
  src/index.ts                        修改：static inject 降为 ['loader']，webServer 惰性注入
  tests/node-half.client.spec.ts      修改（新增无 webServer 用例）
packages/boot/app-boot/
  src/profile.ts                      修改：PROFILE_TEMPLATES.desktop
  tests/                              修改（既有 profile spec 追加用例）
packages/bundle/desktop-app/          新增：@deepseek-ai/dsh-desktop-app
  package.json / tsconfig.json / cordis.patch.yml / README.md / README.zh.md / README.i18n.yaml
  src/index.ts                        运行时胶水：desktopRuntime 服务 + surface prompt
  src/host-boot.ts                    Electron 无关的 profile 启动器（打进 host 闭包）
  src/invariant.ts                    启动不变量断言
  tests/desktop-app.spec.ts / host-boot.spec.ts / invariant.spec.ts / desktop-boot.snapshot.ts
apps/desktop/                         新增：@deepseek-ai/dsh-desktop（Electron 壳）
  package.json / tsconfig.json / electron-builder.yml
  preload.ts                          contextBridge → out/preload.cjs
  src/main.ts / src/window.ts / src/protocol.ts
  src/host-glue/fetch-pump.ts         IPC fetch 泵（注入式 ipc，可单测）
  src/splash.html / src/error.html
  tests/fetch-pump.spec.ts
apps/web/
  vite.config.ts                      修改：desktop 模式（base: './'）
  package.json                        修改：build:desktop 脚本
scripts/pack-desktop.ts               新增：deploy host → 前端 → rebuild → electron-builder
.github/workflows/build-desktop.yml   新增
package.json                          修改：dev:desktop / pack:desktop 脚本
tsconfig.host.json                    修改：references 增加 bundle/desktop-app
docs/subsystems/desktop-app.md (+ .zh.md / website 投影 / module-graph)
.agents/notes/implemented/architecture/2026-08-15-desktop-carrier-layering.md
```

依赖方向不变量：`packages/*` 不依赖 Electron；Electron 类型只出现在 `apps/desktop`。`host-boot.ts` 放在 bundle 包内（打进 resources 闭包），保证 `main.js` 与插件树共享同一个 cordis 实例。

---

### Task 0: 基线确认

**Files:** 无改动。

- [x] **Step 0.1:** 确认工作区干净并安装依赖

```bash
git status --short
pnpm install --frozen-lockfile
```

- [x] **Step 0.2:** 跑本次会触碰的包的既有测试，记录基线

```bash
pnpm exec vitest run packages/client/connection packages/client/modules packages/boot/app-boot packages/bundle/web-app
```

Expected: 全部 PASS。若有既有失败，停止并上报（不要带病开工）。

---

### Task 1: desktop-bridge wire 协议（连接包）

**Files:**
- Create: `packages/client/connection/src/client/desktop-bridge.ts`
- Test: `packages/client/connection/tests/desktop-bridge.client.spec.ts`

- [x] **Step 1.1: 写失败测试**

```typescript
// packages/client/connection/tests/desktop-bridge.client.spec.ts
/** desktop-bridge: wire 常量与 readDesktopBridge 的检测/校验。 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END, DSH_FETCH_ERROR,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
  readDesktopBridge,
} from '../src/client/desktop-bridge.ts'

const KEY = '__DSH_DESKTOP__'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[KEY]
})

function install(value: unknown): void {
  ;(globalThis as Record<string, unknown>)[KEY] = value
}

const BRIDGE = {
  request: async () => {},
  abort: () => {},
  onResponse: () => () => {},
  onChunk: () => () => {},
  onEnd: () => () => {},
  onError: () => () => {},
}

describe('desktop-bridge constants', () => {
  it('pins the six wire channels', () => {
    expect(DSH_FETCH_REQUEST).toBe('dsh-fetch/request')
    expect(DSH_FETCH_RESPONSE).toBe('dsh-fetch/response')
    expect(DSH_FETCH_CHUNK).toBe('dsh-fetch/chunk')
    expect(DSH_FETCH_END).toBe('dsh-fetch/end')
    expect(DSH_FETCH_ERROR).toBe('dsh-fetch/error')
    expect(DSH_FETCH_ABORT).toBe('dsh-fetch/abort')
  })
})

describe('readDesktopBridge', () => {
  it('returns undefined without the global', () => {
    expect(readDesktopBridge()).toBeUndefined()
  })

  it('returns the bridge when present and well-shaped', () => {
    install(BRIDGE)
    expect(readDesktopBridge()).toBe(BRIDGE)
  })

  it('throws loud on a malformed global (protocol invariant)', () => {
    install({ request: 'not-a-function' })
    expect(() => readDesktopBridge()).toThrow(/__DSH_DESKTOP__/)
  })
})
```

- [x] **Step 1.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/connection/tests/desktop-bridge.client.spec.ts`
Expected: FAIL（模块不存在）。

- [x] **Step 1.3: 实现 desktop-bridge.ts**

```typescript
/** Desktop IPC wire contract: channel names, payload shapes, and bridge detection. */

/** Upstream invoke channel (renderer → main): one fetch request. */
export const DSH_FETCH_REQUEST = 'dsh-fetch/request' as const
/** Downstream event: response head (status + headers) for a pending id. */
export const DSH_FETCH_RESPONSE = 'dsh-fetch/response' as const
/** Downstream event: one body chunk for a pending id. */
export const DSH_FETCH_CHUNK = 'dsh-fetch/chunk' as const
/** Downstream event: body complete for a pending id. */
export const DSH_FETCH_END = 'dsh-fetch/end' as const
/** Downstream event: transport failure for a pending id. */
export const DSH_FETCH_ERROR = 'dsh-fetch/error' as const
/** Upstream invoke channel: abort a pending id. */
export const DSH_FETCH_ABORT = 'dsh-fetch/abort' as const

/** Renderer → main request: the whole fetch serialized (body is always JSON text here). */
export interface DesktopFetchWireRequest {
  readonly id: string
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string | null
}

/** Main → renderer response head. */
export interface DesktopFetchWireResponse {
  readonly id: string
  readonly status: number
  readonly headers: Record<string, string>
}

/** Main → renderer body chunk (structured clone carries Uint8Array natively). */
export interface DesktopFetchWireChunk {
  readonly id: string
  readonly data: Uint8Array
}

/** Main → renderer successful completion. */
export interface DesktopFetchWireEnd {
  readonly id: string
}

/** Main → renderer transport failure. */
export interface DesktopFetchWireError {
  readonly id: string
  readonly message: string
}

/**
 * The preload-exposed IPC face. Channel names and payload fields are fixed
 * protocol constants (a security invariant); they are never configurable.
 */
export interface DesktopFetchBridge {
  /** Ship one request upstream; resolves once the main side accepted it. */
  request(message: DesktopFetchWireRequest): Promise<void>
  /** Abort a pending request by id. */
  abort(id: string): void
  /** Subscribe to response heads; returns the unsubscriber. */
  onResponse(listener: (message: DesktopFetchWireResponse) => void): () => void
  /** Subscribe to body chunks; returns the unsubscriber. */
  onChunk(listener: (message: DesktopFetchWireChunk) => void): () => void
  /** Subscribe to completions; returns the unsubscriber. */
  onEnd(listener: (message: DesktopFetchWireEnd) => void): () => void
  /** Subscribe to transport failures; returns the unsubscriber. */
  onError(listener: (message: DesktopFetchWireError) => void): () => void
}

/**
 * Read the desktop IPC bridge from the page global. Absent in web/Node contexts
 * (returns undefined); present-but-malformed throws loud — a half-installed
 * bridge must never silently degrade to the wrong carrier.
 * @returns the bridge, or undefined outside the desktop shell.
 */
export function readDesktopBridge(): DesktopFetchBridge | undefined {
  const candidate = (globalThis as { __DSH_DESKTOP__?: unknown }).__DSH_DESKTOP__
  if (candidate === undefined) return undefined
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('connection: window.__DSH_DESKTOP__ is present but not an object')
  }
  const bridge = candidate as Record<string, unknown>
  for (const key of ['request', 'abort', 'onResponse', 'onChunk', 'onEnd', 'onError']) {
    if (typeof bridge[key] !== 'function') {
      throw new Error(`connection: window.__DSH_DESKTOP__.${key} is missing or not a function`)
    }
  }
  return candidate as DesktopFetchBridge
}
```

- [x] **Step 1.4: 运行确认通过**

Run: `pnpm exec vitest run packages/client/connection/tests/desktop-bridge.client.spec.ts`
Expected: PASS

- [x] **Step 1.5: Commit**

```bash
git add packages/client/connection/src/client/desktop-bridge.ts packages/client/connection/tests/desktop-bridge.client.spec.ts
git commit -m "feat(desktop): desktop IPC wire contract and bridge detection"
```

---

### Task 2: DesktopApiClient（连接包第三载体）

**Files:**
- Create: `packages/client/connection/src/client/desktop-api-client.ts`
- Test: `packages/client/connection/tests/desktop-api-client.client.spec.ts`

- [x] **Step 2.1: 写失败测试**

用真实 wire 序列化的假桥（不经 Electron），覆盖：一元往返、流式 body（把 body 分多 chunk 回传）、abort、error、dispose。测试直接拿 `IApiClient` 域方法跑（协议不变量全在基类，这里验载体）：

```typescript
// packages/client/connection/tests/desktop-api-client.client.spec.ts
/** DesktopApiClient over a fake preload bridge: real wire messages, no Electron. */

import { describe, expect, it, vi } from 'vitest'
import { DesktopApiClient } from '../src/client/desktop-api-client.ts'
import type {
  DesktopFetchBridge, DesktopFetchWireChunk, DesktopFetchWireEnd,
  DesktopFetchWireError, DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '../src/client/desktop-bridge.ts'

/** Fake main-side pump: records upstream requests, lets the test script the downstream. */
function createFakeBridge() {
  const requests: DesktopFetchWireRequest[] = []
  const aborts: string[] = []
  const channels = {
    response: new Set<(m: DesktopFetchWireResponse) => void>(),
    chunk: new Set<(m: DesktopFetchWireChunk) => void>(),
    end: new Set<(m: DesktopFetchWireEnd) => void>(),
    error: new Set<(m: DesktopFetchWireError) => void>(),
  }
  const bridge: DesktopFetchBridge = {
    async request(message) { requests.push(message) },
    abort(id) { aborts.push(id) },
    onResponse: l => { channels.response.add(l); return () => { channels.response.delete(l) } },
    onChunk: l => { channels.chunk.add(l); return () => { channels.chunk.delete(l) } },
    onEnd: l => { channels.end.add(l); return () => { channels.end.delete(l) } },
    onError: l => { channels.error.add(l); return () => { channels.error.delete(l) } },
  }
  return {
    bridge, requests, aborts,
    respond: (m: DesktopFetchWireResponse) => { for (const l of channels.response) l(m) },
    chunk: (m: DesktopFetchWireChunk) => { for (const l of channels.chunk) l(m) },
    end: (m: DesktopFetchWireEnd) => { for (const l of channels.end) l(m) },
    fail: (m: DesktopFetchWireError) => { for (const l of channels.error) l(m) },
  }
}

const encoder = new TextEncoder()

describe('DesktopApiClient', () => {
  it('round-trips a unary call (envelope in, envelope out)', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.host.describe({})
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    expect(wire.method).toBe('POST')
    expect(wire.url).toContain('/api/host.describe')
    const envelope = JSON.parse(wire.body ?? '') as { type: string; method: string }
    expect(envelope.type).toBe('client-request')
    expect(envelope.method).toBe('host.describe')
    fake.respond({ id: wire.id, status: 200, headers: { 'content-type': 'application/json' } })
    fake.chunk({ id: wire.id, data: encoder.encode(JSON.stringify({
      type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { providers: [] } },
    })) })
    fake.end({ id: wire.id })
    const response = await pending
    expect(response.result.ok).toBe(true)
    client.dispose()
  })

  it('streams the body chunk-by-chunk into the Response', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/events.mux'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    fake.respond({ id: wire.id, status: 200, headers: { 'content-type': 'text/event-stream' } })
    fake.chunk({ id: wire.id, data: encoder.encode('data: a\n\n') })
    fake.chunk({ id: wire.id, data: encoder.encode('data: b\n\n') })
    fake.end({ id: wire.id })
    const response = await pending
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toBe('data: a\n\n')
    expect(decoder.decode((await reader.read()).value)).toBe('data: b\n\n')
    expect((await reader.read()).done).toBe(true)
    client.dispose()
  })

  it('forwards AbortSignal to bridge.abort(id)', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const controller = new AbortController()
    void client.transport(new URL('http://dsh.internal/api/session.list'), { signal: controller.signal })
      .catch(() => undefined)
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    controller.abort()
    expect(fake.aborts).toEqual([fake.requests[0].id])
    client.dispose()
  })

  it('rejects on downstream error before the head arrives', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/x'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    fake.fail({ id: fake.requests[0].id, message: 'boom' })
    await expect(pending).rejects.toThrow('boom')
    client.dispose()
  })

  it('dispose detaches listeners and fails pending streams', async () => {
    const fake = createFakeBridge()
    const client = new DesktopApiClient(fake.bridge)
    const pending = client.transport(new URL('http://dsh.internal/api/events.mux'))
    await vi.waitFor(() => { if (fake.requests.length === 0) throw new Error('no request') })
    const wire = fake.requests[0]
    fake.respond({ id: wire.id, status: 200, headers: {} })
    const response = await pending
    client.dispose()
    const reader = response.body!.getReader()
    await expect(reader.read()).rejects.toThrow()
  })
})
```

- [x] **Step 2.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/connection/tests/desktop-api-client.client.spec.ts`
Expected: FAIL（模块不存在）。

- [x] **Step 2.3: 实现 DesktopApiClient**

```typescript
/** Desktop IPC carrier: doFetch ships the request over the preload bridge and rebuilds a streaming Response. */

import { AbstractApiClient } from './api.ts'
import type {
  DesktopFetchBridge, DesktopFetchWireRequest, DesktopFetchWireResponse,
  DesktopFetchWireChunk, DesktopFetchWireEnd, DesktopFetchWireError,
} from './desktop-bridge.ts'

/** One in-flight fetch: downstream listeners route by id into this state. */
interface PendingFetch {
  onHead(message: DesktopFetchWireResponse): void
  onChunk(data: Uint8Array): void
  onEnd(): void
  onError(error: Error): void
}

/**
 * IPC-backed carrier. Protocol invariants (rpcId minting, envelope wrap/parse,
 * SSE decoding, timeouts) all live in AbstractApiClient; this class only moves
 * bytes across the bridge and rebuilds a WHATWG Response whose body is a
 * ReadableStream fed by `dsh-fetch/chunk` events.
 */
export class DesktopApiClient extends AbstractApiClient {
  private readonly pending = new Map<string, PendingFetch>()
  private readonly detach: ReadonlyArray<() => void>
  private disposed = false

  constructor(private readonly bridge: DesktopFetchBridge, timeoutMs?: number) {
    super(timeoutMs)
    this.detach = [
      bridge.onResponse(message => { this.pending.get(message.id)?.onHead(message) }),
      bridge.onChunk(message => { this.pending.get(message.id)?.onChunk(message.data) }),
      bridge.onEnd(message => { this.pending.get(message.id)?.onEnd() }),
      bridge.onError(message => { this.pending.get(message.id)?.onError(new Error(message.message)) }),
    ]
  }

  /** Public transport face for the generic RPC caller (same fetch shape as globalThis.fetch). */
  transport(input: URL, init?: RequestInit): Promise<Response> {
    return this.doFetch(input, init)
  }

  /** Detach bridge listeners and fail every pending fetch (renderer teardown). */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const detach of this.detach) detach()
    for (const pending of [...this.pending.values()]) pending.onError(new Error('desktop carrier disposed'))
    this.pending.clear()
  }

  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    if (this.disposed) return Promise.reject(new Error('desktop carrier disposed'))
    const id = crypto.randomUUID()
    const headers = flattenHeaders(init?.headers)
    const body = typeof init?.body === 'string' ? init.body : null
    const signal = init?.signal

    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined
      let response: Response | undefined
      const cleanup = (): void => {
        this.pending.delete(id)
        signal?.removeEventListener('abort', onAbort)
      }
      const fail = (error: Error): void => {
        cleanup()
        if (response === undefined) reject(error)
        else {
          try { controller?.error(error) } catch { /* stream already closed/cancelled */ }
        }
      }
      const onAbort = (): void => { this.bridge.abort(id) }

      const stream = new ReadableStream<Uint8Array>({
        start(c) { controller = c },
        cancel: () => { this.bridge.abort(id) },
      })
      this.pending.set(id, {
        onHead: message => {
          response = new Response(stream, { status: message.status, headers: message.headers })
          resolve(response)
        },
        onChunk: data => {
          try { controller?.enqueue(data) } catch { /* consumer cancelled */ }
        },
        onEnd: () => {
          cleanup()
          try { controller?.close() } catch { /* double close */ }
        },
        onError: fail,
      })
      const wire: DesktopFetchWireRequest = { id, url: input.toString(), method: init?.method ?? 'GET', headers, body }
      void this.bridge.request(wire).catch(error => { fail(error instanceof Error ? error : new Error(String(error))) })
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  }
}

/** Normalize RequestInit headers (Headers | array | record) to a plain JSON-safe record. */
function flattenHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const flat: Record<string, string> = {}
  if (headers === undefined) return flat
  if (headers instanceof Headers) {
    headers.forEach((value, key) => { flat[key] = value })
    return flat
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) flat[key] = value
    return flat
  }
  for (const [key, value] of Object.entries(headers)) flat[key] = String(value)
  return flat
}
```

- [x] **Step 2.4: 运行确认通过**

Run: `pnpm exec vitest run packages/client/connection/tests/desktop-api-client.client.spec.ts`
Expected: PASS

- [x] **Step 2.5: Commit**

```bash
git add packages/client/connection/src/client/desktop-api-client.ts packages/client/connection/tests/desktop-api-client.client.spec.ts
git commit -m "feat(desktop): DesktopApiClient IPC carrier for AbstractApiClient"
```

---

### Task 3: createConnectionRpc 提取（rpc.ts 参数化）

**Files:**
- Modify: `packages/client/connection/src/client/rpc.ts`
- Test: `packages/client/connection/tests/create-rpc.client.spec.ts`

- [x] **Step 3.1: 写失败测试**（注入式 fetcher 的一元调用 + rpcId 校验 + 非法 target）

```typescript
// packages/client/connection/tests/create-rpc.client.spec.ts
/** createConnectionRpc: correlation and envelope validation over an injected fetcher. */

import { describe, expect, it } from 'vitest'
import { createConnectionRpc, createWebConnectionRpc } from '../src/client/rpc.ts'

function okFetch(body: unknown): (input: URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    expect(init?.method).toBe('POST')
    const sent = JSON.parse(String(init?.body)) as { rpcId: string; method: string }
    return new Response(JSON.stringify({ type: 'server-response', rpcId: sent.rpcId, result: { ok: true, value: body } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
}

describe('createConnectionRpc', () => {
  it('calls through the injected fetcher and returns the result slot', async () => {
    const rpc = createConnectionRpc(okFetch({ answer: 42 }))
    const result = await rpc.call('/api', 'goals/create', { title: 'x' })
    expect(result).toEqual({ ok: true, value: { answer: 42 } })
  })

  it('throws on rpcId mismatch', async () => {
    const rpc = createConnectionRpc(async () => new Response(JSON.stringify({
      type: 'server-response', rpcId: 'not-the-sent-one', result: { ok: true, value: null },
    }), { status: 200 }))
    await expect(rpc.call('/api', 'goals/create', {})).rejects.toThrow(/rpcId mismatch/)
  })

  it('rejects invalid targets before any fetch', async () => {
    const fetcher = async () => { throw new Error('must not be called') }
    const rpc = createConnectionRpc(fetcher)
    await expect(rpc.call('/api', '../escape', {})).rejects.toThrow(/invalid RPC target/)
  })

  it('createWebConnectionRpc still exists (web carrier unchanged)', () => {
    expect(typeof createWebConnectionRpc).toBe('function')
  })
})
```

- [x] **Step 3.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/connection/tests/create-rpc.client.spec.ts`
Expected: FAIL（`createConnectionRpc` 未导出）。

- [x] **Step 3.3: 重构 rpc.ts**

将 `createWebConnectionRpc` 的函数体整体上提为 `createConnectionRpc(fetcher)`，`createWebConnectionRpc` 变为一行包装。文件其余部分（`resolveBase`、`assertTarget`、常量）不动：

```typescript
/**
 * Create a generic RPC caller over an injected fetch-shaped transport.
 * @param fetcher - transport: web global fetch, desktop IPC carrier, or test double.
 * @returns caller that owns request correlation and response-envelope validation.
 */
export function createConnectionRpc(
  fetcher: (input: URL, init?: RequestInit) => Promise<Response>,
): ClientConnectionRpc {
  return {
    async call(channel, endpoint, payload, signal) {
      assertTarget(channel, endpoint)
      const rpcId = RpcId(randomUuid())
      const message: ClientRequest = {
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload,
      }
      const response = await fetcher(new URL(`${channel}/${endpoint}`, resolveBase()), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message),
        ...signal === undefined ? {} : { signal },
      })
      if (!response.ok) {
        throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`)
      }
      const full = serverResponseSchema.parse(await response.json())
      if (full.rpcId !== rpcId) {
        throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`)
      }
      return full.result
    },
  }
}

/** The browser-backed variant over the page's global fetch. */
export function createWebConnectionRpc(): ClientConnectionRpc {
  return createConnectionRpc((input, init) => globalThis.fetch(input, init))
}
```

- [x] **Step 3.4: 运行本包全部 client 测试**

Run: `pnpm exec vitest run packages/client/connection`
Expected: PASS（新增与既有全绿）。

- [x] **Step 3.5: Commit**

```bash
git add packages/client/connection/src/client/rpc.ts packages/client/connection/tests/create-rpc.client.spec.ts
git commit -m "refactor(desktop): parameterize connection RPC caller transport"
```

---

### Task 4: 渲染端载体选择（client/index.ts）

**Files:**
- Modify: `packages/client/connection/src/client/index.ts`
- Test: `packages/client/connection/tests/connection.client.spec.ts`（追加用例）

- [x] **Step 4.1: 在 connection.client.spec.ts 追加失败测试**

先 Read 既有 `packages/client/connection/tests/connection.client.spec.ts`，仿照其构造 client 树的方式追加一个用例（`DesktopApiClient` 从 `../src/client/desktop-api-client.ts` import；Context 构造完全复用该文件既有 helper）：

```typescript
it('selects the DesktopApiClient when __DSH_DESKTOP__ is present', async () => {
  vi.stubGlobal('__DSH_DESKTOP__', {
    request: async () => {}, abort: () => {},
    onResponse: () => () => {}, onChunk: () => () => {},
    onEnd: () => () => {}, onError: () => () => {},
  })
  try {
    // 与本文件其他用例相同的 client Context 构造 + apply(ctx)
    apply(ctx)
    expect(ctx.connection.api).toBeInstanceOf(DesktopApiClient)
    expect(ctx.connection.isLoopback).toBe(true)
  } finally {
    vi.unstubAllGlobals()
  }
})
```

- [x] **Step 4.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/connection/tests/connection.client.spec.ts`
Expected: 新用例 FAIL（当前总是 WebApiClient）。

- [x] **Step 4.3: 修改 apply() 的载体选择**

在 `packages/client/connection/src/client/index.ts`：import 增加 `readDesktopBridge`（`./desktop-bridge.ts`）、`DesktopApiClient`（`./desktop-api-client.ts`）、`createConnectionRpc`（`./rpc.ts`）；`apply` 顶部替换载体选择（`fixture` 判定行保持不变）：

```typescript
  const desktopBridge = readDesktopBridge()
  const fixtureClient = fixture ? new FixtureApiClient() : undefined
  const desktopClient = desktopBridge === undefined ? undefined : new DesktopApiClient(desktopBridge)
  const api: IApiClient = fixtureClient ?? desktopClient ?? new WebApiClient()
  const rpc = fixtureClient?.rpc
    ?? (desktopClient !== undefined
      ? createConnectionRpc((input, init) => desktopClient.transport(input, init))
      : createWebConnectionRpc())
  if (desktopClient !== undefined) {
    ctx.effect(() => () => { desktopClient.dispose() }, 'connection: desktop carrier teardown')
  }
```

`isLoopback` 一行改为：

```typescript
    isLoopback: desktopBridge !== undefined || pageLocation === undefined || isLoopbackHostname(pageLocation.hostname),
```

同时在文件头部的 contract re-export 区追加：

```typescript
export { readDesktopBridge } from './desktop-bridge.ts'
export type { DesktopFetchBridge } from './desktop-bridge.ts'
export { DesktopApiClient } from './desktop-api-client.ts'
export { createConnectionRpc } from './rpc.ts'
```

- [x] **Step 4.4: 运行确认通过**

Run: `pnpm exec vitest run packages/client/connection`
Expected: PASS

- [x] **Step 4.5: Commit**

```bash
git add packages/client/connection/src/client/index.ts packages/client/connection/tests/connection.client.spec.ts
git commit -m "feat(desktop): renderer carrier selection for the desktop bridge"
```

---

### Task 5: client-connection host 半边 webServer 可选化

目标：桌面树挂 client-connection（提供 `ctx.connection` 与 `/api` 组装面），但没有 webServer 也能活；webServer 存在时行为与现在一致。

**Files:**
- Modify: `packages/client/connection/src/index.ts`
- Modify: `packages/client/connection/src/rpc.ts`（`HostConnectionHandle` 增 `fetch`）
- Modify: `packages/client/connection/src/rpc-host.ts`（Service 持有组装面）
- Test: `packages/client/connection/tests/node-half.host.spec.ts`（追加用例）

- [x] **Step 5.1: 写失败测试**

在 `node-half.host.spec.ts` 追加（沿用该文件既有的 Context/apiProxy fixture 构造方式，仅不注册 webServer）：

```typescript
describe('without webServer (desktop surface)', () => {
  it('provides ctx.connection and serves /api through handle.fetch', async () => {
    const ctx = /* 既有 helper，带 apiProxy、无 webServer */
    apply(ctx, {})
    const response = await ctx.connection.fetch(new Request('http://127.0.0.1/api/session.list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 't1', method: 'session.list', payload: {} }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.type).toBe('server-response')
    await ctx.fiber.dispose()
  })
})
```

- [x] **Step 5.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/connection/tests/node-half.host.spec.ts`
Expected: 新用例 FAIL（`inject = ['webServer']` 使无 webServer 的树不挂载）。

- [x] **Step 5.3: 修改 rpc.ts 接口**

`HostConnectionHandle` 增加：

```typescript
export interface HostConnectionHandle {
  /** Generic RPC channel registry. */
  readonly rpc: HostConnectionRpc
  /**
   * Transport-independent /api dispatch (shared-channel interceptor +
   * apiproxy fallback) for non-HTTP carriers (the desktop IPC pump). The
   * caller owns request construction; a private carrier expresses its
   * loopback-equivalent trust through the request's loopback authority.
   */
  fetch(request: Request): Promise<Response>
}
```

- [x] **Step 5.4: 修改 rpc-host.ts**

`HostConnectionService` 增加一个私有字段与两个成员（其余不动）：

```typescript
  private apiFallback: FetchHandler | undefined

  /**
   * Install the /api fallback once (plugin body); the dispatch face composes
   * interceptor + fallback per request so late interceptors are honored.
   * @param fallback - the apiproxy-backed fetch handler from the plugin body.
   */
  adoptApiFallback(fallback: FetchHandler): void {
    this.apiFallback = fallback
  }

  /** HostConnectionHandle.fetch: /api dispatch without an HTTP server. */
  async fetch(request: Request): Promise<Response> {
    if (this.apiFallback === undefined) return new Response('not found', { status: 404 })
    return this.createSharedFetchHandler(API_PATH, this.apiFallback).fetch(request)
  }
```

同时给 `register()`（独立逻辑通道）在构造 route 之前加响亮报错：

```typescript
    if (this.ctx.get('webServer') === undefined) {
      throw new Error('connection: logical RPC channel registration requires the webServer surface (desktop v1 carries /api only)')
    }
```

- [x] **Step 5.5: 修改 src/index.ts 的 apply()**

- `export const inject = ['webServer']` → `export const inject: string[] = []`
- `apply()` 中构造 `fetchHandler`（既有 `connection.createSharedFetchHandler(API_PATH, {...})` 结果）后，追加一行 `connection.adoptApiFallback(fetchHandler)`。
- 把 webServer 路由注册与 WebSocket downlink 两段包进惰性注入（`route` 定义与 downlink 代码体原封不动搬移）：

```typescript
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(route), 'client-connection: /api route')
    webCtx.inject(['apiProxy'], (apiCtx) => {
      // ……原有 WebSocketDownlinks 两段原样搬入……
    })
  })
```

（`ctx.inject(['apiProxy'], …)` 里的 `assertImageBodyCapacity` 保留原位。）

- [x] **Step 5.6: 运行本包全部测试**

Run: `pnpm exec vitest run packages/client/connection`
Expected: PASS（既有 webServer 用例全部保持绿——验证行为未变）。

- [x] **Step 5.7: Commit**

```bash
git add packages/client/connection/src packages/client/connection/tests/node-half.host.spec.ts
git commit -m "refactor(desktop): make client-connection webServer optional, expose /api dispatch face"
```

---

### Task 6: client-modules 解耦 webServer

**Files:**
- Modify: `packages/client/modules/src/index.ts`
- Test: `packages/client/modules/tests/node-half.client.spec.ts`（追加用例）

- [x] **Step 6.1: 写失败测试**

在该文件追加（复用其 `writePackage` helper 与临时 root；Context/loader 构造沿用同文件既有 webServer 用例，仅去掉 webServer）：

```typescript
it('composes the graph without webServer (desktop surface)', () => {
  writePackage('@deepseek-ai/dsh-fake-ui')
  const ctx = /* 既有 loader 构造，无 webServer */
  const registry = new ClientModuleRegistry(ctx)
  expect(registry.graph().entries.map(e => e.id)).toContain('@deepseek-ai/dsh-fake-ui')
  expect(registry.clientPath('@deepseek-ai/dsh-fake-ui')).toBeDefined()
})
```

- [x] **Step 6.2: 运行确认失败**

Run: `pnpm exec vitest run packages/client/modules/tests/node-half.client.spec.ts`
Expected: 新用例 FAIL。

- [x] **Step 6.3: 修改 ClientModuleRegistry**

```typescript
export class ClientModuleRegistry extends Service {
  static inject = ['loader']
```

构造函数尾部的两个 `ctx.effect(...)`（bundle 路由 + tapIndex）替换为：

```typescript
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(
        () => webCtx.webServer.register({ kind: 'prefix', path: '/plugins', handler: this.serveBundle }),
        'client-modules: bundle route',
      )
      webCtx.effect(
        () => webCtx.webServer.tapIndex(html => injectBootManifest(html, this.composed)),
        'client-modules: boot manifest injection',
      )
    })
```

模块头 JSDoc 补一句：webServer 半边（路由 + index 注入）为惰性注入；无 webServer 的表面（桌面）经 `graph()`/`clientPath()` 直接消费同一组合结果。

- [x] **Step 6.4: 运行确认通过 + 全包回归**

Run: `pnpm exec vitest run packages/client/modules`
Expected: PASS

- [x] **Step 6.5: Commit**

```bash
git add packages/client/modules packages/client/modules/tests/node-half.client.spec.ts
git commit -m "refactor(desktop): client-modules webServer half becomes lazy injection"
```

---

### Task 7: app-boot desktop profile 模板

**Files:**
- Modify: `packages/boot/app-boot/src/profile.ts`
- Test: `packages/boot/app-boot/tests/`（既有 profile 相关 spec 追加）

- [x] **Step 7.1:** Read `packages/boot/app-boot/tests/` 目录，选定覆盖 `PROFILE_TEMPLATES`/`loadProfile` 的既有 spec 文件。

- [x] **Step 7.2: 写失败测试**

```typescript
it('ships a desktop profile template composing base + desktop-app', () => {
  expect(PROFILE_TEMPLATES.desktop).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-desktop-app'])
})
```

- [x] **Step 7.3: 运行确认失败**

Run: `pnpm exec vitest run packages/boot/app-boot`
Expected: FAIL。

- [x] **Step 7.4: 实现**

```typescript
export const PROFILE_TEMPLATES: Record<string, readonly string[]> = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-desktop-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}
```

注意：`INSTALLATION_OWNED_PROFILE_TUPLES` 不动（desktop 无历史包需要归一）。

- [x] **Step 7.5: 运行确认通过**

Run: `pnpm exec vitest run packages/boot/app-boot`
Expected: PASS（模板断言用例单独绿；因 `@deepseek-ai/dsh-desktop-app` 包在 Task 8 才创建，全量 build 留到 Task 8 后验证）。

- [x] **Step 7.6: Commit**

```bash
git add packages/boot/app-boot
git commit -m "feat(desktop): desktop profile template in app-boot"
```

---

### Task 8: desktop-app bundle（运行时胶水）

**Files:**
- Create: `packages/bundle/desktop-app/package.json`
- Create: `packages/bundle/desktop-app/tsconfig.json`
- Create: `packages/bundle/desktop-app/cordis.patch.yml`
- Create: `packages/bundle/desktop-app/src/index.ts`
- Create: `packages/bundle/desktop-app/src/invariant.ts`
- Test: `packages/bundle/desktop-app/tests/desktop-app.spec.ts`、`tests/invariant.spec.ts`
- Modify: `tsconfig.host.json`（references 追加 `{ "path": "./packages/bundle/desktop-app" }`，插在 `web-app` 之后）

- [x] **Step 8.1: package.json**（以 `packages/bundle/web-app/package.json` 为底，按下列差异修改——diff 列表即全部改动）：

```jsonc
{
  "name": "@deepseek-ai/dsh-desktop-app",
  "description": "The dsh desktop-surface bundle: the desktop patch layer over dsh-base plus the runtime glue plugin (IPC fetch carrier face, boot manifest, desktop-surface prompt) and the Electron-free host boot used by the desktop shell",
  "version": "0.1.0-rc.5",
  // publishConfig/repository/type/main/types 照抄 web-app
  //（repository.directory 改 "packages/bundle/desktop-app"；publishConfig.access 保持 public）
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./host-boot": { "types": "./lib/types/host-boot.d.ts", "default": "./lib/host-boot.js" },
    "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "lib/host-boot.js", "lib/invariant.js", "cordis.patch.yml", "lib/types/**/*.d.ts"],
  "license": "MIT",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": {
    // = web-app 的 dependencies，删去这 7 项：
    //   "@deepseek-ai/dsh-client-hmr"、"@deepseek-ai/dsh-web-frontend"、
    //   "@deepseek-ai/dsh-host-frontend-static"、"@deepseek-ai/dsh-host-webserver"、
    //   "@deepseek-ai/dsh-host-directory-picker-auto"、"@deepseek-ai/dsh-host-directory-picker-browse"、
    //   "commander"
    // 新增这 1 项：
    "@deepseek-ai/dsh-host-directory-picker-native": "workspace:^",
    // 其余（agent-presets/api-remotes/app-boot/client-connection/client-locale/
    // client-modules/client-runtime/全部 ui-*/cmdline/code-runtime-worker-thread/
    // cordis-client-runner/cordis-host-runner/host-apiproxy/host-plugin-inventory/
    // message-feedback/session-projection-cache/session-log-export/session-stats/
    // storage/storage-json/storage-domain/workspace/schemastery）逐字保留
  }
  // peerDependencies/devDependencies 与 web-app 完全一致
}
```

`tsconfig.json`：逐字复制 `packages/bundle/web-app/tsconfig.json`。

- [x] **Step 8.2: cordis.patch.yml**（以 web-app 的 patch 为底；保留区域逐字复制，差异如下）

保留不变（逐字复制 web-app 对应行）：`system-prompt` persona、`hmr disabled`、`session-query-sqlite`（`:memory:` + `openAt: never`）、`tools` 的 `DSH_TOOLS_MODE` seam；insert 列表中的 `code-runtime / storage / storage-json / storage-domain / message-feedback / session-log-download / workspace / session-projection-cache / session-stats / plugin-inventory / api-gateway / cordis-host-runner`；全部浏览器 roster 行（`modules` 起至 `ui-trajectory`）；文件尾部全部 `disabled: true` 行与 `agent-presets` insert。

删除的行（web 有 desktop 无）：`webserver`、`web-startup`、`web-runtime`、`client-hmr`、`directory-picker`（-auto）。

替换/新增的行：

```yaml
    # 桌面永远有原生对话框：直接挂 native picker。
    - id: directory-picker
      name: '@deepseek-ai/dsh-host-directory-picker-native'

    # 桌面胶水：暴露 desktopRuntime（IPC fetch 载体面 + boot manifest + dist 路径表），
    # 注册 app:desktop-surface prompt section。
    - id: desktop-runtime
      name: '@deepseek-ai/dsh-desktop-app'
```

`connection` 行改为（去掉 webStartup 注入与 trustedHosts——IPC 是私有载体，无 LAN 面）：

```yaml
    # Owns both ends of the desktop transport: node half provides the /api
    # dispatch face (ctx.connection.fetch) the IPC pump consumes; browser
    # half is the DesktopApiClient carrier selected by __DSH_DESKTOP__.
    - id: connection
      name: '@deepseek-ai/dsh-client-connection'
```

文件头注释改写为桌面版说明（三行以内：desktop surface over dsh-base；无 webserver/HMR；行覆盖语义同 web）。

- [x] **Step 8.3: src/index.ts（胶水插件）**

```typescript
/**
 * Desktop surface runtime glue: provides the `desktopRuntime` service (the
 * Electron main process's single consumption face — IPC fetch carrier, boot
 * manifest, plugin bundle paths, frontend index path) and registers the
 * `app:desktop-surface` prompt section.
 * @module @deepseek-ai/dsh-desktop-app
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebBootGraph } from '@deepseek-ai/dsh-client-modules'

/** Plugin config. */
export interface DesktopAppConfig {
  /** Absolute path of the desktop frontend index.html (injected by host-boot from the shell's resources dir). */
  frontendIndex?: string
  /** Whether to register the desktop-surface prompt section. */
  surfaceContext?: boolean
}

export const Config: z<DesktopAppConfig> = z.object({
  frontendIndex: z.string().optional(),
  surfaceContext: z.boolean().default(true),
})

/** The Electron main process's consumption face over the settled desktop tree. */
export interface DesktopRuntime {
  /** /api dispatch (TypertGateway interceptor + apiproxy fallback) — the IPC pump's carrier. */
  fetch(request: Request): Promise<Response>
  /** Current composed `window.__DSH_BOOT__` graph. */
  graph(): WebBootGraph
  /** Absolute path of one plugin's built client bundle. */
  clientPath(id: string): string | undefined
  /** Absolute path of the frontend index.html this surface serves. */
  frontendIndex(): string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The desktop shell consumption face (provided by the desktop-app glue). */
    desktopRuntime: DesktopRuntime
  }
}

/** Required services: the /api dispatch face and the client module table. */
export const inject = ['connection', 'clientModules']

/** Stable Cordis plugin name. */
export const name = 'desktop-app'

/**
 * Desktop glue body.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config?: DesktopAppConfig): void {
  const frontendIndex = config?.frontendIndex ?? ''
  ctx.provide('desktopRuntime', {
    fetch: request => ctx.connection.fetch(request),
    graph: () => ctx.clientModules.graph(),
    clientPath: id => ctx.clientModules.clientPath(id),
    frontendIndex: () => frontendIndex,
  } satisfies DesktopRuntime)
  if (config?.surfaceContext === false) return
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'app:desktop-surface',
      order: -98,
      text: () => [
        '# Desktop surface',
        '- The user interacts with you through the DeepSeek Harness desktop application window.',
        '- There is no URL, port, or browser tab; do not refer to one.',
        '- There is no hot reload; file edits take effect when the user reruns things.',
        '- Native desktop dialogs (directory pickers, file opens) are available through the usual host tools.',
      ].join('\n'),
    })
  })
}
```

实现注意：`systemPrompt.section` 的真实签名以 `packages/bundle/web-app/src/index.ts` 中 `app:web-surface` 的注册代码为准——写码前先 Read 该文件，逐字对齐 section 调用形状（name/order/text），只替换文案；若 web 侧还调用了 `addHarnessSourceSection`，同样照搬（sourceRoot 指向本包）。

- [x] **Step 8.4: src/invariant.ts**

```typescript
/** Startup invariants for the desktop surface. */
import type { Context } from '@deepseek-ai/cordis'

/**
 * Assert the desktop tree settled into a servable shape; throws loud otherwise.
 * @param ctx - the settled desktop root context.
 */
export function assertDesktopTree(ctx: Context): void {
  if (ctx.get('desktopRuntime') === undefined) {
    throw new Error('desktop-app: the tree settled without desktopRuntime — is the desktop-runtime row composed?')
  }
  if (ctx.get('clientModules') === undefined) {
    throw new Error('desktop-app: the tree settled without clientModules — the browser roster cannot be composed')
  }
  if (ctx.get('apiProxy') === undefined) {
    throw new Error('desktop-app: the tree settled without apiProxy — the IPC carrier would 404 every call')
  }
}
```

- [x] **Step 8.5: 写测试**

`tests/invariant.spec.ts`：构造 Context 断言三个分支的报错文案。`tests/desktop-app.spec.ts`：按 `packages/bundle/web-app/tests/web-app.spec.ts` 的既有方式构造最小树挂入本插件，断言：`ctx.desktopRuntime.graph()` 返回 clientModules 的同一对象；`clientPath` 透传；`frontendIndex()` 返回 config 值；`surfaceContext: false` 时不注册 prompt section。实现时先 Read web-app 的 spec 与 fixture 搭法，复用其 helper。

- [x] **Step 8.6: 运行 + 构建**

```bash
pnpm exec vitest run packages/bundle/desktop-app
pnpm run build:lib
```

Expected: 测试 PASS；`build:lib` 成功。若 web-app 有 `tsdown.config.ts`，复制一份并按 exports 面调整（index/host-boot/invariant 三个 entry）；对照 web-app 的构建配置落位。

- [x] **Step 8.7: Commit**

```bash
git add packages/bundle/desktop-app tsconfig.host.json
git commit -m "feat(desktop): dsh-desktop-app bundle (patch layer + runtime glue)"
```

---

### Task 9: host-boot（bundle 包内的 Electron 无关启动器）

**Files:**
- Create: `packages/bundle/desktop-app/src/host-boot.ts`
- Test: `packages/bundle/desktop-app/tests/host-boot.spec.ts`

- [x] **Step 9.1: 写失败测试**

```typescript
// packages/bundle/desktop-app/tests/host-boot.spec.ts
/** host-boot: desktop profile composition + settle + dispose, in-process (no Electron). */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bootDesktopHost } from '../src/host-boot.ts'

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-host-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

describe('bootDesktopHost', () => {
  it('boots the desktop profile and settles desktopRuntime', { timeout: 60_000 }, async () => {
    const handle = await bootDesktopHost({ home, frontendIndexPath: '/tmp/index.html' })
    expect(handle.runtime.frontendIndex()).toBe('/tmp/index.html')
    expect(typeof handle.runtime.fetch).toBe('function')
    expect(handle.runtime.graph().entries.length).toBeGreaterThan(0)
    await handle.dispose()
  })
})
```

- [x] **Step 9.2: 运行确认失败**

Run: `pnpm exec vitest run packages/bundle/desktop-app/tests/host-boot.spec.ts`
Expected: FAIL（模块不存在）。

- [x] **Step 9.3: 实现 host-boot.ts**（对照 `apps/cli/src/profile-boot.ts` 逐段裁剪；无 CLI flags/telemetry/信号处理——Electron main 拥有生命周期）

```typescript
/**
 * Electron-free desktop profile boot: the desktop shell (apps/desktop) imports
 * this from the packaged host closure so the shell and the plugin tree share
 * one cordis instance. Mirrors the CLI profile boot minus argv/signal concerns.
 * @module @deepseek-ai/dsh-desktop-app/host-boot
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import {
  boot, composeEntries, healProfilesModuleFallback, loadOptionalPatches,
  loadProfile, watchUserPatches, PROFILE_PATCH_FILENAME,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { assertDesktopTree } from './invariant.ts'
import type { DesktopRuntime } from './index.ts'

const NAME = 'dsh-desktop'

const PROFILE_ROOT_CONFIG = `# dsh-desktop profile root — an empty entry list; the tree is composed as patches.
[]
`

/** Options for {@link bootDesktopHost}. */
export interface BootDesktopHostOptions {
  /** Harness home (tests inject a temp dir; the shell passes the real one). */
  home?: string
  /** Absolute path of the frontend index.html (surfaced via desktopRuntime). */
  frontendIndexPath: string
  /** Exit request sink wired to the shell's quit path. */
  requestExit?: (code: number) => void
}

/** Settled desktop host handle: the runtime face plus bounded disposal. */
export interface DesktopHostHandle {
  /** The settled root context. */
  ctx: Context
  /** desktopRuntime service face (fetch carrier + manifest + paths). */
  runtime: DesktopRuntime
  /** Dispose the tree; resolves when the fiber is gone. */
  dispose(): Promise<void>
}

/**
 * Boot the desktop profile end to end: heal the profiles module fallback,
 * compose bundle + user patch layers, mount the tree, and settle.
 * @param options - home, frontend path, exit sink.
 * @returns the settled handle.
 */
export async function bootDesktopHost(options: BootDesktopHostOptions): Promise<DesktopHostHandle> {
  const home = options.home ?? resolveDshHome()
  const require = createRequire(import.meta.url)
  const installAnchor = require.resolve('@deepseek-ai/dsh-desktop-app/package.json')
  healProfilesModuleFallback(installAnchor, home)
  const profile = loadProfile(NAME, 'desktop', installAnchor, home)
  writeFileSync(join(profile.dir, 'cordis.yml'), PROFILE_ROOT_CONFIG)
  const homePatches = loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const hasRuntimeRow = composeEntries([bundlePatches, profile.patches, homePatches])
    .some(row => row.id === 'desktop-runtime')
  const runtimeOverlay = hasRuntimeRow
    ? [{ id: 'desktop-runtime', config: { frontendIndex: options.frontendIndexPath } }]
    : []
  const composeLive = () => structuredClone([
    ...bundlePatches,
    ...loadOptionalPatches(NAME, profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? [],
    ...runtimeOverlay,
  ])
  const ctx = await boot(NAME, join(profile.dir, 'cordis.yml'), structuredClone([
    ...bundlePatches, ...profile.patches, ...homePatches, ...runtimeOverlay,
  ]), (hostCtx) => {
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, /* launch-environment 的真实快照构造 */)
    provideCmdline(hostCtx, { args: [], exit: code => options.requestExit?.(code) })
  })
  assertDesktopTree(ctx)
  const runtime = ctx.desktopRuntime
  try {
    await watchUserPatches(ctx, { binName: NAME, filename: profile.patchPath, compose: composeLive })
    await watchUserPatches(ctx, { binName: NAME, filename: join(home, PROFILE_PATCH_FILENAME), compose: composeLive })
  } catch (error) {
    if (ctx.get('loader') !== undefined) throw error
  }
  return {
    ctx,
    runtime,
    dispose: async () => { await ctx.fiber.dispose() },
  }
}
```

**实现时必须逐一对齐的签名（写码前先 Read 源文件，不要凭本计划猜）：**
- `boot` / `watchUserPatches` / `loadOptionalPatches` / `DSH_LAUNCH_ENVIRONMENT_KEY` / `provideCmdline` 的真实签名——见 `packages/boot/app-boot/src/index.ts`、`packages/util/launch-environment/src/index.ts`、`packages/boot/cmdline`。环境快照按 CLI 侧 `apps/cli/src/bin.ts` 的真实构造生成。
- `composeLive` 的返回类型用 `PatchOptions[]`（`@deepseek-ai/cordis-plugin-include`），按真实类型补齐泛型。

- [x] **Step 9.4: 运行确认通过**

Run: `pnpm exec vitest run packages/bundle/desktop-app`
Expected: PASS（host-boot 用例较慢，属正常——真实树装配）。

- [x] **Step 9.5: Commit**

```bash
git add packages/bundle/desktop-app
git commit -m "feat(desktop): Electron-free desktop host boot in the bundle package"
```

---

### Task 10: apps/desktop Electron 壳

**Files:**
- Create: `apps/desktop/package.json`、`apps/desktop/tsconfig.json`、`apps/desktop/electron-builder.yml`
- Create: `apps/desktop/preload.ts`
- Create: `apps/desktop/src/main.ts`、`src/window.ts`、`src/protocol.ts`、`src/host-glue/fetch-pump.ts`
- Create: `apps/desktop/src/splash.html`
- Test: `apps/desktop/tests/fetch-pump.spec.ts`

- [x] **Step 10.1: package.json**

```jsonc
{
  "name": "@deepseek-ai/dsh-desktop",
  "description": "DeepSeek Harness desktop shell (Electron): window, dsh:// protocol, IPC fetch pump over the packaged host closure",
  "version": "0.1.0-rc.5",
  "private": true,
  "license": "MIT",
  "main": "out/main.js",
  "scripts": {
    "build:shell": "esbuild src/main.ts --bundle --platform=node --format=cjs --outfile=out/main.js --external:electron --sourcemap && esbuild preload.ts --bundle --platform=node --format=cjs --outfile=out/preload.cjs",
    "start": "electron .",
    "pack": "tsx ../../scripts/pack-desktop.ts"
  },
  "devDependencies": {
    "electron": "^38.0.0",
    "electron-builder": "^25.0.0",
    "@electron/rebuild": "^3.6.0",
    "esbuild": "^0.24.0",
    "tsx": "^4.19.0"
  }
}
```

注意：`esbuild/tsx` 版本对齐根 devDependencies 已有版本（Read 根 package.json 后统一）；Electron 选 38.x（内嵌 Node 22.20 ≥ 22.19，满足 `node:sqlite` 与 engines）。**apps/desktop 不加入 tsconfig.host.json/client.json**（Electron 类型独立面）。`tsconfig.json`：

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "preload.ts", "tests/**/*.ts"]
}
```

- [x] **Step 10.2: preload.ts**

```typescript
/** Sandboxed preload: the renderer's only privileged surface is the IPC fetch bridge. */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopFetchWireChunk, DesktopFetchWireEnd, DesktopFetchWireError,
  DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '@deepseek-ai/dsh-client-connection/client/desktop-bridge'

type Listener<T> = (message: T) => void

function bind<T>(channel: string, listener: Listener<T>): () => void {
  const wrapped = (_event: unknown, message: T): void => { listener(message) }
  ipcRenderer.on(channel, wrapped)
  return () => { ipcRenderer.removeListener(channel, wrapped) }
}

contextBridge.exposeInMainWorld('__DSH_DESKTOP__', {
  request: (message: DesktopFetchWireRequest): Promise<void> =>
    ipcRenderer.invoke('dsh-fetch/request', message) as Promise<void>,
  abort: (id: string): void => { void ipcRenderer.invoke('dsh-fetch/abort', { id }) },
  onResponse: (listener: Listener<DesktopFetchWireResponse>) => bind('dsh-fetch/response', listener),
  onChunk: (listener: Listener<DesktopFetchWireChunk>) => bind('dsh-fetch/chunk', listener),
  onEnd: (listener: Listener<DesktopFetchWireEnd>) => bind('dsh-fetch/end', listener),
  onError: (listener: Listener<DesktopFetchWireError>) => bind('dsh-fetch/error', listener),
})
```

（esbuild 会内联该 import 的**类型**——desktop-bridge 只有 interface 与字符串常量，无运行时代价。若 `./client/desktop-bridge` 不在 connection 包 exports 中，实现时在 connection 包 package.json exports 增加该 subpath。）

- [x] **Step 10.3: fetch-pump.ts（先写测试再实现）**

注入式 ipc 面，使其可在 Node 单测中跑：

```typescript
// apps/desktop/src/host-glue/fetch-pump.ts
/**
 * Main-process IPC fetch pump: dsh-fetch/request → host /api dispatch →
 * streamed dsh-fetch/response|chunk|end|error. The wire URL's fake authority
 * is rewritten to the loopback literal before dispatch: the /api trust fence
 * (privileged-method pinning) treats IPC as the loopback-equivalent private
 * carrier it is.
 */

import {
  DSH_FETCH_ABORT, DSH_FETCH_CHUNK, DSH_FETCH_END, DSH_FETCH_ERROR,
  DSH_FETCH_REQUEST, DSH_FETCH_RESPONSE,
} from '@deepseek-ai/dsh-client-connection/client/desktop-bridge'
import type { DesktopFetchWireRequest } from '@deepseek-ai/dsh-client-connection/client/desktop-bridge'

/** Injectable ipcMain face (tests substitute an emitter map). */
export interface IpcInvokeRegistrar {
  handle(channel: string, listener: (raw: unknown) => unknown): void
  removeHandler(channel: string): void
}

/** Injectable webContents face. */
export interface IpcSender {
  send(channel: string, message: unknown): void
}

function parseWireRequest(raw: unknown): DesktopFetchWireRequest | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== 'string' || typeof candidate.url !== 'string'
    || typeof candidate.method !== 'string' || typeof candidate.headers !== 'object'
    || typeof candidate.headers === null
    || (candidate.body !== null && typeof candidate.body !== 'string')) return undefined
  return raw as DesktopFetchWireRequest
}

/**
 * Mount the pump over one renderer.
 * @param ipc - ipcMain face.
 * @param sender - the window's webContents.
 * @param fetch - host /api dispatch (desktopRuntime.fetch).
 * @returns disposer aborting every in-flight request and removing handlers.
 */
export function mountFetchPump(
  ipc: IpcInvokeRegistrar,
  sender: IpcSender,
  fetch: (request: Request) => Promise<Response>,
): { dispose(): void } {
  const aborts = new Map<string, AbortController>()
  ipc.handle(DSH_FETCH_REQUEST, raw => {
    const wire = parseWireRequest(raw)
    if (wire === undefined) return { accepted: false }
    const controller = new AbortController()
    aborts.set(wire.id, controller)
    void pumpOne(sender, wire, controller.signal, fetch).finally(() => { aborts.delete(wire.id) })
    return { accepted: true }
  })
  ipc.handle(DSH_FETCH_ABORT, raw => {
    const id = (raw as { id?: unknown } | undefined)?.id
    if (typeof id === 'string') aborts.get(id)?.abort()
    return { accepted: true }
  })
  return {
    dispose() {
      for (const controller of aborts.values()) controller.abort()
      aborts.clear()
      ipc.removeHandler(DSH_FETCH_REQUEST)
      ipc.removeHandler(DSH_FETCH_ABORT)
    },
  }
}

async function pumpOne(
  sender: IpcSender,
  wire: DesktopFetchWireRequest,
  signal: AbortSignal,
  fetch: (request: Request) => Promise<Response>,
): Promise<void> {
  try {
    // Fake authority → loopback literal: the privileged-method fence pins to
    // loopback, and IPC is loopback-equivalent by construction (a private
    // channel into this very process).
    const url = new URL(wire.url)
    url.protocol = 'http:'
    url.host = '127.0.0.1'
    const request = new Request(url, {
      method: wire.method,
      headers: wire.headers,
      ...wire.body === null ? {} : { body: wire.body },
      signal,
    })
    const response = await fetch(request)
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    sender.send(DSH_FETCH_RESPONSE, { id: wire.id, status: response.status, headers })
    if (response.body === null) {
      sender.send(DSH_FETCH_END, { id: wire.id })
      return
    }
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value !== undefined && value.byteLength > 0) sender.send(DSH_FETCH_CHUNK, { id: wire.id, data: value })
    }
    sender.send(DSH_FETCH_END, { id: wire.id })
  } catch (error) {
    sender.send(DSH_FETCH_ERROR, { id: wire.id, message: error instanceof Error ? error.message : String(error) })
  }
}
```

测试 `apps/desktop/tests/fetch-pump.spec.ts`（fake ipc + fake sender + 注入式 fetch）：断言 URL 重写为 `http://127.0.0.1`、response→chunk→end 顺序、`dsh-fetch/abort` 触发 controller.abort、dispose 中止在途请求并移除 handler、坏载荷返回 `{accepted:false}`。

- [x] **Step 10.4: protocol.ts**

```typescript
// apps/desktop/src/protocol.ts
/** dsh:// scheme: desktop frontend + plugin client bundles + boot manifest injection. */

import { readFileSync } from 'node:fs'
import { net, protocol } from 'electron'
import { injectBootManifest } from '@deepseek-ai/dsh-client-modules'
import type { DesktopRuntime } from '@deepseek-ai/dsh-desktop-app'

const CSP = 'default-src \'self\'; script-src \'self\'; connect-src \'self\''

/** Register before app ready (standard + secure + fetchable). */
export function registerDshScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'dsh',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  }])
}

/**
 * Mount the dsh:// handler over the settled runtime.
 * @param runtime - desktopRuntime face.
 */
export function mountDshProtocol(runtime: DesktopRuntime): void {
  protocol.handle('dsh', request => {
    const path = decodeURIComponent(new URL(request.url).pathname)
    if (path === '/' || path === '/index.html') {
      const html = readFileSync(runtime.frontendIndex(), 'utf8')
      return new Response(injectBootManifest(html, runtime.graph()), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP },
      })
    }
    const pluginsPrefix = '/plugins/'
    if (path.startsWith(pluginsPrefix) && path.endsWith('/client.js')) {
      const id = path.slice(pluginsPrefix.length, -'/client.js'.length)
      const clientPath = runtime.clientPath(id)
      if (clientPath === undefined) return new Response('not found', { status: 404 })
      return net.fetch(`file://${clientPath}`)
    }
    // Static frontend asset: resolved against the frontend index's directory.
    const dir = runtime.frontendIndex().slice(0, runtime.frontendIndex().lastIndexOf('/'))
    return net.fetch(`file://${dir}${path}`)
  })
}
```

实现注意：`injectBootManifest` 从 `@deepseek-ai/dsh-client-modules` 包根导出（既有）。`net.fetch(file://…)` 直接可用。

- [x] **Step 10.5: window.ts + splash.html**

```typescript
// apps/desktop/src/window.ts
/** Main window: sandboxed renderer, splash-then-ready gate. */

import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

export function createMainWindow(resourcesDir: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#1e1e1e',
    title: 'DeepSeek Harness',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void window.loadFile(join(resourcesDir, 'splash.html'))
  window.once('ready-to-show', () => { window.show() })
  // External links leave the shell; dsh:// stays inside.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('dsh://')) return { action: 'deny' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  return window
}
```

`src/splash.html`：纯本地静态页（居中 spinner + 「DeepSeek Harness 启动中…」），无远程资源。

- [x] **Step 10.6: main.ts**

```typescript
// apps/desktop/src/main.ts
/** Desktop shell entry: single instance, host boot, window gate, IPC pump, lifecycle. */

import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DesktopHostHandle } from '@deepseek-ai/dsh-desktop-app/host-boot'
import type { IpcInvokeRegistrar } from './host-glue/fetch-pump.ts'
import { registerDshScheme, mountDshProtocol } from './protocol.ts'
import { createMainWindow } from './window.ts'
import { mountFetchPump } from './host-glue/fetch-pump.ts'

const state: { window?: Electron.BrowserWindow; host?: DesktopHostHandle; quitting: boolean; pump?: { dispose(): void } } = {}

function ipcFace(): IpcInvokeRegistrar {
  return {
    handle: (channel, listener) => { ipcMain.handle(channel, (_event, raw) => listener(raw)) },
    removeHandler: channel => { ipcMain.removeHandler(channel) },
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { state.window?.focus() })
  registerDshScheme()
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => {
    if (state.window === undefined && state.host !== undefined) void loadReady()
  })
  void app.whenReady().then(main).catch(fatal)
}

async function main(): Promise<void> {
  const resourcesDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  // Host boot lives in the packaged closure (dev resolves the workspace lib).
  const hostBootPath = app.isPackaged
    ? join(process.resourcesPath, 'host', 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
    : join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh-desktop-app', 'lib', 'host-boot.js')
  const { bootDesktopHost } = await import(pathToFileURL(hostBootPath).href) as typeof import('@deepseek-ai/dsh-desktop-app/host-boot')
  state.window = createMainWindow(resourcesDir)
  try {
    state.host = await bootDesktopHost({
      frontendIndexPath: join(resourcesDir, 'frontend', 'index.html'),
      requestExit: code => { app.exit(code) },
    })
  } catch (error) {
    await showError(state.window, error)
    app.exit(1)
    return
  }
  // GUI fail-loud: late unhandled rejections surface, then exit non-zero.
  process.on('unhandledRejection', reason => {
    dialog.showErrorBox('DeepSeek Harness', `Unexpected failure:\n${String(reason)}`)
    app.exit(1)
  })
  mountDshProtocol(state.host.runtime)
  state.pump = mountFetchPump(ipcFace(), state.window.webContents, state.host.runtime.fetch)
  app.on('before-quit', event => {
    if (state.quitting || state.host === undefined) return
    state.quitting = true
    event.preventDefault()
    const host = state.host
    void Promise.race([host.dispose(), new Promise(resolve => { setTimeout(resolve, 5000) })])
      .then(() => { app.quit() })
  })
  await loadReady()
}

async function loadReady(): Promise<void> {
  const window = state.window ?? createMainWindow(join(app.getAppPath(), 'resources'))
  state.window = window
  state.pump?.dispose()
  state.pump = mountFetchPump(ipcFace(), window.webContents, state.host!.runtime.fetch)
  await window.loadURL('dsh://app/')
}

async function showError(window: Electron.BrowserWindow, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.message}\n\n${String(error.stack ?? '')}` : String(error)
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;background:#1e1e1e;color:#eee;padding:40px">`
    + `<h1>启动失败 / Startup failure</h1><pre>${message.replaceAll('<', '&lt;')}</pre>`
    + `<p>日志 / Logs: ~/.dsh/logs/</p></body>`,
  ))
}

function fatal(error: unknown): void {
  dialog.showErrorBox('DeepSeek Harness', error instanceof Error ? error.stack ?? error.message : String(error))
  app.exit(1)
}
```

实现注意：**所有 Electron API 签名以当版 Electron（38.x）类型为准**，实现时先跑 `pnpm --filter @deepseek-ai/dsh-desktop exec electron --version`，并对 `protocol.handle` 返回 `Response` 的支持做一次冒烟（38 支持；否则改 callback 形态）。

- [x] **Step 10.7: electron-builder.yml**

```yaml
appId: ai.deepseek.harness
productName: DeepSeek Harness
directories:
  output: dist
files:
  - out/main.js
  - out/main.js.map
  - out/preload.cjs
  - package.json
extraResources:
  - from: resources
    to: .
    filter:
      - "**/*"
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg
    - target: zip
  artifactName: DeepSeek-Harness-${version}-mac-${arch}.${ext}
win:
  target:
    - nsis
    - zip
  artifactName: DeepSeek-Harness-${version}-win-x64.${ext}
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [x] **Step 10.8: 运行 fetch-pump 测试**

Run: `pnpm exec vitest run apps/desktop/tests/fetch-pump.spec.ts`
Expected: PASS（若根 vitest include 未覆盖 apps/desktop，在 vitest 配置 include 增加 `apps/desktop/tests/**/*.spec.ts`——先 Read 配置再改）。

- [x] **Step 10.9: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): Electron shell (window, dsh:// protocol, IPC fetch pump)"
```

---

### Task 11: 前端桌面构建 + 打包脚本 + 根脚本

**Files:**
- Modify: `apps/web/vite.config.ts`、`apps/web/package.json`
- Create: `scripts/pack-desktop.ts`
- Modify: 根 `package.json`

- [x] **Step 11.1: vite desktop 模式**

Read `apps/web/vite.config.ts`，把配置包进 `defineConfig(({ mode }) => ({ base: mode === 'desktop' ? './' : '/', /* 既有配置 */ }))`（按该文件既有结构融合）。`apps/web/package.json` scripts 增加：

```json
"build:desktop": "vite build --mode desktop"
```

- [x] **Step 11.2: scripts/pack-desktop.ts**

```typescript
/** Pack the desktop app: host closure deploy → frontend dist → shell build → node-pty rebuild → electron-builder. */

import { cpSync, emptyDirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repo = resolve(import.meta.dirname, '..')
const appDir = join(repo, 'apps', 'desktop')
const resources = join(appDir, 'resources')
const prepareOnly = process.argv.includes('--prepare-only')

function run(command: string, args: string[], cwd = repo, env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
  if (result.status !== 0) throw new Error(`pack-desktop: ${command} ${args.join(' ')} failed (${String(result.status)})`)
}

// 1. host closure: deploy the desktop bundle's full runtime closure into resources/host.
mkdirSync(join(resources, 'host'), { recursive: true })
emptyDirSync(join(resources, 'host'))
run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop-app', 'deploy', '--legacy', '--prod', '--hoisted', join(resources, 'host')])

// 2. frontend dist: desktop-mode web build → resources/frontend.
run('pnpm', ['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build:desktop'])
mkdirSync(join(resources, 'frontend'), { recursive: true })
emptyDirSync(join(resources, 'frontend'))
cpSync(join(repo, 'apps', 'web', 'dist'), join(resources, 'frontend'), { recursive: true })

// 3. shell bundles.
run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'build:shell'])

if (prepareOnly) return

// 4. native rebuild: node-pty against the Electron ABI (mac -spawn-helper sibling ships with the package).
run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-rebuild', '-f', '--only', 'node-pty', '--module-dir', join(resources, 'host')])

// 5. electron-builder (never publish from local).
const arch = process.env.DSH_DESKTOP_ARCH ?? process.arch
run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-builder', '--publish', 'never', `--${arch}`], appDir, {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
})
```

实现注意：`deploy` 目标位置参数形态按仓库既有先例核对（Grep `deploy --legacy` in scripts/；设计文档注明 pkg --sea 是同款先例）。

- [x] **Step 11.3: 根 package.json scripts**

```json
"dev:desktop": "pnpm run build && tsx scripts/pack-desktop.ts --prepare-only && pnpm --filter @deepseek-ai/dsh-desktop run start",
"pack:desktop": "pnpm run build && tsx scripts/pack-desktop.ts"
```

- [x] **Step 11.4: 本地全流程验证（mac 本机 arch）**

```bash
pnpm run pack:desktop
```

Expected: `apps/desktop/dist/DeepSeek-Harness-0.1.0-rc.5-mac-arm64.dmg` 生成；安装启动：先 splash，随后 `dsh://app/` 加载出与 web 相同的界面；`~/.dsh/profiles/desktop` 出现；配置 DEEPSEEK_API_KEY 后可发起会话。失败按 loud error 页/日志修复后重跑。

- [x] **Step 11.5: Commit**

```bash
git add apps/web scripts/pack-desktop.ts package.json
git commit -m "feat(desktop): desktop web build mode and local pack pipeline"
```

---

### Task 12: CI 工件

**Files:**
- Create: `.github/workflows/build-desktop.yml`

- [x] **Step 12.1: workflow**

```yaml
name: build-desktop

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - "apps/desktop/**"
      - "packages/bundle/desktop-app/**"
      - "packages/client/connection/**"
      - "packages/client/modules/**"
      - "packages/boot/app-boot/**"
      - "apps/web/vite.config.ts"
      - "scripts/pack-desktop.ts"
      - ".github/workflows/build-desktop.yml"
  workflow_dispatch:

jobs:
  build:
    name: ${{ matrix.os }}-${{ matrix.arch }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: macos-latest, arch: arm64 }
          - { os: macos-latest, arch: x64 }
          - { os: windows-latest, arch: x64 }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: package.json
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run pack:desktop
        env:
          DSH_DESKTOP_ARCH: ${{ matrix.arch }}
          CSC_IDENTITY_AUTO_DISCOVERY: "false"
      - uses: actions/upload-artifact@v4
        with:
          name: DeepSeek-Harness-${{ matrix.os }}-${{ matrix.arch }}
          path: |
            apps/desktop/dist/*.dmg
            apps/desktop/dist/*.zip
            apps/desktop/dist/*.exe
          if-no-files-found: error
```

- [x] **Step 12.2: 提交并观察一次 CI**

```bash
git add .github/workflows/build-desktop.yml
git commit -m "ci(desktop): unsigned desktop artifacts for mac (arm64/x64) and win x64"
git push
```

Expected: 三个矩阵腿全绿，工件可下载。Windows `node-pty` 重建失败时按设计文档风险 3 处理（上报并与用户确认降级方案，不擅自砍终端面板）。

---

### Task 13: 桌面启动 snapshot（keyless）

**Files:**
- Create: `packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts`
- Modify: `vitest.snapshot.config.ts`（include 增加 `packages/bundle/desktop-app/tests/**/*.snapshot.ts`——先 Read 该配置对照既有 include 形态）

- [x] **Step 13.1: snapshot 测试**

真实可运行：desktop profile 树装配 → manifest 组合 → 经 **DesktopApiClient（真实 wire）** 的一次 `host.describe` + `session.list` 往返（桥的 `request` 直连 `runtime.fetch`，即 Task 9 句柄 + Task 2 客户端的组合）：

```typescript
// packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts
/** Keyless desktop boot snapshot: profile tree → manifest → IPC-wire round trip. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { bootDesktopHost } from '../src/host-boot.ts'
import { DesktopApiClient } from '@deepseek-ai/dsh-client-connection/client/desktop-api-client'
import type {
  DesktopFetchBridge, DesktopFetchWireChunk, DesktopFetchWireEnd,
  DesktopFetchWireError, DesktopFetchWireRequest, DesktopFetchWireResponse,
} from '@deepseek-ai/dsh-client-connection/client/desktop-bridge'

const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-snap-'))
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

/** In-memory bridge: request() walks the real wire encode → runtime.fetch → wire decode. */
function bridgeOver(fetch: (request: Request) => Promise<Response>): DesktopFetchBridge {
  const channels = {
    response: new Set<(m: DesktopFetchWireResponse) => void>(),
    chunk: new Set<(m: DesktopFetchWireChunk) => void>(),
    end: new Set<(m: DesktopFetchWireEnd) => void>(),
    error: new Set<(m: DesktopFetchWireError) => void>(),
  }
  return {
    async request(wire: DesktopFetchWireRequest) {
      const url = new URL(wire.url)
      url.protocol = 'http:'
      url.host = '127.0.0.1'
      const response = await fetch(new Request(url, {
        method: wire.method, headers: wire.headers, ...wire.body === null ? {} : { body: wire.body },
      }))
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      for (const l of channels.response) l({ id: wire.id, status: response.status, headers })
      if (response.body !== null) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value !== undefined && value.byteLength > 0) for (const l of channels.chunk) l({ id: wire.id, data: value })
        }
      }
      for (const l of channels.end) l({ id: wire.id })
    },
    abort: () => {},
    onResponse: l => { channels.response.add(l); return () => { channels.response.delete(l) } },
    onChunk: l => { channels.chunk.add(l); return () => { channels.chunk.delete(l) } },
    onEnd: l => { channels.end.add(l); return () => { channels.end.delete(l) } },
    onError: l => { channels.error.add(l); return () => { channels.error.delete(l) } },
  }
}

describe('desktop boot snapshot', () => {
  it('boots and answers host.describe + session.list over the IPC wire', { timeout: 120_000 }, async () => {
    const handle = await bootDesktopHost({ home, frontendIndexPath: '/tmp/index.html' })
    const client = new DesktopApiClient(bridgeOver(handle.runtime.fetch))
    const described = await client.host.describe({})
    expect(described.result.ok).toBe(true)
    const listed = await client.sessions.list({})
    expect(listed.result.ok).toBe(true)
    const ids = handle.runtime.graph().entries.map(e => e.id)
    expect(ids).toContain('@deepseek-ai/dsh-client-connection')
    expect(ids).toContain('@deepseek-ai/dsh-client-runtime')
    client.dispose()
    await handle.dispose()
  })
})
```

实现注意：`session.list`/`host.describe` 空 payload 的真实形状以 `packages/host/apiproxy/src/api/*.schema.ts` 为准；测试前先 `pnpm run build:lib`。

- [x] **Step 13.2: 运行**

```bash
pnpm run build:lib
pnpm exec vitest run --config vitest.snapshot.config.ts packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts
```

Expected: PASS。

- [x] **Step 13.3: Commit**

```bash
git add packages/bundle/desktop-app/tests/desktop-boot.snapshot.ts vitest.snapshot.config.ts
git commit -m "test(desktop): keyless desktop boot snapshot over the IPC wire"
```

---

### Task 14: 文档与仓库 gates

**Files:**
- Create: `packages/bundle/desktop-app/README.md`、`README.zh.md`、`README.i18n.yaml`（对照 web-app 三件结构逐段写：包定位、行说明（desktop-runtime/connection/无 webserver）、host-boot 导出、配置面）
- Create: `apps/desktop/README.md`（开发流 `pnpm run dev:desktop` / 出包 `pnpm run pack:desktop`；**未签名说明**：macOS Gatekeeper 右键打开；Windows SmartScreen「更多信息 → 仍要运行」；体积预期 250–350MB；签名/公证/自动更新为后续 PR）
- Create: `docs/subsystems/desktop-app.md` + 对应中文版（对照 `docs/subsystems/` 既有 web-app 子系统文档骨架：职责、组成、协议、测试）
- Modify: website 投影与 module-graph——先 Grep `web-app` 在 `website/` 与 module-graph 配置中的出现位置，逐处并列追加 desktop-app 条目
- Create: `.agents/notes/implemented/architecture/2026-08-15-desktop-carrier-layering.md`（Agent Note：GUI 分层 note 预留座位 + IPC fetch 子类落位；引用设计文档）
- Modify: knip 配置如报未用导出（`host-boot`/`invariant` 的消费者在 apps/desktop——确认 knip 扫描范围覆盖 apps/*，否则为这两个入口登记 project）

- [x] **Step 14.1:** 按上述清单写全部文档（中英双语齐全，README.i18n.yaml 键对照 web-app）。
- [x] **Step 14.2: 全量 gates**

```bash
pnpm run build
pnpm run test
pnpm run check:all
```

Expected: 全绿（`verify-export-jsdoc`/`hygiene`(knip)/`doc-sync` 均过）。任何 gate 失败按报错修到绿为止。

- [x] **Step 14.3: Commit**

```bash
git add .
git commit -m "docs(desktop): subsystem docs, READMEs, website projection, agent note"
```

---

## 验收清单（对照设计文档）

1. `pnpm run pack:desktop` 在 mac 出 dmg+zip（arm64 与 x64 各一）。
2. CI 三矩阵腿出工件；Windows exe 可安装启动。
3. 安装包零配置首启：onboarding 引导 `DEEPSEEK_API_KEY`，写入 `~/.dsh/.credentials.yaml` 热生效。
4. 桌面会话与 CLI/web 共享 `~/.dsh`（同 profile 数据面）。
5. 事件流（mux/host）经 IPC SSE 正常驱动 UI（会话流、审批、终端输出）。
6. `host.pickDirectory` 原生对话框可用（caller-signal-only 超时策略在桌面同样成立）。
7. 中止行为：取消一个运行中的 prompt，渲染端 AbortSignal → IPC abort → host 流断。
8. 全部 gates 绿。

## 风险与回退

- **Electron 内嵌 Node < 22.19**：锁定 Electron 38 线；desktop snapshot 显式走 `node:sqlite` 路径（session-query-sqlite 行保持 `openAt: never`，首搜索才开）。
- **Windows node-pty ABI 重建失败**：上报并按设计文档风险 3 与用户确认（兜底 = 首版 Windows 暂无终端面板），不擅自降级。
- **dsh:// 相对路径解析**：若 Vite `base './'` 产物在 standard scheme 下仍有绝对路径残留，改为构建后处理（scripts 内对 dist HTML 做一次 rewrite），协议处理器不变。

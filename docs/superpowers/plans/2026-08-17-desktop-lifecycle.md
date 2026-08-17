# Desktop Lifecycle and Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the clean-checkout desktop build regressions and add close-to-tray, single-window restoration, exact navigation policy, and bounded orderly shutdown to the existing Electron carrier.

**Architecture:** Keep the current `dsh://` protocol and IPC fetch carrier. Move exit coordination, native window behavior, and tray ownership into small injectable modules; `main.ts` remains the composition root and routes every exit source through one shutdown controller.

**Tech Stack:** TypeScript, Electron 38, esbuild, Vitest, Cordis Host boot, pnpm workspaces.

---

## File map

```text
tsconfig.base.json                                  source-plane export mapping
apps/desktop/package.json                          symmetric Electron externals
apps/desktop/src/lifecycle.ts                      bounded shutdown + listener installation
apps/desktop/src/window.ts                         BrowserWindow creation, hide/show, navigation policy
apps/desktop/src/tray.ts                           native image, two-command menu, double-click restore
apps/desktop/src/main.ts                           native composition and cleanup ordering
apps/desktop/tests/build-contract.spec.ts          clean-checkout and bundle-command regression
apps/desktop/tests/lifecycle.spec.ts               shutdown state and process listeners
apps/desktop/tests/window.spec.ts                  close, restoration, and navigation behavior
apps/desktop/tests/tray.spec.ts                    tray commands and disposal
apps/desktop/tests/lifecycle.snapshot.ts           keyless user-visible lifecycle trace
vitest.snapshot.config.ts                          desktop application snapshot inventory
apps/desktop/README.md / README.zh.md               user and developer lifecycle behavior
docs/subsystems/desktop-app.md / .zh.md             subsystem lifecycle reference
.agents/notes/implemented/feature/...               decision, alternatives, consequences
```

### Task 1: Repair clean-checkout desktop build contracts

**Files:**
- Create: `apps/desktop/tests/build-contract.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `apps/desktop/package.json`
- Regenerate: `apps/desktop/out/main.js`, `apps/desktop/out/main.js.map`, `apps/desktop/out/preload.cjs`, `apps/desktop/out/preload.cjs.map`

- [ ] **Step 1: Write the failing build-contract tests**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const rootConfig = JSON.parse(readFileSync(new URL('../../../tsconfig.base.json', import.meta.url), 'utf8')) as {
  compilerOptions: { paths: Record<string, string[]> }
}
const desktopPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: { 'build:shell': string }
}

describe('desktop build contracts', () => {
  it('resolves the pure desktop bridge from source', () => {
    expect(rootConfig.compilerOptions.paths['@deepseek-ai/dsh-client-connection/desktop-bridge']).toEqual([
      './packages/client/connection/src/client/desktop-bridge.ts',
    ])
  })

  it('keeps Electron external to both shell bundles', () => {
    expect(desktopPackage.scripts['build:shell'].match(/--external:electron/g)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the tests and verify both new assertions fail**

Run: `pnpm exec vitest run apps/desktop/tests/build-contract.spec.ts apps/desktop/tests/fetch-pump.spec.ts`

Expected: the path mapping is absent and `build:shell` contains one `--external:electron`; the existing fetch-pump test remains green because the baseline build artifacts are present.

- [ ] **Step 3: Add the source mapping and symmetric preload external**

Add beside the existing connection paths in `tsconfig.base.json`:

```json
"@deepseek-ai/dsh-client-connection/desktop-bridge": ["./packages/client/connection/src/client/desktop-bridge.ts"]
```

Change the desktop script to:

```json
"build:shell": "esbuild src/main.ts --bundle --platform=node --format=cjs --outfile=out/main.js --external:electron --sourcemap && esbuild preload.ts --bundle --platform=node --format=cjs --outfile=out/preload.cjs --external:electron --sourcemap"
```

- [ ] **Step 4: Verify source-plane tests and built preload behavior**

Run:

```sh
pnpm exec vitest run apps/desktop/tests/build-contract.spec.ts apps/desktop/tests/fetch-pump.spec.ts
pnpm --filter @deepseek-ai/dsh-desktop run build:shell
node -e "const fs=require('node:fs');const s=fs.readFileSync('apps/desktop/out/preload.cjs','utf8');if(!s.includes('require(\"electron\")')||s.includes('node_modules/.pnpm/electron'))process.exit(1)"
```

Expected: 6 tests pass; the build succeeds; the preload retains `require("electron")` and contains no bundled npm Electron launcher.

- [ ] **Step 5: Commit the regression repair**

```sh
git add tsconfig.base.json apps/desktop/package.json apps/desktop/tests/build-contract.spec.ts apps/desktop/out
git commit -m "fix(desktop): preserve clean source and preload Electron imports"
```

### Task 2: Add the bounded shutdown controller

**Files:**
- Create: `apps/desktop/src/lifecycle.ts`
- Create: `apps/desktop/tests/lifecycle.spec.ts`

- [ ] **Step 1: Write failing shutdown tests**

The test file imports `createDesktopShutdown` and `installShutdownRequests`. Cover these exact cases:

```ts
it('disposes once and exits with the requested code', async () => {
  const dispose = vi.fn(async () => {})
  const exit = vi.fn()
  const shutdown = createDesktopShutdown(dispose, exit)
  await shutdown.request(0)
  await shutdown.request(1)
  expect(dispose).toHaveBeenCalledOnce()
  expect(exit).toHaveBeenCalledOnce()
  expect(exit).toHaveBeenCalledWith(0)
})

it('turns a failed clean disposal into exit code 1', async () => {
  const exit = vi.fn()
  await createDesktopShutdown(async () => { throw new Error('dispose failed') }, exit).request(0)
  expect(exit).toHaveBeenCalledWith(1)
})

it('forces a wedged clean shutdown with exit code 1', async () => {
  vi.useFakeTimers()
  const exit = vi.fn()
  const pending = createDesktopShutdown(() => new Promise<void>(() => {}), exit, 25).request(0)
  await vi.advanceTimersByTimeAsync(25)
  expect(pending).toBeInstanceOf(Promise)
  expect(exit).toHaveBeenCalledWith(1)
})

it('escalates a repeated request immediately', async () => {
  let finish!: () => void
  const exit = vi.fn()
  const shutdown = createDesktopShutdown(() => new Promise<void>((resolve) => { finish = resolve }), exit)
  const first = shutdown.request(0)
  await Promise.resolve()
  void shutdown.request(130)
  expect(exit).toHaveBeenCalledWith(130)
  finish()
  await first
  expect(exit).toHaveBeenCalledOnce()
})
```

Add a listener test using in-memory `on`/`off` maps. Trigger `SIGINT`, `SIGTERM`, and `before-quit`; expect request codes `[130, 0, 0]`, `preventDefault()` once, and empty maps after the returned disposer runs.

- [ ] **Step 2: Run the lifecycle suite and verify the missing exports fail**

Run: `pnpm exec vitest run apps/desktop/tests/lifecycle.spec.ts`

Expected: FAIL because `../src/lifecycle.ts` does not exist.

- [ ] **Step 3: Implement the minimal lifecycle module**

Implement these public contracts with concise JSDoc:

```ts
export const DESKTOP_SHUTDOWN_TIMEOUT_MS = 5_000

export interface DesktopShutdown {
  request(code: number): Promise<void>
  isPending(): boolean
}

export function createDesktopShutdown(
  dispose: () => Promise<void>,
  exit: (code: number) => void,
  timeoutMs = DESKTOP_SHUTDOWN_TIMEOUT_MS,
): DesktopShutdown

export function installShutdownRequests(
  signals: DesktopSignalSource,
  nativeApp: DesktopQuitSource,
  requestQuit: (code: number) => void,
): () => void
```

Use one `pending` promise, one timeout, and an `exitOnce()` guard. A clean requested code becomes `1` on timeout or rejection; a nonzero requested code stays nonzero. A second request calls `exitOnce(code)` without waiting.

- [ ] **Step 4: Run the suite to green**

Run: `pnpm exec vitest run apps/desktop/tests/lifecycle.spec.ts`

Expected: 5 tests pass with no warnings.

- [ ] **Step 5: Commit the controller**

```sh
git add apps/desktop/src/lifecycle.ts apps/desktop/tests/lifecycle.spec.ts
git commit -m "feat(desktop): add bounded orderly shutdown"
```

### Task 3: Make the BrowserWindow hide, restore, and reject unsafe navigation

**Files:**
- Modify: `apps/desktop/src/window.ts`
- Create: `apps/desktop/tests/window.spec.ts`

- [ ] **Step 1: Write failing pure behavior tests**

Test exported `showDesktopWindow`, `handleDesktopWindowClose`, `isDesktopNavigation`, and `handleDesktopWindowOpen` with small fakes:

```ts
it('restores, shows, and focuses a minimized window', () => {
  const window = fakeWindow({ minimized: true })
  showDesktopWindow(window)
  expect(window.trace).toEqual(['restore', 'show', 'focus'])
})

it('hides a close request until final exit starts', () => {
  const event = { preventDefault: vi.fn() }
  const window = fakeWindow()
  handleDesktopWindowClose(window, event, false)
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(window.trace).toEqual(['hide'])
  handleDesktopWindowClose(window, { preventDefault: vi.fn() }, true)
  expect(window.trace).toEqual(['hide'])
})

it.each([
  ['dsh://app/', true],
  ['dsh://app/settings', true],
  ['dsh://evil/', false],
  ['https://example.com/', false],
  ['not a url', false],
])('classifies navigation %s', (url, expected) => {
  expect(isDesktopNavigation(url)).toBe(expected)
})
```

For `handleDesktopWindowOpen`, assert that HTTP, HTTPS, and `mailto:` call the injected async opener and return `{ action: 'deny' }`; `file:`, `javascript:`, and malformed URLs do not call it. Reject the opener promise and assert the injected reporter receives the error instead of producing an unhandled rejection.

- [ ] **Step 2: Run the window suite and verify missing exports fail**

Run: `pnpm exec vitest run apps/desktop/tests/window.spec.ts`

Expected: FAIL because the behavior exports do not exist.

- [ ] **Step 3: Implement the behavior and wire BrowserWindow listeners**

Use these interfaces so tests do not import Electron:

```ts
export interface DesktopWindowFace {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  hide(): void
  focus(): void
}

export function showDesktopWindow(window: DesktopWindowFace): void
export function handleDesktopWindowClose(window: DesktopWindowFace, event: { preventDefault(): void }, quitting: boolean): void
export function isDesktopNavigation(raw: string): boolean
export function handleDesktopWindowOpen(
  raw: string,
  openExternal: (url: string) => Promise<void>,
  report: (error: unknown) => void,
): { action: 'deny' }
```

`isDesktopNavigation()` returns true only for `protocol === 'dsh:' && hostname === 'app'`. `createMainWindow()` accepts `isQuitting` and `reportExternalOpenError`, installs `close`, `will-frame-navigate`, and `will-redirect`, always denies new windows, and delegates only the three allowed external protocols. Return a handle containing `window`, `show()`, and an idempotent `dispose()` that removes every installed listener before destroying the window.

- [ ] **Step 4: Run window tests to green**

Run: `pnpm exec vitest run apps/desktop/tests/window.spec.ts`

Expected: all restoration, close, URL, and opener-error cases pass.

- [ ] **Step 5: Commit the window behavior**

```sh
git add apps/desktop/src/window.ts apps/desktop/tests/window.spec.ts
git commit -m "feat(desktop): hide and safely restore the main window"
```

### Task 4: Add the minimal native tray

**Files:**
- Create: `apps/desktop/src/tray.ts`
- Create: `apps/desktop/tests/tray.spec.ts`

- [ ] **Step 1: Write failing tray tests against injected native adapters**

Define a fake `Tray` that records tooltip, menu, listeners, and destruction. Assert:

```ts
expect(menuTemplate.map(item => item.label ?? item.type)).toEqual([
  'Show DeepSeek Harness',
  'separator',
  'Quit',
])
```

Invoke the show item and the stored `double-click` listener and expect the same `show` callback twice. Invoke quit and expect `requestQuit(0)`. Call the returned disposer twice and expect listener removal and `destroy()` once. Return an empty fake image and expect tray creation to throw `desktop tray icon is empty`.

- [ ] **Step 2: Run the tray suite and verify the missing module fails**

Run: `pnpm exec vitest run apps/desktop/tests/tray.spec.ts`

Expected: FAIL because `../src/tray.ts` does not exist.

- [ ] **Step 3: Implement the tray with a data-URL fish mark**

Export an injected constructor for tests and an Electron adapter for production:

```ts
export interface DesktopTrayHandle { dispose(): void }

export function createDesktopTray(
  native: DesktopTrayNative,
  platform: NodeJS.Platform,
  show: () => void,
  requestQuit: (code: number) => void,
): DesktopTrayHandle
```

Store two 32×32 PNG data URLs derived from `apps/web/public/favicon.svg`: a black alpha template for macOS and `#2563eb` for other platforms. Use these exact payloads:

```ts
const TEMPLATE_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAACWUlEQVRYhe2WTYiOURTHf2aYD2SkqclqfCxI+YoaseC1GGJnDAslUxZY2JBioaRZsDArkZ1pWOhNpiZEahYijK9iZjOrSTGmhhjSGEa3/q+O233mPo/Xu/L+69TznHu+7rn3nHugjDJKg3lA7l8anAvU6nsOsA/oBgaBx8AsT/4I0F+Mw2XABRn5AUyKRoBv5t9RU0D/utYuAw0JPppCWaoCOoCfnpOpaG3A+C2z/hFYJ/4CYAtwAvgCnLZKlUBPBscFGga2egGc92QeAFcDuq1W6cxfOC/Qd6DN2NqUQucDMLOgsAQYLyKASR3bYRPElYj8Xrv7ziKd2yAOmPvUFZBxd2KPdT4dGNXiENAHvCsyiFOyu9PwnwAtwGz/xq6WQK/HXwgcAl5FHE4AD1Wilv9amyn8u4sZxDYJ3E8SAHYDbxMC6FeZuQZ1Y4pAjycZ3yUBl/ZYe+0NGP6sO7QDqAFeJATgl+pv5IzQ4kgQ1Qm7/ATsl8yaQCMbV4aCWGQEjxKH6/vPAkE8BeYrU2+8tXsxo0PmPCtSBNGocgpVwESA/0fZhXDJCLs7kQZtKcvSvZgzYsaWm3Nz6atLGUR3ip7gHp9UyBvFm2okfpAngXrDqw+ct6VzZECD1wHzZghxWCX+e2C74W/Q0+o7vxPYRBQ54Ksx8hxYadYfmdR2qCxRmv1BxfWMZmBa1iA2A2PeObqx67aeXevkpTppjfSGA5kYUGlmwlKvj6chN7qdVS/JK1t3gXYNO5lRBRxUGcWcu3dkIyVCJbAeOKYh85roogaQFaVyXMb/gV/dRWbOp9K5uAAAAABJRU5ErkJggg=='
const BLUE_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAADSUlEQVRYhe1WXYhMcRS/rG9Cm9q21Fpz/jOasogiHlgPiDcMD2Tdc8aE4oUUDzbJAw88ibwRHiRRQqQ8iKzv8lHaUqKde860Nl/Jx16dOx935s7dmdlln+ypf839z/+c8/ufc37n/C1rSIZkECROPfURlNZ/ZrCp7ePkqYl3Y/U3bMhMNOhsNsRXDEonIHe0bOwaX3zekOwC5FcDdgh2Jm6IT6gRg/zbkLi6AEUMyvf8t7fszPwyfeJL3nni082UbgjzoXplUYon3FGG5Jgh7i1xUmHFUOaVGUe5XjiD3APJzALdj7V1TYskneUGeZ9B+QokB32thFsHJFdrdew7ECdCzorSFPDx0nN8D1DOB3WBOFGEmg/323khNfwTyLHztiIkS6rr8cfG1IdxnkIMJQbIPwYKIGew1xDvLLrQuYrn7cym4pCd+TvnPghA2erXE58tTxn3AMqGgvPF7e4Ig9ydM/DOoDwyKOm/igTKAbULSWdtUb4fAjpr4tudCaWUQZ6TO3SneD+a7GoGlO0G+UUVh78M8n2PoqX7L73L+N/Hw+hoGeKV2UKSu6EHFAzxekPS1UcBvlKaZRsUX+4baGZvqPGIzetydEr3BcDLKfXUa5TKAcjnbA1lVje1vR0DJM/CAASp6gNAaS0YSzmRSiBgx5vRYbcE4k9R4qRnLylzg41MGaYRCk+BnZ7uV6jstqqI9n1D8iTklo9npLhRIwXE7wMAblc0arT6c/m02t3h1UBMw+4mpVMfveBXSJp82oUJkJwq5MrmddUAZHUcuyZaonTOTbkjKxqLbU7PzOdNwzc91T2pFhDeSK7SE3T41GLLMiQX/aKSa9pIgiCBeH809WFKfk9/B/MduP1Rq1ZppnRDoANezD9CPIBJZ3Zunw3yqgIIchbpaA1puTeDl6gqkSwlvxUVz1NjO7Py/wPyA7/Y5JjS0tPzZnzgoUJyBzCzzLLcYf0CEU3KUiD5UjpguMOg3NCxG6ju59pJtQGpnr4NQjrla6Vm/0CkZEZpH6+l2vk3EB/RXqLp02gB8S0gOaSPHau/Ek+4o4Bkm9KomnOdI2DzYmtQJOHWRbY4C4Fkjz4yDckFXYB8Uh8gUUq3DI7jIflf5A8E1QULjH3uGwAAAABJRU5ErkJggg=='
```

Create the image with `nativeImage.createFromDataURL`; call `setTemplateImage(true)` on macOS; resize to 18×18 on macOS and 20×20 elsewhere. Fail loud on an empty image. Build exactly the approved two-command menu and attach only `double-click`.

- [ ] **Step 4: Run the tray suite to green**

Run: `pnpm exec vitest run apps/desktop/tests/tray.spec.ts`

Expected: menu, double-click, quit, empty-image, and idempotent-disposal cases pass.

- [ ] **Step 5: Commit the tray**

```sh
git add apps/desktop/src/tray.ts apps/desktop/tests/tray.spec.ts
git commit -m "feat(desktop): add minimal native tray"
```

### Task 5: Compose one native lifecycle in the Electron entry

**Files:**
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/tests/lifecycle.spec.ts`
- Modify: `apps/desktop/tests/window.spec.ts`

- [ ] **Step 1: Add failing integration assertions to the component suites**

Add a failing test for a new `disposeDesktopShell` helper and an assertion that a close handler observes the shutdown controller's live `isPending()` state. The helper test pins the order required by `main.ts`:

```ts
const trace: string[] = []
const shutdown = createDesktopShutdown(
  () => disposeDesktopShell({
    pump: { dispose: () => { trace.push('pump.dispose') } },
    host: { dispose: async () => { trace.push('host.dispose'); throw new Error('host failure') } },
    native: { dispose: () => { trace.push('native.dispose') } },
  }),
  code => { trace.push(`app.exit:${code}`) },
)
await shutdown.request(0)
expect(trace).toEqual(['pump.dispose', 'host.dispose', 'native.dispose', 'app.exit:1'])
```

- [ ] **Step 2: Run the focused suites and verify the new ordering assertion fails before wiring**

Run: `pnpm exec vitest run apps/desktop/tests/lifecycle.spec.ts apps/desktop/tests/window.spec.ts`

Expected: FAIL because `disposeDesktopShell` is not exported; the close-state assertion also fails until the close handler receives the live shutdown state.

- [ ] **Step 3: Refactor `main.ts` into the approved composition**

Make these exact changes:

- acquire the single-instance lock before installing the application lifecycle;
- create `DesktopShutdown` before `app.whenReady()` and route `before-quit`, `SIGINT`, `SIGTERM`, Host `requestExit`, fatal errors, and tray quit through `request()`;
- after ready, create the splash window and tray before Host boot;
- make `second-instance` and `activate` call the window handle's `show()`;
- on Host success, mount the protocol, mount one IPC pump, and load `dsh://app/` without remounting the pump;
- remove `window-all-closed` process exit behavior;
- cleanup in `pump → Host → native` order, using `finally` for native cleanup;
- show a native startup error dialog, write the stack to stderr, and request code `1` on boot failure;
- install the unhandled-rejection handler once and route it through the same failure path.

The shell state contains only optional `window`, `tray`, `host`, and `pump` handles. It does not use non-null assertions. Capture Electron methods in arrow closures so lint does not report unbound methods.

Add this helper to `lifecycle.ts` and use it as the shutdown disposer:

```ts
export async function disposeDesktopShell(resources: DesktopShellResources): Promise<void> {
  resources.pump?.dispose()
  try {
    await resources.host?.dispose()
  } finally {
    resources.native?.dispose()
  }
}
```

- [ ] **Step 4: Verify the integrated source and shell bundle**

Run:

```sh
pnpm exec vitest run apps/desktop/tests/build-contract.spec.ts apps/desktop/tests/lifecycle.spec.ts apps/desktop/tests/window.spec.ts apps/desktop/tests/tray.spec.ts apps/desktop/tests/fetch-pump.spec.ts
pnpm --filter @deepseek-ai/dsh-desktop run build:shell
```

Expected: all desktop application tests pass and both bundles build.

- [ ] **Step 5: Commit the composition**

```sh
git add apps/desktop/src/main.ts apps/desktop/src/window.ts apps/desktop/src/lifecycle.ts apps/desktop/tests apps/desktop/out
git commit -m "feat(desktop): compose close-to-tray lifecycle"
```

### Task 6: Add the keyless lifecycle snapshot

**Files:**
- Create: `apps/desktop/tests/lifecycle.snapshot.ts`
- Modify: `vitest.snapshot.config.ts`

- [ ] **Step 1: Write the failing snapshot scenario**

Use the real `showDesktopWindow`, `handleDesktopWindowClose`, and `createDesktopShutdown` with trace-recording adapters:

```ts
it('records hide, restore, and orderly quit', async () => {
  const trace: string[] = ['boot']
  const window = traceWindow(trace)
  handleDesktopWindowClose(window, { preventDefault: () => { trace.push('close.prevent') } }, false)
  showDesktopWindow(window)
  const shutdown = createDesktopShutdown(async () => {
    trace.push('pump.dispose')
    trace.push('host.dispose')
    trace.push('tray.dispose')
    trace.push('window.dispose')
  }, code => { trace.push(`app.exit:${code}`) })
  await shutdown.request(0)
  expect(trace.join('\n')).toMatchInlineSnapshot(`
    "boot
    close.prevent
    window.hide
    window.restore
    window.show
    window.focus
    pump.dispose
    host.dispose
    tray.dispose
    window.dispose
    app.exit:0"
  `)
})
```

- [ ] **Step 2: Add `apps/desktop/tests/**/*.snapshot.ts` to the snapshot config and run red**

Run: `pnpm exec vitest run --config vitest.snapshot.config.ts apps/desktop/tests/lifecycle.snapshot.ts`

Expected: FAIL until the app snapshot include and trace adapter are complete.

- [ ] **Step 3: Complete the trace adapter and run green**

The trace window returns `isDestroyed() === false`, `isMinimized() === true`, and appends the exact method names shown in the inline snapshot.

Run: `pnpm exec vitest run --config vitest.snapshot.config.ts apps/desktop/tests/lifecycle.snapshot.ts`

Expected: 1 snapshot test passes without external credentials or a display server.

- [ ] **Step 4: Commit the snapshot**

```sh
git add apps/desktop/tests/lifecycle.snapshot.ts vitest.snapshot.config.ts
git commit -m "test(desktop): snapshot the native lifecycle"
```

### Task 7: Document lifecycle ownership and the decision

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `apps/desktop/README.i18n.yaml`
- Modify: `docs/subsystems/desktop-app.md`
- Modify: `docs/subsystems/desktop-app.zh.md`
- Modify: `docs/subsystems/desktop-app.i18n.yaml`
- Create: `.agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle.md`
- Create: `.agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle.zh.md`
- Create: `.agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle.i18n.yaml`

- [ ] **Step 1: Update the README pair**

Add a `Native lifecycle` / `原生生命周期` section stating that close hides, Host work continues, the tray and second launch restore the single window, and only tray Quit or an operating-system quit disposes the Host. State the five-second deadline and that the tray contains only Show and Quit in this release.

- [ ] **Step 2: Update the subsystem pair**

Add a `Native carrier lifecycle` section after transport. Keep Electron details here rather than in the Cordis API section: ownership of window/tray/pump, restoration sources, `dsh://app` navigation rule, external-link delegation, cleanup order, timeout, and repeated-request escalation.

- [ ] **Step 3: Add the implemented Agent Note triplet**

Use the required sections:

```markdown
# Agent Note: Desktop close-to-tray lifecycle

Status: implemented

English | [中文](2026-08-17-desktop-close-to-tray-lifecycle.zh.md)

## Problem
## Decision
## Verification
## Alternatives considered
## Consequences
```

Record why lifecycle belongs in `apps/desktop`, why the Host bundle stays Electron-independent, why direct `main.ts` state and a loopback-carrier migration lost, and that target-platform tray appearance remains Windows CI/manual evidence.

- [ ] **Step 4: Re-record only the changed bilingual pairs**

Run:

```sh
pnpm run verify-translation-pairing --write apps/desktop/README.md
pnpm run verify-translation-pairing --write docs/subsystems/desktop-app.md
pnpm run verify-translation-pairing --write .agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle.md
pnpm run verify-translation-pairing apps/desktop/README.md docs/subsystems/desktop-app.md .agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle.md
```

Do not re-record unrelated root README drift.

- [ ] **Step 5: Run documentation checks and record pre-existing failures separately**

Run:

```sh
pnpm run verify-agent-note-format
pnpm run verify-md-links
pnpm run verify-md-wrap
pnpm run verify-translation-pairing
git diff --check
```

Expected: changed documents and Agent Note pass. If repository-wide translation pairing still reports the pre-existing root `README.md` / `README.zh.md` drift, report it without changing unrelated root content.

- [ ] **Step 6: Commit documentation**

```sh
git add apps/desktop/README* docs/subsystems/desktop-app* .agents/notes/implemented/feature/2026-08-17-desktop-close-to-tray-lifecycle*
git commit -m "docs(desktop): define native lifecycle ownership"
```

### Task 8: Focused verification and macOS smoke

**Files:**
- No new files unless a verification failure requires a scoped repair.

- [ ] **Step 1: Inspect the complete branch scope**

Run:

```sh
git status --short --branch
pnpm --silent run change-scope --base origin/main
git diff --check origin/main...HEAD
```

Expected: only the design, desktop lifecycle, source mapping, snapshot, docs, and Agent Note paths are present; no `vendor/` path appears.

- [ ] **Step 2: Run the focused unit and snapshot evidence**

```sh
pnpm exec vitest run \
  apps/desktop/tests/build-contract.spec.ts \
  apps/desktop/tests/fetch-pump.spec.ts \
  apps/desktop/tests/lifecycle.spec.ts \
  apps/desktop/tests/window.spec.ts \
  apps/desktop/tests/tray.spec.ts \
  packages/bundle/desktop-app/tests/desktop-app.spec.ts \
  packages/bundle/desktop-app/tests/host-boot.spec.ts \
  packages/bundle/desktop-app/tests/invariant.spec.ts
pnpm exec vitest run --config vitest.snapshot.config.ts apps/desktop/tests/lifecycle.snapshot.ts
```

Expected: all selected tests pass.

- [ ] **Step 3: Run built-path checks**

```sh
pnpm --filter @deepseek-ai/dsh-desktop run build:shell
node -e "const fs=require('node:fs');const s=fs.readFileSync('apps/desktop/out/preload.cjs','utf8');if(!s.includes('require(\"electron\")')||s.includes('node_modules/.pnpm/electron'))process.exit(1)"
pnpm run typecheck
```

Expected: shell build and preload assertion pass; typecheck passes or reports only a reproduced pre-existing failure with exact paths.

- [ ] **Step 4: Run documentation and lint evidence**

Run `pnpm run doc-sync`, `pnpm run lint`, and `git diff --check`. Separate the known base failures—stale client catalog, root README pairing, and existing lint findings—from any changed-file finding. Every changed-file finding must be repaired before completion.

- [ ] **Step 5: Run the macOS graphical smoke**

Run `pnpm run dev:desktop` in a PTY. Verify in the live app: splash transitions to the frontend; close hides without ending the process; the tray Show item and double click restore the same window; launching the app command again focuses that window; tray Quit disposes the Host and ends the process. Record the command and observed outcomes; do not claim Windows-native appearance from this macOS run.

- [ ] **Step 6: Review final diff and commit any verification-only repair**

Run `git diff origin/main...HEAD --stat`, `git diff origin/main...HEAD -- apps/desktop docs/subsystems .agents/notes/implemented/feature tsconfig.base.json vitest.snapshot.config.ts`, and `git status --short --branch`. Commit only an actual scoped repair; do not create an empty verification commit.

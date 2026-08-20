/**
 * Verify the packed desktop artifact after `pnpm run pack:desktop`.
 *
 * Three checks, each failing loud with a bounded window:
 *
 * 1. Host-closure smoke: the deployed closure at `resources/host` boots under
 *    plain Node with a temp Harness home, `host.describe` answers, a fresh
 *    home lists zero sessions, `session.create` makes one, and a re-list sees
 *    it — the packaged host is ready and can birth an empty session.
 * 2. Bundle disclosure: the packaged app carries the generated
 *    `THIRD_PARTY_NOTICES.md` in its resources.
 * 3. Live renderer: the packaged executable launches with a temp user data
 *    dir and temp Harness home and writes a `lastGood` startup state, which
 *    the shell commits only after the renderer loaded `dsh://app/`; the
 *    process is then terminated. Skips on Linux without a display, and
 *    honors `DSH_VERIFY_SKIP_LIVE=1`.
 *
 * The checks need a real pack: the script fails loud with a hint when the
 * deploy or the builder output is missing.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

/** The desktop client entry, resolved at runtime (variable specifier so the host-face tsc program stays clean). */
const CLIENT_ENTRY = '@deepseek-ai/dsh-client-connection/client'

/** The in-memory bridge surface the desktop client consumes, mirroring `DesktopFetchBridge`. */
interface DesktopBridgeLike {
  request(message: {
    id: string
    url: string
    method: string
    headers: Record<string, string>
    body: string | null
  }): Promise<void>
  abort(): void
  onResponse(listener: (message: { id: string; status: number; headers: Record<string, string> }) => void): () => void
  onChunk(listener: (message: { id: string; data: Uint8Array }) => void): () => void
  onEnd(listener: (message: { id: string }) => void): () => void
  onError(listener: (message: { id: string; error: unknown }) => void): () => void
}

/** The desktop client surface the smoke uses. */
interface DesktopApiClientLike {
  host: { describe(payload: Record<string, never>): Promise<{ result: { ok: boolean } }> }
  sessions: {
    list(payload: Record<string, never>): Promise<{ result: { ok: boolean; value: { items: unknown[] } } }>
    create(payload: Record<string, never>): Promise<{ result: { ok: boolean } }>
  }
  dispose(): void
}

const repo = resolve(import.meta.dirname, '..')
const appDir = join(repo, 'apps', 'desktop')
const resourcesDir = join(appDir, 'resources')
const distDir = join(appDir, 'dist')

/** Startup-state polling budget for the live-renderer check. */
const STARTUP_POLL_MS = 90_000
/** Interval between startup-state polls. */
const STARTUP_POLL_INTERVAL_MS = 500

/** The located packaged application. */
export interface PackagedApp {
  /** Absolute path of the packaged executable. */
  executable: string
  /** Absolute path of the app's resources directory. */
  resources: string
}

/**
 * Locate the packaged application under the builder output directory.
 * @param dist - The `dist` directory of the desktop app.
 * @param platform - Current Node.js platform.
 * @returns the packaged app, or undefined when the builder output is absent.
 */
export function locatePackagedApp(dist: string, platform: NodeJS.Platform): PackagedApp | undefined {
  if (!existsSync(dist)) return undefined
  if (platform === 'darwin') {
    const macDir = join(dist, 'mac')
    if (!existsSync(macDir)) return undefined
    const appName = readdirSync(macDir).find(entry => entry.endsWith('.app'))
    if (appName === undefined) return undefined
    const app = join(macDir, appName)
    return {
      executable: join(app, 'Contents', 'MacOS', basename(app, '.app')),
      resources: join(app, 'Contents', 'Resources'),
    }
  }
  if (platform === 'win32') {
    const unpacked = join(dist, 'win-unpacked')
    if (!existsSync(unpacked)) return undefined
    const exe = readdirSync(unpacked).find(entry => entry.endsWith('.exe'))
    return exe === undefined ? undefined : { executable: join(unpacked, exe), resources: join(unpacked, 'resources') }
  }
  return undefined
}

/** The startup-state file the shell commits after the renderer loads. */
export function startupStateFile(userDataDir: string): string {
  return join(userDataDir, 'startup-state.json')
}

/**
 * Whether the startup-state file records a completed launch (`lastGood`).
 * @param path - The startup-state file path.
 * @returns true only when the record was committed.
 */
export function startupStateIsGood(path: string): boolean {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as { lastGood?: unknown }
    return record.lastGood !== undefined && record.lastGood !== null
  } catch {
    // A missing or partial file simply means the launch has not committed yet.
    return false
  }
}

/** Whether a display is available for the live-renderer check. */
export function hasDisplay(platform: NodeJS.Platform, env: Record<string, string | undefined>): boolean {
  if (platform !== 'linux') return true
  return env.DISPLAY !== undefined || env.WAYLAND_DISPLAY !== undefined
}

/** A spawned smoke child plus its settled exit promise. */
interface SmokeChild {
  child: ChildProcess
  /** Whether the child process has exited (or failed to spawn). */
  settled: boolean
  /** The exit code when settled; null when terminated by signal. */
  exitCode: number | null
  exited: Promise<void>
  /** Mark the child as intentionally terminated, then send SIGTERM. */
  terminate: () => void
}

/** Spawn the packaged executable with isolated state directories. */
function spawnPackaged(executable: string, userDataDir: string, home: string): SmokeChild {
  const child = spawn(executable, [`--user-data-dir=${userDataDir}`], {
    env: { ...process.env, DSH_HOME: home },
    stdio: 'ignore',
  })
  // The child must never keep the verifier's process alive: the smoke owns
  // readiness, not the child's lifetime, and an app that ignores SIGTERM must
  // not strand the verification run after the checks have settled.
  child.unref()
  const smoke: SmokeChild = { child, settled: false, exitCode: null, exited: Promise.resolve(), terminate: () => {} }
  let terminating = false
  smoke.exited = new Promise<void>((resolveExit, reject) => {
    child.once('error', (error) => {
      smoke.settled = true
      smoke.exitCode = null
      reject(error)
    })
    child.once('exit', (code) => {
      smoke.settled = true
      smoke.exitCode = code
      if (!terminating && code !== 0) reject(new Error(`packaged app exited early with code ${String(code)}`))
      else resolveExit()
    })
  })
  // An early crash surfaces through the readiness poll, not as an unhandled
  // rejection racing the termination path.
  smoke.exited.catch(() => {})
  smoke.terminate = () => {
    terminating = true
    child.kill('SIGTERM')
  }
  return smoke
}

/** Give the child a bounded chance to exit, then force-kill it. */
async function stopChild(smoke: SmokeChild): Promise<void> {
  smoke.terminate()
  const graceful = await Promise.race([
    smoke.exited,
    new Promise<'timeout'>(resolveTimeout => setTimeout(resolveTimeout, 10_000)),
  ])
  if (graceful === 'timeout') {
    smoke.child.kill('SIGKILL')
    await Promise.race([
      smoke.exited,
      new Promise<'timeout'>(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
    ])
  }
}

/** Poll the startup-state file until it records a completed launch. */
async function waitForStartup(smoke: SmokeChild, stateFile: string): Promise<void> {
  const deadline = Date.now() + STARTUP_POLL_MS
  while (Date.now() < deadline) {
    if (startupStateIsGood(stateFile)) return
    if (smoke.settled) {
      const code = smoke.exitCode
      if (code !== 0) throw new Error(`packaged app exited before readiness with code ${String(code)}`)
      throw new Error(`packaged app exited before readiness with code 0 (no ${basename(stateFile)} committed)`)
    }
    await new Promise(resolveWait => setTimeout(resolveWait, STARTUP_POLL_INTERVAL_MS))
  }
  throw new Error(`renderer never reached readiness within ${STARTUP_POLL_MS} ms (no lastGood in ${stateFile})`)
}

/** The deployed host-boot module surface the smoke needs. */
type HostBootModule = {
  bootDesktopHost: (options: { home: string; frontendIndexPath: string }) => Promise<{
    runtime: { graph(): { entries: unknown[] }; fetch(request: Request): Promise<Response> }
    dispose(): Promise<void>
  }>
}

/**
 * Check 1: boot the deployed host closure with a temp home and create one
 * empty session through the wire client.
 */
async function verifyHostClosure(): Promise<void> {
  const hostLib = join(resourcesDir, 'host', 'lib', 'host-boot.js')
  const frontendIndex = join(resourcesDir, 'frontend', 'index.html')
  if (!existsSync(hostLib) || !existsSync(frontendIndex)) {
    throw new Error(`desktop resources were never prepared (${hostLib} or ${frontendIndex}); run pnpm run pack:desktop first`)
  }
  const home = mkdtempSync(join(tmpdir(), 'dsh-verify-host-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { bootDesktopHost } = (await import(pathToFileURL(hostLib).href)) as HostBootModule
    const handle = await bootDesktopHost({ home, frontendIndexPath: frontendIndex })
    try {
      const graphEntries = handle.runtime.graph().entries
      if (graphEntries.length === 0) throw new Error('packaged host closure composed an empty tree')
      // The client over the in-memory bridge, as the desktop snapshot suite
      // uses: the deployed renderer bundle wraps this same code for the module
      // loader, so the wire contract exercised here is the one the packaged
      // renderer speaks. Resolved at runtime so the host-face tsc program does
      // not grow the client face's sources.
      const { DesktopApiClient } = await import(CLIENT_ENTRY) as {
        DesktopApiClient: new (bridge: DesktopBridgeLike) => DesktopApiClientLike
      }
      const client = new DesktopApiClient(bridgeOver(request => handle.runtime.fetch(request)))
      try {
        const described = await client.host.describe({})
        if (!described.result.ok) throw new Error(`host.describe failed: ${JSON.stringify(described.result)}`)
        const before = await client.sessions.list({})
        const itemsBefore = before.result.ok ? before.result.value.items : []
        if (itemsBefore.length !== 0) throw new Error(`fresh Harness home lists ${itemsBefore.length} sessions, expected 0`)
        const created = await client.sessions.create({})
        if (!created.result.ok) throw new Error(`session.create failed: ${JSON.stringify(created.result)}`)
        const after = await client.sessions.list({})
        const itemsAfter = after.result.ok ? after.result.value.items : []
        if (itemsAfter.length !== 1) throw new Error(`session.create produced ${itemsAfter.length} listed sessions, expected 1`)
        console.log(`verify-packaged-runtime: host closure booted (${graphEntries.length} entries), one empty session created`)
      } finally {
        client.dispose()
      }
    } finally {
      await handle.dispose()
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}

/** Check 2: the packaged bundle carries the generated third-party notices. */
function verifyBundleDisclosure(app: PackagedApp): void {
  const notices = join(app.resources, 'THIRD_PARTY_NOTICES.md')
  if (!existsSync(notices)) throw new Error(`packaged bundle missing ${notices}; rerun pnpm run pack:desktop`)
  const head = readFileSync(notices, 'utf8').split('\n').slice(0, 8).join('\n')
  if (!head.includes('Third-Party Notices')) throw new Error(`packaged bundle ${notices} is not the generated notices file`)
  console.log('verify-packaged-runtime: packaged bundle carries THIRD_PARTY_NOTICES.md')
}

/** Check 3: the packaged app boots to a live renderer and records lastGood. */
async function verifyLiveRenderer(app: PackagedApp): Promise<void> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'dsh-verify-userdata-'))
  const home = mkdtempSync(join(tmpdir(), 'dsh-verify-app-'))
  const smoke = spawnPackaged(app.executable, userDataDir, home)
  try {
    await waitForStartup(smoke, startupStateFile(userDataDir))
    console.log('verify-packaged-runtime: packaged app reached a live renderer (lastGood committed)')
  } finally {
    // The child is a best-effort smoke; a failed termination must not mask
    // an earlier readiness verdict or failure.
    await stopChild(smoke).catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
}

/** The same in-memory wire bridge the desktop snapshot suite uses. */
function bridgeOver(fetch: (request: Request) => Promise<Response>): DesktopBridgeLike {
  const channels = {
    response: new Set<(message: { id: string; status: number; headers: Record<string, string> }) => void>(),
    chunk: new Set<(message: { id: string; data: Uint8Array }) => void>(),
    end: new Set<(message: { id: string }) => void>(),
    error: new Set<(message: { id: string; error: unknown }) => void>(),
  }
  return {
    async request(message: { id: string; url: string; method: string; headers: Record<string, string>; body: string | null }) {
      const url = new URL(message.url)
      url.protocol = 'http:'
      url.host = '127.0.0.1'
      const response = await fetch(new Request(url, {
        method: message.method,
        headers: message.headers,
        ...message.body === null ? {} : { body: message.body },
      }))
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      for (const listener of channels.response) listener({ id: message.id, status: response.status, headers })
      if (response.body !== null) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const listener of channels.chunk) listener({ id: message.id, data: value })
        }
      }
      for (const listener of channels.end) listener({ id: message.id })
    },
    abort: () => {},
    onResponse: (listener) => { channels.response.add(listener); return () => { channels.response.delete(listener) } },
    onChunk: (listener) => { channels.chunk.add(listener); return () => { channels.chunk.delete(listener) } },
    onEnd: (listener) => { channels.end.add(listener); return () => { channels.end.delete(listener) } },
    onError: (listener) => { channels.error.add(listener); return () => { channels.error.delete(listener) } },
  }
}

async function main(): Promise<void> {
  await verifyHostClosure()
  const app = locatePackagedApp(distDir, process.platform)
  if (app === undefined) throw new Error(`electron-builder output missing under ${distDir}; run pnpm run pack:desktop first`)
  verifyBundleDisclosure(app)
  if (process.env.DSH_VERIFY_SKIP_LIVE === '1') {
    console.log('verify-packaged-runtime: live-renderer check skipped (DSH_VERIFY_SKIP_LIVE=1)')
  } else if (!hasDisplay(process.platform, process.env)) {
    console.log('verify-packaged-runtime: live-renderer check skipped (headless Linux)')
  } else {
    await verifyLiveRenderer(app)
  }
  console.log('verify-packaged-runtime: packed desktop artifact verified')
}

main().catch((error: unknown) => {
  console.error(`verify-packaged-runtime: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})

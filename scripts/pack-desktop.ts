/** Pack the desktop app: host closure deploy → frontend dist → shell build → node-pty rebuild → electron-builder. */

import { cpSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repo = resolve(import.meta.dirname, '..')
const appDir = join(repo, 'apps', 'desktop')
const resources = join(appDir, 'resources')
const prepareOnly = process.argv.includes('--prepare-only')
const PNPM_RUN_CONFIG = '--config.verify-deps-before-run=false'
// Node's spawnSync does not resolve a bare `pnpm` to the `.cmd` shim on Windows
// (ENOENT), and spawning the `.cmd` directly needs a shell (EINVAL). Route through
// cmd.exe on win32 exactly as the SDK precedent's pnpmBin() implies; our argument
// paths carry no spaces, so shell-word quoting stays lossless.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command: string, args: string[], cwd = repo, env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  })
  if (result.status === 0) return
  // Surfaces the failure mode a Windows-only silent crash otherwise hides: a
  // non-zero status (normal exit) vs `status === null` from an ENOENT spawn or a
  // signal/abort-killed child. `result.error` carries the Node spawn error.
  const detail = [
    result.error ? `error=${result.error.message}` : undefined,
    result.signal ? `signal=${result.signal}` : undefined,
    result.status === null && !result.error && !result.signal ? 'no-status(no-error,no-signal)' : undefined,
  ].filter(Boolean).join(' ')
  throw new Error(`pack-desktop: ${command} ${args.join(' ')} failed (${String(result.status)})${detail ? `; ${detail}` : ''}`)
}

function runPnpm(args: string[], cwd = repo, env: Record<string, string> = {}): void {
  run(pnpm, [PNPM_RUN_CONFIG, ...args], cwd, env)
}

/** Remove and recreate a directory so it starts empty. */
function emptyDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
}

/**
 * Materialize every symlink under `dir` as a real copy, recursively. The deploy
 * keeps the `link:vendor/*` overrides (schemastery, cosmokit) as symlinks, which
 * electron-builder's 7-Zip archiver cannot follow ("cannot find the path"). Keep
 * the packaged host closure symlink-free, mirroring the Python SDK precedent.
 */
function dereferenceSymlinks(dir: string): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch (_unreadable) {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    let stat: ReturnType<typeof lstatSync>
    try {
      stat = lstatSync(path)
    } catch (_gone) {
      continue
    }
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path)
      rmSync(path, { recursive: true, force: true })
      cpSync(target, path, { recursive: true, dereference: true })
      dereferenceSymlinks(path)
    } else if (stat.isDirectory()) {
      dereferenceSymlinks(path)
    }
  }
}

function main(): void {
  // 1. host closure: deploy the desktop bundle's full runtime closure into resources/host.
  // Flags mirror the Python SDK's deploy precedent (scripts/build-exe-for-python-sdk.ts):
  // legacy hoisted layout, prod only, auto-install-peers off so the flat closure stays
  // one Cordis instance.
  emptyDir(join(resources, 'host'))
  runPnpm(['--filter', '@deepseek-ai/dsh-desktop-app', 'deploy', '--legacy', '--prod',
    '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true',
    join(resources, 'host')])
  dereferenceSymlinks(join(resources, 'host', 'node_modules'))

  // 2. renderer resources: desktop-mode web build plus the native startup page.
  runPnpm(['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build:desktop'])
  emptyDir(join(resources, 'frontend'))
  cpSync(join(repo, 'apps', 'web', 'dist'), join(resources, 'frontend'), { recursive: true })
  cpSync(join(appDir, 'src', 'splash.html'), join(resources, 'splash.html'))

  // The generated third-party notices ship inside the packaged bundle, so a
  // user can read the disclosure without the repo (verify-packaged-runtime
  // asserts their presence in the produced artifact).
  cpSync(join(repo, 'THIRD_PARTY_NOTICES.md'), join(resources, 'THIRD_PARTY_NOTICES.md'))

  // 3. shell bundles.
  runPnpm(['--filter', '@deepseek-ai/dsh-desktop', 'run', 'build:shell'])

  if (prepareOnly) return

  // 4. native rebuild: node-pty against the Electron ABI (mac -spawn-helper sibling ships with the package).
  runPnpm(['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-rebuild', '-f', '--only', 'node-pty', '--module-dir', join(resources, 'host')])

  // 5. electron-builder (never publish from local).
  const arch = process.env.DSH_DESKTOP_ARCH ?? process.arch
  runPnpm(['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-builder', '--publish', 'never', `--${arch}`], appDir, {
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  })
}

main()

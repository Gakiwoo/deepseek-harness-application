/** Pack the desktop app: host closure deploy → frontend dist → shell build → node-pty rebuild → electron-builder. */

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repo = resolve(import.meta.dirname, '..')
const appDir = join(repo, 'apps', 'desktop')
const resources = join(appDir, 'resources')
const prepareOnly = process.argv.includes('--prepare-only')
// Node's spawnSync does not resolve a bare `pnpm` to the `.cmd` shim on Windows
// (returns ENOENT); the SDK precedent spawns pnpm.cmd there. Use the same shim.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command: string, args: string[], cwd = repo, env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
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

/** Remove and recreate a directory so it starts empty. */
function emptyDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
}

function main(): void {
  // 1. host closure: deploy the desktop bundle's full runtime closure into resources/host.
  // Flags mirror the Python SDK's deploy precedent (scripts/build-exe-for-python-sdk.ts):
  // legacy hoisted layout, prod only, auto-install-peers off so the flat closure stays
  // one Cordis instance.
  emptyDir(join(resources, 'host'))
  run(pnpm, ['--filter', '@deepseek-ai/dsh-desktop-app', 'deploy', '--legacy', '--prod',
    '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true',
    join(resources, 'host')])

  // 2. frontend dist: desktop-mode web build → resources/frontend.
  run(pnpm, ['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build:desktop'])
  emptyDir(join(resources, 'frontend'))
  cpSync(join(repo, 'apps', 'web', 'dist'), join(resources, 'frontend'), { recursive: true })

  // 3. shell bundles.
  run(pnpm, ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'build:shell'])

  if (prepareOnly) return

  // 4. native rebuild: node-pty against the Electron ABI (mac -spawn-helper sibling ships with the package).
  run(pnpm, ['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-rebuild', '-f', '--only', 'node-pty', '--module-dir', join(resources, 'host')])

  // 5. electron-builder (never publish from local).
  const arch = process.env.DSH_DESKTOP_ARCH ?? process.arch
  run(pnpm, ['--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-builder', '--publish', 'never', `--${arch}`], appDir, {
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  })
}

main()
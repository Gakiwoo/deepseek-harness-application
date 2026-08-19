/**
 * Login-shell environment recovery for desktop launches.
 *
 * Finder and Dock launches on macOS receive a minimal environment whose PATH
 * lacks the toolchains and package managers a shell login normally adds, so
 * spawned tool processes cannot find `git`, `node`, or `pnpm`. This module
 * captures `export -p` from the user's login shell and merges the result:
 * PATH always; allowlisted locale/toolchain/package-manager names only when
 * the launching environment lacks them. The allowlist is the security
 * boundary: nothing outside it is ever imported, so credentials in the login
 * shell never reach the app process.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

/**
 * Names the login shell may fill in when the launching environment lacks them:
 * locale and timezone, toolchain locators, and package-manager homes. PATH is
 * handled separately and always taken from the shell. Toolchains occasionally
 * move to new environment names; extend this set in the same change that
 * requires the new name.
 */
export const SHELL_FILL_ALLOWLIST: ReadonlySet<string> = new Set([
  'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_COLLATE', 'LC_MESSAGES', 'LC_NUMERIC',
  'LC_MONETARY', 'LC_PAPER', 'LC_TIME', 'LC_IDENTIFICATION', 'TZ',
  'NVM_DIR', 'NVM_BIN', 'RUSTUP_HOME', 'CARGO_HOME', 'GOPATH', 'PYENV_ROOT',
  'CONDA_HOME', 'CONDA_PREFIX', 'VIRTUAL_ENV', 'ASDF_DATA_DIR', 'MISE_DATA_DIR', 'SDKMAN_DIR',
  'PNPM_HOME', 'COREPACK_HOME', 'NPM_CONFIG_PREFIX', 'YARN_CACHE_FOLDER',
])

/** Shell basenames this module knows how to run for `export -p`. */
const SUPPORTED_SHELL_BASENAMES = ['zsh', 'bash']

/** Fallback login shells probed when `SHELL` is missing or unsupported. */
const FALLBACK_SHELLS = ['/bin/zsh', '/bin/bash']

/** How long a login-shell capture may run before it is killed. */
const DEFAULT_TIMEOUT_MS = 2000

/** Cap on captured export output; oversized output is truncated and still parsed. */
const DEFAULT_MAX_BYTES = 64 * 1024

/**
 * Parse `export -p` output from bash (`declare -x NAME=...`) and zsh
 * (`export NAME=...`) into a name/value map. Lines without a value are
 * skipped; malformed lines are ignored.
 */
export function parseExportOutput(raw: string): Map<string, string> {
  const env = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const match = /^(?:declare -x |export |typeset -x )?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (match === null) continue
    env.set(match[1], unquoteExportValue(match[2]))
  }
  return env
}

/**
 * Pick a supported login shell: the `SHELL` value when it names an existing
 * zsh or bash, otherwise the first existing fallback.
 */
export function resolveShellPath(shell: string | undefined, shellExists: (path: string) => boolean = existsSync): string | undefined {
  if (shell !== undefined && SUPPORTED_SHELL_BASENAMES.includes(basename(shell)) && shellExists(shell)) {
    return shell
  }
  return FALLBACK_SHELLS.find(shellExists)
}

/** The spawn surface used for capture; the default spawns with stdio pipes. */
type SpawnChild = (shell: string, argv: readonly string[]) => ChildProcess

export interface CaptureOptions {
  /** The login shell to run. */
  shell: string
  /** How long the capture may run before it is killed. */
  timeoutMs?: number
  /** Cap on captured output; oversized output is truncated and still parsed. */
  maxBytes?: number
  /** Injectable spawn for tests. */
  spawnChild?: SpawnChild
}

/**
 * Run the login shell non-interactively to print `export -p` and return the
 * parsed environment. Returns undefined when the shell fails, is killed by
 * the timeout, or errors; oversized output is truncated and parsed.
 */
export async function captureExportOutput(options: CaptureOptions): Promise<Map<string, string> | undefined> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const child = options.spawnChild === undefined
    ? spawn(options.shell, ['-ilc', 'export -p'], { stdio: ['ignore', 'pipe', 'ignore'] })
    : options.spawnChild(options.shell, ['-ilc', 'export -p'])
  return await new Promise((resolve) => {
    let stdout = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve(undefined)
    }, timeoutMs)
    const finish = (env: Map<string, string> | undefined): void => {
      clearTimeout(timer)
      resolve(env)
    }
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
      if (stdout.length > maxBytes) {
        child.kill()
        finish(parseExportOutput(stdout.slice(0, maxBytes)))
      }
    })
    child.stdout?.on('error', () => { finish(undefined) })
    child.on('error', () => { finish(undefined) })
    child.on('close', (code: number | null) => {
      if (code === 0) finish(parseExportOutput(stdout))
      else finish(undefined)
    })
  })
}

export interface RecoverOptions {
  /** Whether recovery may run; false on Windows and in dev launches. */
  enabled: boolean
  /** The user's login shell, from the launching environment. */
  shell?: string
  /** The environment to merge into; defaults to process.env. */
  target?: Record<string, string | undefined>
  /** Presence check for candidate shell paths; defaults to filesystem existence. */
  shellExists?: (path: string) => boolean
  /** How long the capture may run before it is killed. */
  timeoutMs?: number
  /** Cap on captured output. */
  maxBytes?: number
  /** Injectable spawn for tests. */
  spawnChild?: SpawnChild
}

/**
 * Merge the login shell's environment into `target`: PATH is always taken
 * from the shell; allowlisted names are imported only when the target lacks
 * them. Returns the imported names. A failed or timed-out capture imports
 * nothing.
 */
export async function recoverShellEnvironment(options: RecoverOptions): Promise<string[]> {
  if (!options.enabled) return []
  const shell = resolveShellPath(options.shell, options.shellExists)
  if (shell === undefined) return []
  const captured = await captureExportOutput({
    shell,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    spawnChild: options.spawnChild,
  })
  if (captured === undefined) return []
  const target = options.target ?? process.env
  const imported: string[] = []
  const shellPath = captured.get('PATH')
  if (shellPath !== undefined && shellPath !== '') {
    target.PATH = shellPath
    imported.push('PATH')
  }
  for (const name of SHELL_FILL_ALLOWLIST) {
    const value = captured.get(name)
    if (value !== undefined && target[name] === undefined) {
      target[name] = value
      imported.push(name)
    }
  }
  return imported.sort()
}

/** Strip the surrounding quotes `export -p` uses and unescape their contents. */
function unquoteExportValue(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1)
  }
  return raw
}

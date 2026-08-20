import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const rootConfigPath = fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))
const rootConfigResult = ts.readConfigFile(rootConfigPath, path => ts.sys.readFile(path))
if (rootConfigResult.error) {
  throw new Error(ts.flattenDiagnosticMessageText(rootConfigResult.error.messageText, '\n'))
}
const rootConfig = rootConfigResult.config as {
  compilerOptions: { paths: Record<string, string[]> }
}
const desktopPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: { 'build:shell': string }
}
const bundlePackage = JSON.parse(
  readFileSync(new URL('../../../packages/bundle/desktop-app/package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string>; files: string[] }
const hostBootSource = readFileSync(
  new URL('../../../packages/bundle/desktop-app/src/host-boot.ts', import.meta.url),
  'utf8',
)
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const packScript = readFileSync(new URL('../../../scripts/pack-desktop.ts', import.meta.url), 'utf8')
const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
  scripts: { 'pack:desktop': string; 'verify:packed': string }
}

// The deployed host closure must provide every package the profile's plugin
// tree reaches through peer edges: `pnpm deploy` installs no peers, so the
// deploy root declares them as dependencies. The packaged host boot, the
// preset roster, and the two profile bundles are the surfaces the first real
// pack runs caught missing.
const CLOSURE_PEER_DEPENDENCIES = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cosmokit',
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/cordis-plugin-include',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis-plugin-logger-console',
  '@deepseek-ai/dsh-anonymous-user-id',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-bash-local',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-code-runtime',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-output-retention',
  '@deepseek-ai/dsh-pwsh-local',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session-telemetry',
  '@deepseek-ai/dsh-session-title-llm',
  '@deepseek-ai/dsh-shell',
  '@deepseek-ai/dsh-spill',
  '@deepseek-ai/dsh-subagent-in-process-driver',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-timeout',
  '@deepseek-ai/dsh-workflow',
  '@standard-schema/spec',
  'clsx',
  'node-addon-require-builtin',
  'react',
  'react-dom',
]

describe('desktop build contracts', () => {
  it('resolves the pure desktop bridge from source', () => {
    expect(rootConfig.compilerOptions.paths['@deepseek-ai/dsh-client-connection/desktop-bridge']).toEqual([
      './packages/client/connection/src/client/desktop-bridge.ts',
    ])
  })

  it('keeps Electron external to both shell bundles', () => {
    expect(desktopPackage.scripts['build:shell'].match(/--external:electron/g)).toHaveLength(2)
  })

  it('copies the splash page into prepared desktop resources', () => {
    expect(packScript).toContain(
      "cpSync(join(appDir, 'src', 'splash.html'), join(resources, 'splash.html'))",
    )
  })

  it('does not let packaging reconcile the workspace dependency state', () => {
    expect(packScript).toContain("const PNPM_RUN_CONFIG = '--config.verify-deps-before-run=false'")
    expect(packScript).toContain('run(pnpm, [PNPM_RUN_CONFIG, ...args]')
  })

  it('points the packaged host boot at the deployed closure root', () => {
    expect(mainSource).toContain("join(process.resourcesPath, 'host', 'lib', 'host-boot.js')")
    expect(mainSource).not.toContain("join(process.resourcesPath, 'host', 'node_modules'")
  })

  it('ships the generated third-party notices in the packaged bundle', () => {
    expect(packScript).toContain("cpSync(join(repo, 'THIRD_PARTY_NOTICES.md'), join(resources, 'THIRD_PARTY_NOTICES.md'))")
  })

  it('runs the packaged-runtime verification after every pack', () => {
    expect(rootPackage.scripts['pack:desktop']).toContain('&& pnpm run verify:packed')
    expect(rootPackage.scripts['verify:packed']).toContain('scripts/verify-packaged-runtime.ts')
  })

  it('declares the full closure peer set on the desktop deploy root', () => {
    for (const name of CLOSURE_PEER_DEPENDENCIES) {
      expect(bundlePackage.dependencies[name], name).toBeDefined()
    }
  })

  it('ships the agent-presets roster with the bundle', () => {
    expect(bundlePackage.files).toContain('config/agent-presets/**')
  })

  it('overlays the shipped preset root as a system-trusted roster root', () => {
    expect(hostBootSource).toContain("SHIPPED_PRESET_ROOT = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))")
    expect(hostBootSource).toContain("roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }]")
  })
})

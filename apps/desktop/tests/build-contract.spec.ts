import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const rootConfigPath = fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url))
const rootConfigResult = ts.readConfigFile(rootConfigPath, ts.sys.readFile)
if (rootConfigResult.error) {
  throw new Error(ts.flattenDiagnosticMessageText(rootConfigResult.error.messageText, '\n'))
}
const rootConfig = rootConfigResult.config as {
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

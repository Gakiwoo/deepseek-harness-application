import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-connection', ['lib/types/index.js', 'lib/types/invariant.js'], {
  companions: [{
    entry: { 'desktop-bridge': 'lib/types/client/desktop-bridge.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'neutral',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }],
})

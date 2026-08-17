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
  protocol.handle('dsh', (request) => {
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

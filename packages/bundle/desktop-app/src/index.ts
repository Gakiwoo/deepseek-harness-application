/**
 * Desktop surface runtime glue: provides the `desktopRuntime` service (the
 * Electron main process's single consumption face — IPC fetch carrier, boot
 * manifest, plugin bundle paths, frontend index path) and registers the
 * `app:desktop-surface` prompt section.
 * @module @deepseek-ai/dsh-desktop-app
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { addHarnessSourceSection } from '@deepseek-ai/dsh-app-boot'
import type { WebBootGraph } from '@deepseek-ai/dsh-client-modules'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-system-prompt'
// Activates the Context merges for the connection and clientModules services
// (the desktop tree has no webServer, so neither merge arrives transitively).
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-client-modules'

/** Stable Cordis plugin name. */
export const name = 'desktop-app'

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Plugin config. */
export interface DesktopAppConfig {
  /** Absolute path of the desktop frontend index.html (injected by host-boot from the shell's resources dir). */
  frontendIndex: string
  /** Whether to register the desktop-surface prompt section. */
  surfaceContext: boolean
}

export const Config: z<DesktopAppConfig> = z.object({
  frontendIndex: z.string().default(''),
  surfaceContext: z.boolean().default(true),
})

/** The Electron main process's consumption face over the settled desktop tree. */
export interface DesktopRuntime {
  /**
   * /api dispatch (TypertGateway interceptor + apiproxy fallback) — the IPC pump's carrier.
   * @param request - the fetch request to dispatch against the /api face.
   * @returns the response from the host dispatch.
   */
  fetch(request: Request): Promise<Response>
  /**
   * Current composed `window.__DSH_BOOT__` graph.
   * @returns the composed client module graph.
   */
  graph(): WebBootGraph
  /**
   * Absolute path of one plugin's built client bundle.
   * @param id - the client module package id.
   * @returns the resolved bundle path, or undefined when the id is not in the graph.
   */
  clientPath(id: string): string | undefined
  /**
   * Absolute path of the frontend index.html this surface serves.
   * @returns the frontend index path.
   */
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

/** Model-visible orientation for sessions created through the desktop window. */
function desktopSurfacePrompt(): string {
  return [
    '# Desktop surface',
    '- The user interacts with you through the DeepSeek Harness desktop application window.',
    '- There is no URL, port, or browser tab; do not refer to one.',
    '- There is no hot reload; file edits take effect when the user reruns things.',
    '- Native desktop dialogs (directory pickers, file opens) are available through the usual host tools.',
  ].join('\n')
}

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
    addHarnessSourceSection(promptCtx, SOURCE_ROOT)
    promptCtx.systemPrompt.section({
      name: 'app:desktop-surface',
      order: -98,
      text: () => desktopSurfacePrompt(),
    })
  })
}

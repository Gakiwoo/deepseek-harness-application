/**
 * Desktop runtime glue behavior: the desktopRuntime service face (IPC fetch
 * carrier, boot manifest, plugin bundle paths, frontend index) and the
 * desktop-surface prompt section registration.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { apply, Config } from '../src/index.ts'

/** A fake connection whose /api dispatch answers one unary call. */
function fakeConnection(): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/api/ok') {
        return new Response(JSON.stringify({ type: 'server-response', ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    },
  }
}

/** A fake clientModules table exposing graph()/clientPath(). */
function fakeClientModules(graph: unknown): { graph(): unknown; clientPath(id: string): string | undefined } {
  return {
    graph: () => graph,
    clientPath: id => id === 'x' ? '/bundle.js' : undefined,
  }
}

describe('desktop-app runtime glue', () => {
  it('uses config defaults and dispatches runtime fetches', async () => {
    const ctx = new Context()
    ctx.provide('connection', fakeConnection())
    ctx.provide('clientModules', fakeClientModules({ entries: [] }))
    apply(ctx)
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ctx.desktopRuntime.frontendIndex()).toBe('')
    const response = await ctx.desktopRuntime.fetch(new Request('http://dsh.internal/api/ok'))
    expect(response.status).toBe(200)
    await ctx.fiber.dispose()
  })

  it('provides the desktopRuntime face over connection + clientModules', async () => {
    const ctx = new Context()
    const graph = { entries: [] }
    ctx.provide('connection', fakeConnection())
    ctx.provide('clientModules', fakeClientModules(graph))
    apply(ctx, new Config({ frontendIndex: '/tmp/index.html', surfaceContext: false }))
    expect(ctx.desktopRuntime.graph()).toBe(graph)
    expect(ctx.desktopRuntime.clientPath('x')).toBe('/bundle.js')
    expect(ctx.desktopRuntime.clientPath('nope')).toBeUndefined()
    expect(ctx.desktopRuntime.frontendIndex()).toBe('/tmp/index.html')
    expect(typeof ctx.desktopRuntime.fetch).toBe('function')
    await ctx.fiber.dispose()
  })

  it('registers the desktop-surface prompt section when surfaceContext is on', async () => {
    const ctx = new Context()
    ctx.provide('connection', fakeConnection())
    ctx.provide('clientModules', fakeClientModules({ entries: [] }))
    apply(ctx, new Config({ frontendIndex: '/tmp/index.html', surfaceContext: true }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const assembly = await ctx.systemPrompt.assemble()
    const section = assembly.sections.find(entry => entry.name === 'app:desktop-surface')
    expect(section?.text).toContain('desktop application window')
    await ctx.fiber.dispose()
  })

  it('skips the prompt section when surfaceContext is off', async () => {
    const ctx = new Context()
    ctx.provide('connection', fakeConnection())
    ctx.provide('clientModules', fakeClientModules({ entries: [] }))
    apply(ctx, new Config({ frontendIndex: '/tmp/index.html', surfaceContext: false }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.some(entry => entry.name === 'app:desktop-surface')).toBe(false)
    await ctx.fiber.dispose()
  })
})

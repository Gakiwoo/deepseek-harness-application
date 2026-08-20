/** desktop-app startup invariants: the settled-tree shape assertions. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { assertDesktopTree } from '../src/invariant.ts'

describe('assertDesktopTree', () => {
  it('passes when every servable service is mounted', () => {
    const ctx = new Context()
    ctx.provide('desktopRuntime', {} as never)
    ctx.provide('clientModules', {} as never)
    ctx.provide('apiProxy', {} as never)
    ctx.provide('pluginManager', {} as never)
    ctx.provide('terminalManager', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).not.toThrow()
    void ctx.fiber.dispose()
  })

  it('fails loud when desktopRuntime is missing', () => {
    const ctx = new Context()
    ctx.provide('clientModules', {} as never)
    ctx.provide('apiProxy', {} as never)
    ctx.provide('pluginManager', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).toThrow(/desktopRuntime/)
    void ctx.fiber.dispose()
  })

  it('fails loud when clientModules is missing', () => {
    const ctx = new Context()
    ctx.provide('desktopRuntime', {} as never)
    ctx.provide('apiProxy', {} as never)
    ctx.provide('pluginManager', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).toThrow(/clientModules/)
    void ctx.fiber.dispose()
  })

  it('fails loud when apiProxy is missing', () => {
    const ctx = new Context()
    ctx.provide('desktopRuntime', {} as never)
    ctx.provide('clientModules', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).toThrow(/apiProxy/)
    void ctx.fiber.dispose()
  })

  it('fails loud when pluginManager is missing', () => {
    const ctx = new Context()
    ctx.provide('desktopRuntime', {} as never)
    ctx.provide('clientModules', {} as never)
    ctx.provide('apiProxy', {} as never)
    ctx.provide('terminalManager', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).toThrow(/pluginManager/)
    void ctx.fiber.dispose()
  })

  it('fails loud when terminalManager is missing', () => {
    const ctx = new Context()
    ctx.provide('desktopRuntime', {} as never)
    ctx.provide('clientModules', {} as never)
    ctx.provide('apiProxy', {} as never)
    ctx.provide('pluginManager', {} as never)
    expect(() =>{  assertDesktopTree(ctx) }).toThrow(/terminalManager/)
    void ctx.fiber.dispose()
  })
})

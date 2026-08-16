/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-desktop-app` plus
 * the desktop-tree shape assertion utility.
 * @module @deepseek-ai/dsh-desktop-app/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-desktop-app'

/** Cordis companion plugin name. */
export const name = 'desktop-app-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the package is a static patch-list carrier plus a
// runtime glue plugin; every contribution (desktopRuntime service, prompt
// section) is registry-disposed with the fiber, and each owning registry's
// package carries that relation's invariant.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

/**
 * Assert the desktop tree settled into a servable shape; throws loud otherwise.
 * @param ctx - the settled desktop root context.
 */
export function assertDesktopTree(ctx: Context): void {
  if (ctx.get('desktopRuntime') === undefined) {
    throw new Error('desktop-app: the tree settled without desktopRuntime — is the desktop-runtime row composed?')
  }
  if (ctx.get('clientModules') === undefined) {
    throw new Error('desktop-app: the tree settled without clientModules — the browser roster cannot be composed')
  }
  if (ctx.get('apiProxy') === undefined) {
    throw new Error('desktop-app: the tree settled without apiProxy — the IPC carrier would 404 every call')
  }
}

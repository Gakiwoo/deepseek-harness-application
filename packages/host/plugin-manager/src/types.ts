import type { Branded } from '@deepseek-ai/dsh-brand'

/** One profile bundle layer name in `dsh.profile.bundles`. */
export type ProfileBundleName = Branded<'ProfileBundleName'>

/** Outcome of one profile plugin mutation, settled against the profile manifest. */
export interface PluginMutationResult {
  /** Whether pnpm succeeded and the layer list was reconciled from the installed state. */
  readonly ok: boolean
  /** pnpm's exit code; {@link PNPM_NOT_FOUND_EXIT} when pnpm itself is missing. */
  readonly exitCode: number
  /** Captured pnpm stdout, for diagnostics. */
  readonly stdout: string
  /** Captured pnpm stderr, for diagnostics. */
  readonly stderr: string
  /** The bundle layer list after the mutation settled: reconciled on success, restored on failure. */
  readonly bundles: readonly ProfileBundleName[]
}

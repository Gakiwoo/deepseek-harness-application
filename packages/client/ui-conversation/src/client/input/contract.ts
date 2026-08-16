/**
 * Frozen input-machine contract. Types
 * only. Three-tier visibility: business packages see InputState via the
 * InputZone currency; the scoped input events carry the mutation verbs; the
 * conversation wiring layer alone sees the full SessionInput. InputMachine
 * (machine.ts) is package-private and never exported.
 *
 * The shared input types that cross domain boundaries live in
 * `contract/input-types.ts` (importable by sibling domains); this file
 * re-exports them for the input domain's package-internal consumers and keeps
 * the machine-internal event/effect types.
 */
import type {
  CommandClaim, ConsumeTokenRequest, PickOutcome, ReferenceInsert, SubmitOutcome, TokenSpan,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { InputSubmitMode } from '../contract/composer-submission.ts'
import type {
  EditRange, EditSelection, PasteComponent,
} from '../contract/input-types.ts'

/** Guard union of the scoped consume-token event, checked by the machine. */
export type ConsumeTokenGuard = ConsumeTokenRequest['guard']

/**
 * InputMachine construction knobs. The machine never reads an ambient clock:
 * `now` is the only time source, injected by the shell (tests inject a
 * fake). The default clock is constant, i.e. consecutive single-char typing
 * always coalesces until a non-typing transaction intervenes.
 */
export interface InputMachineOptions {
  /** Single-char typing undo-merge window in ms (default 1000). */
  readonly mergeWindowMs?: number
  /** Monotonic clock for typing-merge decisions (default: constant 0). */
  readonly now?: () => number
}

/**
 * One in-flight submission attempt: the ONLY id concept in the submit plane.
 * Created on enter; carried by adjudicated/submit-settled events; stale
 * attempts are dropped (anti-backwash). release/session teardown aborts the
 * current attempt, keeping the promise bounded.
 */
export interface SubmitAttempt {
  readonly seq: number
  readonly signal: AbortSignal
  /** Draft at enter time; rollback restores it only while the live draft still equals it. */
  readonly draftSnapshot: string
  /** Default-message delivery intent retained while slash adjudication is pending. */
  readonly mode: InputSubmitMode
}

/**
 * InputMachine input events (the machine's single write path). Every draft
 * mutation is one transaction: draft edit, occurrence reconciliation, and
 * undo-log push are atomic inside dispatch(). Events carrying `at` stamp the
 * injected clock reading; only single-char typing coalescing reads it.
 */
export type InputEvent =
  /** Full next draft from the textarea; editRange narrows the occurrence math (absent → diff scan). */
  | { readonly type: 'draft-changed'; readonly draft: string; readonly editRange?: EditRange }
  | { readonly type: 'begin-command'; readonly claim: CommandClaim; readonly span: TokenSpan }
  /** Place one U+FFFC at the span and mint the occurrence (scoped insert-reference event payload). */
  | { readonly type: 'insert-ref'; readonly reference: ReferenceInsert; readonly span: TokenSpan }
  /** Delete a settled command token; success is observable as a draftRev advance. */
  | { readonly type: 'consume-token'; readonly guard: ConsumeTokenGuard }
  /** Owner-resolution result: exactly the listed occurrences are invalid (style bit; not a transaction). */
  | { readonly type: 'set-invalid'; readonly invalidIds: readonly number[] }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  /**
   * Paste text replacing the selection, one transaction. Hot-snapshot sync
   * matches ride in as components (chips minted inside the SAME transaction:
   * one undo returns to pre-paste); a PasteMatchAttempt opens for the async
   * remainder. Component ranges must be disjoint and inside the pasted text.
   */
  | { readonly type: 'paste-begin'; readonly text: string; readonly selection: EditSelection; readonly components?: readonly PasteComponent[]; readonly generation?: number }
  /** Async match landed: upgrade one pasted token to a chip as an INDEPENDENT transaction (undo #1 → text, undo #2 → pre-paste). */
  | { readonly type: 'paste-upgrade'; readonly attemptId: number; readonly span: TokenSpan; readonly reference: ReferenceInsert }
  /** Shell-observed attempt killers the machine cannot see itself (caret/selection ops, Slash interaction updates). */
  | { readonly type: 'invalidate-paste' }
  | { readonly type: 'enter'; readonly mode: InputSubmitMode }
  | { readonly type: 'adjudicated'; readonly attempt: SubmitAttempt; readonly outcome: PickOutcome }
  | { readonly type: 'adjudication-failed'; readonly attempt: SubmitAttempt; readonly message: string }
  | { readonly type: 'submit-settled'; readonly attempt: SubmitAttempt; readonly ok: boolean; readonly outcome?: SubmitOutcome; readonly message?: string }
  /**
   * An ordinary (default-sink) send was accepted: clear the draft as a COMMIT —
   * undo must not resurrect sent content (mirrors submit-settled's success arm).
   */
  | { readonly type: 'send-committed' }
  | { readonly type: 'release' }

/**
 * InputMachine output effects (executed by the SessionInput shell; the
 * machine stays pure). Draft/occurrence mutations carry no effect — the
 * shell publishes the state store after every dispatch.
 */
export type InputEffect =
  | { readonly type: 'adjudicate'; readonly attempt: SubmitAttempt; readonly draft: string }
  | { readonly type: 'begin-submit'; readonly attempt: SubmitAttempt; readonly claim: CommandClaim; readonly args: string }
  | { readonly type: 'default-sink'; readonly draft: string; readonly mode: InputSubmitMode }
  | { readonly type: 'notice'; readonly level: 'info' | 'error'; readonly text: string }

// Re-export the shared input contract for this domain's package-internal
// consumers (facade/machine/hub import them from './contract.ts').
export type {
  ComposerBlock, ComposerBlocks, ComposerKeyboard, DraftAttachmentId, EditRange, EditSelection,
  InputActions, InputNotice, InputState, InputTarget, Occurrence, PasteAttemptState,
  PasteComponent, QueuedMessage, SessionInput, SessionInputResolver,
} from '../contract/input-types.ts'
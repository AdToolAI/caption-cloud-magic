/**
 * canonicalTurnIdentity — V537, the canonical turn-identity contract.
 * =============================================================================
 *
 * Acceptance test N2-02 ("Visual Order Swap", scene 7aa7fc93, run 7bcb9442)
 * was blocked pre-dispatch by `fa4_p0_turn_pass_mismatch` with
 * `turn_backed_count = 4`, `canonical_turns = 1` and
 * `null_segment_pass_idx = [1,2,3]`. The scene had held four turns with four
 * ids; after reconciliation exactly one survived, and `audio_plan` mirrored
 * that loss faithfully.
 *
 * Two defects combined.
 *
 *   1. `alignDialogTurnsToScript` sets `turnId: keepsIdentity ? base?.turnId
 *      : undefined`. That decision is CORRECT and stays: a line reassigned to
 *      a different speaker must not inherit the previous speaker's turn id,
 *      and a line beyond the existing turns has no base to inherit from.
 *
 *   2. Nothing mints a replacement. The only `crypto.randomUUID()` in the
 *      repository lives in `ensureDialogTurnsForScene`, which returns early
 *      whenever the scene already has at least one turn. So `undefined`
 *      travelled through the canonicalization write, into `audio_plan`
 *      segments, and into FA-4.
 *
 * This module closes the second half. `undefined` from the aligner is read as
 * what it means — "this output turn needs a NEW logical identity" — and that
 * identity is minted exactly once, at the canonical persistence boundary,
 * before anything is written or voiced.
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 * It is not a relaxation of FA-4. FA-4 stays fail-closed and unchanged; it
 * simply stops being handed a state no upstream stage was required to avoid.
 *
 * It does not decide WHETHER an identity may survive. That is the aligner's
 * call and it is untouched. This module only guarantees that whatever the
 * aligner passes on ends up with exactly one valid, unique UUID.
 *
 * PURITY
 * ------
 * The UUID generator is INJECTED, never imported. Production passes
 * `crypto.randomUUID`; tests pass a counter. That keeps the decision logic
 * deterministic and testable, and keeps the nondeterminism at the boundary
 * where it belongs.
 *
 * IMPORTANT: this file has a byte-identical mirror at
 * `supabase/functions/_shared/canonical-turn-identity.ts`.
 * A parity test fails the build when the two drift apart.
 */

/** Canonical turn id shape: a lowercase-or-uppercase RFC-4122 UUID string. */
export const TURN_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PURE — is this value a usable canonical turn id? */
export function isCanonicalTurnId(value: unknown): value is string {
  return typeof value === 'string' && TURN_ID_UUID_RE.test(value.trim());
}

/**
 * A turn as it may arrive: camelCase from the client, legacy snake_case from
 * older stored payloads. `id` is deliberately NOT an alias — no source in this
 * repository ever reads a turn's identity from `id`, and treating it as one
 * would silently adopt a brand-character id as a turn id.
 */
export interface TurnIdCarrier {
  turnId?: unknown;
  turn_id?: unknown;
}

/**
 * PURE — the turn's existing canonical id, or `null`.
 *
 * Accepts both spellings and returns a value only when it is actually usable.
 * A present-but-malformed id reads as `null` on purpose: "there is something
 * here" and "there is an identity here" are different statements, and only
 * the second one may be preserved.
 */
export function readTurnId(turn: TurnIdCarrier | null | undefined): string | null {
  const raw = turn?.turnId ?? turn?.turn_id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return TURN_ID_UUID_RE.test(trimmed) ? trimmed : null;
}

export interface CanonicalTurnIdReport {
  ok: boolean;
  /** Indices whose turn carries no id at all. */
  missingIdx: number[];
  /** Indices whose turn carries an id that is not a UUID. */
  invalidIdx: number[];
  /** Indices that repeat an id already used by an earlier turn. */
  duplicateIdx: number[];
  /** The repeated ids themselves, in first-repeat order. */
  duplicateIds: string[];
  /** How many turns were inspected. */
  checked: number;
}

/**
 * PURE — does this turn list satisfy the canonical identity invariant?
 *
 *   every turn carries a valid UUID turnId
 *   AND
 *   those ids are unique
 *
 * Uniqueness is part of the invariant rather than an afterthought: a list in
 * which every turn has a UUID but two of them match still fails FA-4, on
 * `duplicate_segment_ids` instead of `null_segment_pass_idx`.
 *
 * An EMPTY list is reported as ok. "No turns" is a separate condition with
 * its own handling upstream, and conflating it with "broken ids" would make
 * this report lie about which thing went wrong.
 */
export function validateCanonicalTurnIds(
  turns: ReadonlyArray<TurnIdCarrier | null | undefined> | null | undefined,
): CanonicalTurnIdReport {
  const list = Array.isArray(turns) ? turns : [];
  const missingIdx: number[] = [];
  const invalidIdx: number[] = [];
  const duplicateIdx: number[] = [];
  const duplicateIds: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < list.length; i += 1) {
    const turn = list[i];
    const raw = turn?.turnId ?? turn?.turn_id;
    const id = readTurnId(turn);
    if (id === null) {
      if (raw === undefined || raw === null || raw === '') missingIdx.push(i);
      else invalidIdx.push(i);
      continue;
    }
    if (seen.has(id)) {
      duplicateIdx.push(i);
      if (!duplicateIds.includes(id)) duplicateIds.push(id);
      continue;
    }
    seen.add(id);
  }

  return {
    ok:
      missingIdx.length === 0 &&
      invalidIdx.length === 0 &&
      duplicateIdx.length === 0,
    missingIdx,
    invalidIdx,
    duplicateIdx,
    duplicateIds,
    checked: list.length,
  };
}

export interface MaterializeResult<T> {
  turns: T[];
  /** How many ids were newly minted. */
  minted: number;
  /** How many existing valid ids survived byte-for-byte. */
  preserved: number;
  /** How many ids were replaced because they were invalid or duplicated. */
  replaced: number;
  /** Indices that received a new id, for telemetry. */
  mintedIdx: number[];
}

/**
 * PURE (given a generator) — give every turn exactly one valid, unique id.
 *
 * Rules, in order:
 *
 *   valid UUID, not yet seen  → preserved byte-for-byte
 *   absent                    → minted
 *   present but not a UUID    → minted (the malformed value is discarded)
 *   duplicate of an earlier   → minted (FIRST occurrence keeps the id)
 *
 * The first occurrence winning matters: it means a re-materialization of a
 * list that already collided is stable, instead of shuffling which turn owns
 * the contested id on every pass.
 *
 * IDEMPOTENCE. A list whose ids are already valid and unique comes back
 * unchanged and `mintId` is never called. That is what lets this run on every
 * canonicalization without churning identities out from under an open
 * dispatch or retry.
 *
 * The input is never mutated. Every output turn is a fresh object; a legacy
 * `turn_id` key is dropped so exactly one spelling survives and no downstream
 * reader has to arbitrate between two.
 */
export function materializeCanonicalTurnIds<T extends TurnIdCarrier>(
  turns: ReadonlyArray<T> | null | undefined,
  mintId: () => string,
): MaterializeResult<T> {
  const list = Array.isArray(turns) ? turns : [];
  const out: T[] = [];
  const seen = new Set<string>();
  const mintedIdx: number[] = [];
  let minted = 0;
  let preserved = 0;
  let replaced = 0;

  for (let i = 0; i < list.length; i += 1) {
    const turn = list[i];
    const hadSomething =
      turn?.turnId !== undefined && turn?.turnId !== null && turn?.turnId !== '';
    const hadLegacy =
      turn?.turn_id !== undefined && turn?.turn_id !== null && turn?.turn_id !== '';
    const existing = readTurnId(turn);

    let id: string;
    if (existing !== null && !seen.has(existing)) {
      id = existing;
      preserved += 1;
    } else {
      id = mintId();
      minted += 1;
      mintedIdx.push(i);
      if (hadSomething || hadLegacy) replaced += 1;
    }
    seen.add(id);

    const next = { ...(turn as object) } as T & TurnIdCarrier;
    delete next.turn_id;
    next.turnId = id;
    out.push(next as T);
  }

  return { turns: out, minted, preserved, replaced, mintedIdx };
}

/**
 * PURE — the one-line reason string for a failed invariant, or `null`.
 *
 * Bounded and scalar: indices and counts only, never turn text, never a
 * character id, never a url.
 */
export function describeTurnIdViolation(
  report: CanonicalTurnIdReport,
): string | null {
  if (report.ok) return null;
  const parts: string[] = [];
  if (report.missingIdx.length > 0) parts.push(`missing=[${report.missingIdx.join(',')}]`);
  if (report.invalidIdx.length > 0) parts.push(`invalid=[${report.invalidIdx.join(',')}]`);
  if (report.duplicateIdx.length > 0) {
    parts.push(`duplicate=[${report.duplicateIdx.join(',')}]`);
  }
  return `canonical_turn_id_violation:${parts.join(' ')} checked=${report.checked}`;
}

// ── THE FROZEN RUN SNAPSHOT ────────────────────────────────────────────────

export type FrozenTurnIdsState = 'absent' | 'present' | 'malformed';

export type FrozenCanonicalTurnIds =
  | { state: 'absent' }
  | { state: 'present'; ids: string[] }
  | { state: 'malformed'; detail: string };

/**
 * PURE — read the turn identity a completed audio plan froze for its run.
 *
 * FA-4 compares pass identities that came from `audio_plan` against a
 * canonical set. Deriving that set from the mutable `dialog_turns` row means
 * comparing two different moments: a stale client save, or the id-only flag
 * flipping between audio generation and dispatch, moves one side without
 * touching the other. The snapshot removes the second measurement.
 *
 * Three states, and the difference between the first two is the whole point:
 *
 *   absent     the plan predates this contract → the caller keeps its legacy
 *              derivation, unchanged
 *   present    an array, INCLUDING the empty one → this is the authority for
 *              the run. `[]` is a decision, not a gap: it says the run was
 *              built without canonical turn identity, so the turn/pass guard
 *              must stay skipped for it exactly as it was when the plan was
 *              written. Falling back on emptiness would re-open the flag race
 *              this field exists to close.
 *   malformed  present but not an array of usable ids → fail closed. Falling
 *              back here would silently answer a question the plan already
 *              answered wrongly.
 */
export function readFrozenCanonicalTurnIds(
  twoshot: { canonical_turn_ids?: unknown } | null | undefined,
): FrozenCanonicalTurnIds {
  if (!twoshot || typeof twoshot !== 'object') return { state: 'absent' };
  if (!('canonical_turn_ids' in twoshot)) return { state: 'absent' };
  const raw = (twoshot as { canonical_turn_ids?: unknown }).canonical_turn_ids;
  // An explicit null is treated as absent: older writers that spelled "no
  // value" that way never made a statement about the run.
  if (raw === null || raw === undefined) return { state: 'absent' };
  if (!Array.isArray(raw)) {
    return { state: 'malformed', detail: `canonical_turn_ids_not_an_array:${typeof raw}` };
  }
  const ids: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const v = raw[i];
    if (typeof v !== 'string' || !TURN_ID_UUID_RE.test(v.trim())) {
      return { state: 'malformed', detail: `canonical_turn_ids_invalid_at:${i}` };
    }
    const id = v.trim();
    if (ids.includes(id)) {
      return { state: 'malformed', detail: `canonical_turn_ids_duplicate_at:${i}` };
    }
    ids.push(id);
  }
  return { state: 'present', ids };
}

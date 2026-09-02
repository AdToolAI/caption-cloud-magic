/**
 * audioPlanOwnership — V537, who owns which half of `composer_scenes.audio_plan`.
 * =============================================================================
 *
 * `audio_plan` is a jsonb column with two owners, and until now the generic
 * client save behaved as if it had one.
 *
 *   ROOT   `version`, `speakers`, `totalSec`, `interSpeakerGapSec`,
 *          `language`, `generatedAt` — authored by the dialog studio after TTS
 *          and legitimately persisted client → DB.
 *   twoshot  `url`, `segments`, `speakers`, `anchor_identity`,
 *            `strict_identity` and — since V537 — `canonical_turn_ids`.
 *            Authored only by edge functions.
 *
 * `SceneDialogStudio` builds a fresh root plan and pushes it through
 * `onUpdate`, which REPLACES `scene.audioPlan` wholesale. The generic
 * persistence hook then wrote that object to the column, and PostgREST
 * replaces jsonb whole — so a normal dialog edit erased the entire `twoshot`
 * subtree. Not only V537's frozen turn identity: the audio url, the segments,
 * the anchor identity lock.
 *
 * A fresh read alone does not fix it. It is a TOCTOU:
 *
 *   T1  client SELECT sees OLD twoshot
 *   T2  compose-twoshot-audio writes NEW twoshot
 *   T3  client UPDATE writes OLD twoshot back
 *
 * So the merge has to be fenced. `composer_scenes` carries
 * `update_composer_scenes_updated_at BEFORE UPDATE ... FOR EACH ROW`, so every
 * write by anyone stamps `updated_at` — which makes it a complete optimistic
 * token: an intervening write of any kind invalidates it.
 *
 * This module holds the decision; the hook holds the IO.
 */

/** Bounded — three attempts, never a loop that can spin. */
export const MAX_AUDIO_PLAN_CAS_ATTEMPTS = 3;

export type AudioPlanRecord = Record<string, unknown>;

/**
 * What the generic save should do with the `audio_plan` column.
 *
 * `omit` is not a failure: it means the client holds no opinion, so the column
 * must be left exactly as it is rather than written with a guess.
 */
export type AudioPlanWrite =
  | { kind: 'omit'; reason: 'no_local_plan' }
  | { kind: 'write'; audioPlan: AudioPlanRecord; twoshotSource: 'server' | 'local' | 'none' };

const isRecord = (v: unknown): v is AudioPlanRecord =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * PURE — the audio plan a generic client save is allowed to write.
 *
 * Rules:
 *
 *   no local plan            → omit the column entirely. A client that never
 *                              hydrated one has nothing to say about it, and
 *                              writing `null` would erase both halves.
 *   server has `twoshot`     → the server's subtree wins, verbatim. Never
 *                              replaced by `undefined`, by `null`, or by an
 *                              older local copy.
 *   server has no `twoshot`  → whatever the local plan carries is all there
 *                              is; there is no server value to protect.
 *
 * The root fields always come from the local plan — that is the half the
 * client owns, and the dialog studio's timing data must still reach the DB.
 */
export function planAudioPlanWrite(
  localPlan: unknown,
  serverPlan: unknown,
): AudioPlanWrite {
  if (!isRecord(localPlan)) return { kind: 'omit', reason: 'no_local_plan' };

  const local: AudioPlanRecord = { ...localPlan };
  const serverTwoshot = isRecord(serverPlan) ? serverPlan.twoshot : undefined;

  if (serverTwoshot !== undefined && serverTwoshot !== null) {
    return {
      kind: 'write',
      audioPlan: { ...local, twoshot: serverTwoshot },
      twoshotSource: 'server',
    };
  }
  // Nothing on the server to protect. Keep the local subtree if it has one so
  // this merge never DELETES a value it did not have to arbitrate.
  return {
    kind: 'write',
    audioPlan: local,
    twoshotSource: local.twoshot === undefined || local.twoshot === null ? 'none' : 'local',
  };
}

/**
 * PURE — is this CAS token usable?
 *
 * A missing or non-string `updated_at` cannot fence anything, and the caller
 * must then FAIL rather than write. `composer_scenes.updated_at` is NOT NULL
 * DEFAULT now(), so this is a should-not-happen branch — but an unfenced
 * write is precisely what destroys the server's twoshot subtree, so the one
 * thing it must never do is proceed anyway.
 */
export function isUsableCasToken(updatedAt: unknown): updatedAt is string {
  return typeof updatedAt === 'string' && updatedAt.trim().length > 0;
}

export type CasOutcome =
  | { kind: 'applied'; attempts: number; twoshotSource: 'server' | 'local' | 'none' | 'omitted' }
  | { kind: 'exhausted'; attempts: number }
  | { kind: 'error'; message: string };

/**
 * PURE — read one CAS attempt's result.
 *
 * `.update().eq(...).select('id')` returns the rows it actually changed.
 * Supabase does NOT report a zero-row update as an error, so "no error" is
 * not "applied": a CAS miss looks exactly like a success unless the row count
 * is inspected. That distinction is the whole point of the fence.
 */
export function classifyCasAttempt(
  error: { message?: string } | null | undefined,
  rows: unknown,
): 'applied' | 'missed' | 'error' {
  if (error) return 'error';
  if (!Array.isArray(rows)) return 'missed';
  return rows.length > 0 ? 'applied' : 'missed';
}

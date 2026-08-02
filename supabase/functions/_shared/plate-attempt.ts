/**
 * plate-attempt — v375 "Unveränderliche Plate-Generation".
 *
 * Why this exists
 * ---------------
 * v373 introduced `composer_scenes.plate_generation` plus a DB trigger that
 * stamped `plate_ready_generation := plate_generation` whenever a `clip_url`
 * was written. That stamp reads the generation *at write time*, not the
 * generation the render was dispatched under — so this sequence corrupted the
 * contract:
 *
 *   1. plate job dispatched under generation 12
 *   2. user hits "Clip generieren" → hard reset → generation 13
 *   3. the *old* generation-12 job finally calls back
 *   4. trigger stamps its clip as generation 13 → stale plate looks current
 *
 * The fix is to freeze the generation *before* the provider dispatch, in a row
 * that the callback can be matched against. `plate_attempts` is written by the
 * DB trigger `register_plate_attempt` the moment a provider job id lands on the
 * scene, and every generation bump tombstones open attempts via
 * `supersede_plate_attempts` (v376: invalidate logically, clean up physically
 * afterwards).
 *
 * A callback may only write to `composer_scenes` when its own attempt is still
 * the current one. Everything else is `ignored_stale`.
 */

type SupabaseLike = { from: (t: string) => any };

export type PlateAttemptVerdict =
  /** attempt matches the scene's current generation — the write may proceed */
  | "current"
  /** the attempt was tombstoned by a hard reset / newer generation */
  | "superseded"
  /** attempt exists but points at an older generation */
  | "generation_mismatch"
  /** attempt already produced a result — duplicate callback */
  | "already_completed"
  /** no attempt row (pre-v375 job or non-provider route) — do not block */
  | "unregistered"
  /** the scene row is gone */
  | "scene_missing";

export interface PlateAttemptCheck {
  ok: boolean;
  verdict: PlateAttemptVerdict;
  attemptId: string | null;
  expectedGeneration: number | null;
  currentGeneration: number | null;
}

/**
 * Pure decision function — kept separate from IO so it can be unit tested
 * without a database.
 */
export function decidePlateAttempt(input: {
  scene: { plate_generation?: number | null } | null;
  attempt:
    | {
      id: string;
      status: string;
      expected_plate_generation: number;
    }
    | null;
}): PlateAttemptCheck {
  if (!input.scene) {
    return {
      ok: false,
      verdict: "scene_missing",
      attemptId: input.attempt?.id ?? null,
      expectedGeneration: input.attempt?.expected_plate_generation ?? null,
      currentGeneration: null,
    };
  }

  const currentGeneration = Number(input.scene.plate_generation ?? 1);

  if (!input.attempt) {
    // Pre-v375 jobs and routes that never touch `replicate_prediction_id`
    // (upload / stock) have no attempt row. Blocking them would break
    // legitimate work during the migration window.
    return {
      ok: true,
      verdict: "unregistered",
      attemptId: null,
      expectedGeneration: null,
      currentGeneration,
    };
  }

  const expectedGeneration = Number(input.attempt.expected_plate_generation);
  const base = {
    attemptId: input.attempt.id,
    expectedGeneration,
    currentGeneration,
  };

  if (input.attempt.status === "superseded") {
    return { ok: false, verdict: "superseded", ...base };
  }
  if (input.attempt.status === "completed") {
    return { ok: false, verdict: "already_completed", ...base };
  }
  if (expectedGeneration !== currentGeneration) {
    return { ok: false, verdict: "generation_mismatch", ...base };
  }
  return { ok: true, verdict: "current", ...base };
}

/**
 * Reads scene + attempt and decides whether a provider callback is still
 * allowed to write its result onto the scene.
 *
 * Fails OPEN on infrastructure errors (verdict `unregistered`): a database
 * hiccup must not silently drop a legitimate render the user paid for.
 */
export async function checkPlateAttempt(
  supabase: SupabaseLike,
  sceneId: string,
  providerJobId: string | null | undefined,
): Promise<PlateAttemptCheck> {
  let scene: { plate_generation?: number | null } | null = null;
  try {
    const { data } = await supabase
      .from("composer_scenes")
      .select("id, plate_generation")
      .eq("id", sceneId)
      .maybeSingle();
    scene = data ?? null;
  } catch {
    return {
      ok: true,
      verdict: "unregistered",
      attemptId: null,
      expectedGeneration: null,
      currentGeneration: null,
    };
  }

  if (!providerJobId) {
    return decidePlateAttempt({ scene, attempt: null });
  }

  let attempt: any = null;
  try {
    const { data } = await supabase
      .from("plate_attempts")
      .select("id, status, expected_plate_generation")
      .eq("scene_id", sceneId)
      .eq("provider_job_id", providerJobId)
      .maybeSingle();
    attempt = data ?? null;
  } catch {
    attempt = null;
  }

  return decidePlateAttempt({ scene, attempt });
}

/** Marks the attempt as the delivered one. Best effort — never throws. */
export async function completePlateAttempt(
  supabase: SupabaseLike,
  attemptId: string | null,
  clipUrl: string | null,
): Promise<void> {
  if (!attemptId) return;
  try {
    await supabase
      .from("plate_attempts")
      .update({
        status: "completed",
        clip_url: clipUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .eq("status", "rendering");
  } catch {
    /* non-fatal — the generation guard does not depend on this write */
  }
}

/** Marks the attempt as failed so the watchdog does not treat it as open. */
export async function failPlateAttempt(
  supabase: SupabaseLike,
  sceneId: string,
  providerJobId: string | null | undefined,
): Promise<void> {
  if (!providerJobId) return;
  try {
    await supabase
      .from("plate_attempts")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("scene_id", sceneId)
      .eq("provider_job_id", providerJobId)
      .eq("status", "rendering");
  } catch {
    /* non-fatal */
  }
}

/**
 * v376 — logical invalidation for the hard reset. Runs BEFORE any provider
 * cancel or storage purge, so a cancel that silently fails can no longer let a
 * stale result through: the tombstone, not the cancel call, is the wall.
 */
export async function supersedeOpenPlateAttempts(
  supabase: SupabaseLike,
  sceneId: string,
  nextGeneration: number,
): Promise<number> {
  try {
    const { data } = await supabase
      .from("plate_attempts")
      .update({
        status: "superseded",
        superseded_at: new Date().toISOString(),
        superseded_by_generation: nextGeneration,
      })
      .eq("scene_id", sceneId)
      .eq("status", "rendering")
      .select("id");
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

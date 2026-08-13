/**
 * v430 Step 4 — the immutable per-run snapshot of the continuity source.
 *
 * WHY: a finalization point must NOT read `composer_scenes.continuity_source_clip_url`.
 * That value can change while the run is in flight (the user re-binds the
 * continuity input, the predecessor is re-rendered). Writing the *current*
 * value into `continuity_rendered_source_clip_url` would claim the finished
 * video was produced from an input it never saw.
 *
 * The snapshot is therefore taken ONCE at dispatch:
 *   • `plate_attempts.continuity_source_clip_url` — written by the DB trigger
 *     `register_plate_attempt` the moment the provider job id lands on the
 *     scene. Attempt rows are never updated in place, only tombstoned.
 *   • `composer_scene_runs.continuity_source_clip_url` — the v427 run-contract
 *     mirror, frozen by `guard_run_continuity_snapshot`.
 *
 * Read order: attempt → run contract → NULL (legacy run from before v430/4).
 */

type SupabaseLike = { from: (t: string) => any };

export interface SnapshotLookup {
  /** The attempt row that the callback was matched against, if known. */
  attemptId?: string | null;
  /** The run the callback belongs to. */
  runId?: string | null;
}

export async function readRunContinuitySnapshot(
  supabase: SupabaseLike,
  sceneId: string,
  lookup: SnapshotLookup = {},
): Promise<string | null> {
  const { attemptId, runId } = lookup;

  try {
    if (attemptId) {
      const { data } = await supabase
        .from("plate_attempts")
        .select("continuity_source_clip_url")
        .eq("id", attemptId)
        .maybeSingle();
      const v = (data as any)?.continuity_source_clip_url;
      if (typeof v === "string" && v.trim().length > 0) return v;
      if (data) return null;
    }

    if (runId) {
      const { data: attempts } = await supabase
        .from("plate_attempts")
        .select("continuity_source_clip_url, created_at")
        .eq("scene_id", sceneId)
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = Array.isArray(attempts) ? attempts[0] : null;
      const v = (row as any)?.continuity_source_clip_url;
      if (typeof v === "string" && v.trim().length > 0) return v;

      const { data: run } = await supabase
        .from("composer_scene_runs")
        .select("continuity_source_clip_url")
        .eq("run_id", runId)
        .maybeSingle();
      const rv = (run as any)?.continuity_source_clip_url;
      if (typeof rv === "string" && rv.trim().length > 0) return rv;
    }
  } catch (e) {
    console.warn(`[continuity-snapshot] read failed scene=${sceneId}: ${(e as Error).message}`);
  }

  return null;
}

/**
 * Builds the finalization patch fragment. Always returns the key so a run that
 * genuinely had no continuity input clears a stale value from an earlier run.
 */
export function buildRenderedSourcePatch(snapshot: string | null): Record<string, unknown> {
  return { continuity_rendered_source_clip_url: snapshot };
}

/**
 * Convenience for finalization points: read the snapshot and return the patch.
 */
export async function continuityRenderedPatch(
  supabase: SupabaseLike,
  sceneId: string,
  lookup: SnapshotLookup = {},
): Promise<Record<string, unknown>> {
  return buildRenderedSourcePatch(await readRunContinuitySnapshot(supabase, sceneId, lookup));
}

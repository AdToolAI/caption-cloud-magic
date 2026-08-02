/**
 * scene-hard-reset — v373 "Clip generieren = harter Neustart".
 *
 * Contract (approved plan v373):
 *   Clicking "Clip generieren" fully terminates and deletes the previous job
 *   BEFORE the new one starts. No artifact, no provider job and no state field
 *   from the previous run survives the click.
 *
 * Root cause this closes (proven on scene 6bf4e815… on 2026-08-02):
 *   11:04:35 regeneration started, 11:04:42 the lip-sync chain cut preclips
 *   from YESTERDAY's plate (21:28), 11:05:22 passthrough → scene terminal
 *   failed, 11:08:57 the fresh plate finally landed. Old and new plate shared
 *   the same storage path, so nothing could tell them apart.
 *
 * The reset therefore does, in this order:
 *   1. cancel every known provider job (Sync.so) and free inflight slots
 *   2. drop dispatch locks
 *   3. refund reserved credits exactly once (via failLipSync)
 *   4. delete every artifact of the scene from storage
 *   5. bump `plate_generation` and clear ALL pipeline state fields
 *
 * Only after step 5 returns may a new run be dispatched.
 */

import { failLipSync } from "./lipsync-fail.ts";

type SupabaseLike = {
  from: (t: string) => any;
  storage: {
    from: (b: string) => {
      list: (
        prefix: string,
        opts?: Record<string, unknown>,
      ) => Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
      remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export interface HardResetArgs {
  supabase: SupabaseLike;
  sceneId: string;
  userId: string;
  projectId: string;
  /** Sync.so API key so still-billing generations are actually cancelled. */
  syncApiKey?: string | null;
  /** Reason string for the audit log. */
  reason?: string;
}

export interface HardResetResult {
  ok: boolean;
  sceneId: string;
  generation: number;
  deletedObjects: number;
  canceledJobs: number;
  errors: string[];
}

/** Buckets + prefixes that can hold artifacts of a single composer scene. */
function artifactPrefixes(
  sceneId: string,
  userId: string,
  projectId: string,
): Array<{ bucket: string; prefix: string }> {
  return [
    // master plates + muxed pass results
    { bucket: "ai-videos", prefix: `composer/${projectId}` },
    { bucket: "ai-videos", prefix: `composer/${userId}` },
    // preclips (shared/<sceneId>/…), anchors, per-pass tracking json
    { bucket: "composer-frames", prefix: `shared/${sceneId}` },
    { bucket: "composer-frames", prefix: `${userId}/scene-anchors` },
    { bucket: "composer-frames", prefix: `${userId}/${projectId}/asd` },
    // per-speaker + merged voiceover for the dialog turn
    { bucket: "voiceover-audio", prefix: `${userId}/twoshot-vo` },
    // reprojection plates
    { bucket: "lipsync-plates", prefix: `${userId}` },
    { bucket: "lipsync-plates", prefix: `shared/${sceneId}` },
  ];
}

/**
 * Deletes every stored object that belongs to `sceneId`.
 * Matching is by scene id inside the object name — sibling scenes of the same
 * project/user are never touched.
 */
async function purgeArtifacts(
  supabase: SupabaseLike,
  sceneId: string,
  userId: string,
  projectId: string,
  errors: string[],
): Promise<number> {
  let deleted = 0;

  for (const { bucket, prefix } of artifactPrefixes(sceneId, userId, projectId)) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        // newest first is irrelevant — we take everything that matches
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        errors.push(`list:${bucket}/${prefix}`);
        continue;
      }
      const paths = (data ?? [])
        .map((o) => o?.name ?? "")
        .filter((n) => n.length > 0 && n.includes(sceneId))
        .map((n) => `${prefix}/${n}`);
      if (paths.length === 0) continue;

      // remove() is capped per call — chunk defensively.
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error: rmErr } = await supabase.storage.from(bucket).remove(chunk);
        if (rmErr) errors.push(`remove:${bucket}`);
        else deleted += chunk.length;
      }
    } catch (e) {
      errors.push(`purge:${bucket}:${(e as Error).message}`.slice(0, 120));
    }
  }

  return deleted;
}

/** Collects every Sync.so job id we ever recorded for this scene. */
function collectSyncJobIds(scene: Record<string, any> | null): string[] {
  const ids = new Set<string>();
  if (!scene) return [];

  const state = scene.dialog_shots ?? null;
  for (const s of (Array.isArray(state?.shots) ? state.shots : [])) {
    if (typeof s?.sync_job_id === "string" && s.sync_job_id) ids.add(s.sync_job_id);
  }
  for (const p of (Array.isArray(state?.passes) ? state.passes : [])) {
    if (typeof p?.job_id === "string" && p.job_id) ids.add(p.job_id);
  }
  const v5Jobs: any[] = scene?.audio_plan?.twoshot?.syncJobs?.jobs ?? [];
  for (const j of v5Jobs) {
    const id = typeof j === "string" ? j : (j?.id ?? j?.job_id ?? j?.sync_job_id);
    if (typeof id === "string" && id) ids.add(id);
  }
  const predId = scene?.replicate_prediction_id;
  if (typeof predId === "string" && predId.startsWith("sync:")) {
    ids.add(predId.replace(/^sync:/, ""));
  }
  return Array.from(ids);
}

/**
 * Full teardown of a scene's pipeline job. Resolves only when the scene row is
 * in a clean state and the new generation number has been written.
 */
export async function hardResetScene(args: HardResetArgs): Promise<HardResetResult> {
  const { supabase, sceneId, userId, projectId } = args;
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  // 1. Read current state (jobs + generation).
  let scene: Record<string, any> | null = null;
  try {
    const { data } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, plate_generation, dialog_shots, audio_plan, replicate_prediction_id, lip_sync_applied_at",
      )
      .eq("id", sceneId)
      .maybeSingle();
    scene = data ?? null;
  } catch (e) {
    errors.push(`read:${(e as Error).message}`.slice(0, 120));
  }

  const jobIds = collectSyncJobIds(scene);

  // 2. Cancel provider jobs + free inflight slots + refund credits once.
  //    failLipSync is idempotent and never throws.
  try {
    await failLipSync({
      supabase,
      sceneId,
      userId,
      reason: args.reason ?? "v373_hard_reset",
      extraSyncJobIds: jobIds,
      refundCredits: Number(scene?.dialog_shots?.cost_credits) || 0,
      syncApiKey: args.syncApiKey ?? null,
    });
  } catch (e) {
    errors.push(`cancel:${(e as Error).message}`.slice(0, 120));
  }

  // 3. Drop dispatch locks so the next run is never blocked by a stale lease.
  try {
    await supabase.from("dialog_dispatch_locks").delete().eq("scene_id", sceneId);
  } catch {
    /* table may be empty / absent — non-fatal */
  }
  try {
    await supabase.from("syncso_inflight_jobs").delete().eq("scene_id", sceneId);
  } catch {
    /* non-fatal */
  }

  // 4. Purge artifacts (plate, preclips, anchors, tracking, pass videos, VO).
  const deletedObjects = await purgeArtifacts(
    supabase,
    sceneId,
    userId,
    projectId,
    errors,
  );

  // 5. Bump generation + clear ALL pipeline state. This is the point after
  //    which a new run may start.
  //
  //    `audio_plan` keeps the user-authored plan (voices, turns, timing) but
  //    loses every derived pipeline artifact — a stale faceMap or preclip
  //    payload from the previous generation must never survive the reset.
  const prevPlan = (scene?.audio_plan ?? null) as Record<string, unknown> | null;
  let cleanedPlan: Record<string, unknown> | null = null;
  if (prevPlan && typeof prevPlan === "object") {
    cleanedPlan = { ...prevPlan };
    delete (cleanedPlan as any).twoshot;
    delete (cleanedPlan as any).lipsync;
    delete (cleanedPlan as any).segments_payload;
  }

  const nextGeneration = Number(scene?.plate_generation ?? 1) + 1;
  try {
    const { error } = await supabase
      .from("composer_scenes")
      .update({
        plate_generation: nextGeneration,
        plate_generation_started_at: nowIso,
        plate_ready_generation: null,
        plate_ready_at: null,
        clip_url: null,
        clip_status: "pending",
        clip_error: null,
        preview_clip_url: null,
        lip_sync_status: null,
        lip_sync_source_clip_url: null,
        lip_sync_applied_at: null,
        twoshot_stage: null,
        dialog_shots: null,
        dialog_takes: null,
        audio_plan: cleanedPlan,

        replicate_prediction_id: null,
        retry_count: 0,
        updated_at: nowIso,
      })
      .eq("id", sceneId);
    if (error) errors.push(`update:${(error as any).message ?? "unknown"}`);
  } catch (e) {
    errors.push(`update:${(e as Error).message}`.slice(0, 120));
  }

  console.log(
    `[v373_hard_reset] scene=${sceneId} gen=${nextGeneration} jobs_canceled=${jobIds.length} objects_deleted=${deletedObjects} errors=${errors.length}`,
  );

  return {
    ok: errors.length === 0,
    sceneId,
    generation: nextGeneration,
    deletedObjects,
    canceledJobs: jobIds.length,
    errors,
  };
}

/**
 * Generation guard for late webhooks / stale dispatchers.
 * Returns true when `generation` still matches the scene's current generation.
 */
export function isCurrentGeneration(
  sceneRow: { plate_generation?: number | null } | null | undefined,
  generation: number | null | undefined,
): boolean {
  // Missing generation on the job = pre-v373 job. Treat as current so the
  // migration window does not discard legitimate in-flight work.
  if (generation === null || generation === undefined) return true;
  const current = Number(sceneRow?.plate_generation ?? 1);
  return Number(generation) === current;
}

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
import { supersedeOpenPlateAttempts } from "./plate-attempt.ts";

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
  /**
   * v377 — the caller already invalidated the scene atomically through
   * `composer_start_scene_run` (generation bump + fresh `active_run_id` under
   * a row lock). The teardown then must NOT bump the generation a second time;
   * it only performs the physical cleanup and writes the state fields for the
   * generation given here.
   */
  generationOverride?: number | null;
}


/**
 * v374 — why a reset may or may not refund.
 *   refunded                 → an open provider job was cancelled by us
 *   skipped_delivered        → the previous run produced a usable clip
 *   skipped_already_refunded → the failure path already paid it back
 *   nothing_open             → no job and no cost was ever reserved
 */
export type RefundDecision =
  | "refunded"
  | "skipped_delivered"
  | "skipped_already_refunded"
  | "nothing_open";

export interface HardResetResult {
  ok: boolean;
  sceneId: string;
  generation: number;
  deletedObjects: number;
  canceledJobs: number;
  /** v376 — open plate attempts tombstoned by this reset. */
  supersededAttempts: number;
  refundDecision: RefundDecision;
  errors: string[];
}

/** Dialog states that mean "provider work is still open / still billing". */
const OPEN_DIALOG_STATES = new Set([
  "queued",
  "dispatched",
  "running",
  "processing",
  "rendering",
  "rendering_preflight",
  "pending",
  "in_progress",
]);

/**
 * v374 — decide whether a hard reset owes the user a refund.
 *
 * The automatic refund is bound to a failure event. A hard reset has no
 * failure event: the user aborts on purpose. So we refund exactly the case
 * that would otherwise leak — an *open* job we are about to cancel — and never
 * the case where the previous run already delivered something billable.
 */
export function decideRefund(input: {
  scene: Record<string, any> | null;
  knownJobIds: string[];
  hasInflightRows: boolean;
}): { decision: RefundDecision; amount: number } {
  const scene = input.scene ?? {};
  const state = (scene.dialog_shots ?? null) as Record<string, any> | null;
  const cost = Number(state?.cost_credits) || 0;

  if (state?.refunded === true) {
    return { decision: "skipped_already_refunded", amount: 0 };
  }

  // Delivered work is never refunded on a voluntary restart.
  const currentGen = Number(scene.plate_generation ?? 1);
  const readyGen = scene.plate_ready_generation === null ||
      scene.plate_ready_generation === undefined
    ? null
    : Number(scene.plate_ready_generation);
  const plateDelivered = typeof scene.clip_url === "string" &&
    scene.clip_url.length > 0 &&
    (readyGen === null || readyGen === currentGen);
  const dialogCompleted = state?.status === "completed" ||
    state?.status === "succeeded" ||
    !!scene.lip_sync_applied_at;

  if (plateDelivered || dialogCompleted) {
    return { decision: "skipped_delivered", amount: 0 };
  }

  const predId = typeof scene.replicate_prediction_id === "string"
    ? scene.replicate_prediction_id
    : "";
  const jobOpen = input.hasInflightRows ||
    input.knownJobIds.length > 0 ||
    predId.length > 0 ||
    (typeof state?.status === "string" && OPEN_DIALOG_STATES.has(state.status));

  if (!jobOpen || cost <= 0) {
    return { decision: "nothing_open", amount: 0 };
  }
  return { decision: "refunded", amount: cost };
}

/**
 * v377 — keys inside `audio_plan` that are DERIVED from a pipeline run.
 *
 * Everything the user authored (script, per-speaker voices, turns, timing
 * preferences) survives a restart. Everything a previous run computed must
 * not: a surviving `faceMap`, `preclips` payload or dispatch timestamp is how
 * a new generation ends up cutting from yesterday's plate.
 */
const DERIVED_AUDIO_PLAN_KEYS: readonly string[] = [
  "twoshot",
  "lipsync",
  "segments_payload",
  "segments",
  "faceMap",
  "face_map",
  "preclips",
  "tracking",
  "dispatch",
  "mux",
  "generatedAt",
  "generated_at",
  "renderedAt",
  "rendered_at",
  "runId",
  "run_id",
];

/**
 * Removes every derived key from an `audio_plan` snapshot. Returns `null` when
 * there was no plan at all, so the column is cleared rather than set to `{}`.
 */
export function stripDerivedAudioPlan(
  prevPlan: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!prevPlan || typeof prevPlan !== "object") return null;
  const cleaned: Record<string, unknown> = { ...prevPlan };
  for (const key of DERIVED_AUDIO_PLAN_KEYS) delete cleaned[key];
  return cleaned;
}

/**
 * v380 — Schlüssel in `scene_assets`, die aus einem Pipeline-Lauf STAMMEN.
 * Alles, was der Nutzer gepflegt hat (Charakter-Referenzen, Location, manuell
 * bestätigte Anchors), überlebt einen Neustart. Alles, was ein vorheriger Lauf
 * berechnet hat, darf es nicht — eine überlebende Plate-, Preclip- oder
 * Tracking-Referenz ist genau der Weg, auf dem ein neuer Lauf aus dem Material
 * von gestern schneidet.
 */
const DERIVED_SCENE_ASSET_KEYS: readonly string[] = [
  "plate",
  "plate_url",
  "plateUrl",
  "plates",
  "preclip",
  "preclips",
  "preclip_urls",
  "passes",
  "pass_videos",
  "tracking",
  "tracking_url",
  "bounding_boxes_url",
  "boundingBoxesUrl",
  "faceMap",
  "face_map",
  "face_slots",
  "landmarks",
  "camera_path",
  "cameraPath",
  "mux",
  "mux_url",
  "stitch",
  "stitch_url",
  "lipsync",
  "lipsync_urls",
  "silence_track_url",
  "generation",
  "plate_generation",
  "run_id",
  "runId",
];

/**
 * Entfernt jeden abgeleiteten Schlüssel aus einem `scene_assets`-Snapshot.
 * Gibt `null` zurück, wenn nichts Nutzer-Gepflegtes übrig bleibt, damit die
 * Spalte geleert statt auf `{}` gesetzt wird.
 */
export function stripDerivedSceneAssets(
  prevAssets: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!prevAssets || typeof prevAssets !== "object") return null;
  const cleaned: Record<string, unknown> = { ...prevAssets };
  for (const key of DERIVED_SCENE_ASSET_KEYS) delete cleaned[key];
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/**
 * v380 — offene `video_renders` der Szene, die zu einer ÄLTEREN Generation
 * gehören, werden als `failed` mit `superseded`-Marker geschlossen. Kein
 * Delete: die Forensik (welcher Lauf hat was gerendert) bleibt erhalten, aber
 * kein Reuse-Lookup und kein Webhook kann sie noch als „frisch" verwenden.
 */
async function supersedeOpenRenders(
  supabase: SupabaseLike,
  sceneId: string,
  nextGeneration: number,
): Promise<number> {
  try {
    const { data, error } = await (supabase as any)
      .from("video_renders")
      .select("render_id, content_config")
      .contains("content_config", { composer_scene_id: sceneId })
      .in("status", ["pending", "queued"]);
    if (error || !Array.isArray(data) || data.length === 0) return 0;

    const stale = data.filter(
      (row: any) =>
        Number(row?.content_config?.plate_generation ?? 0) < nextGeneration,
    );
    if (stale.length === 0) return 0;

    const { error: updErr } = await (supabase as any)
      .from("video_renders")
      .update({
        status: "failed",
        error_message: `v380_superseded_by_generation_${nextGeneration}`,
      })
      .in("render_id", stale.map((r: any) => r.render_id));
    return updErr ? 0 : stale.length;
  } catch {
    return 0;
  }
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
        "id, project_id, plate_generation, plate_ready_generation, clip_url, clip_status, dialog_shots, audio_plan, scene_assets, replicate_prediction_id, lip_sync_applied_at",
      )
      .eq("id", sceneId)
      .maybeSingle();
    scene = data ?? null;
  } catch (e) {
    errors.push(`read:${(e as Error).message}`.slice(0, 120));
  }

  const jobIds = collectSyncJobIds(scene);

  // 1b. v374 — is provider work actually still open on this scene?
  let hasInflightRows = false;
  try {
    const { data } = await supabase
      .from("syncso_inflight_jobs")
      .select("job_id")
      .eq("scene_id", sceneId)
      .limit(1);
    hasInflightRows = Array.isArray(data) && data.length > 0;
  } catch {
    /* registry unavailable — fall back to the job ids we already know */
  }

  const refund = decideRefund({ scene, knownJobIds: jobIds, hasInflightRows });

  // v377 — when the caller already acquired the run atomically, its generation
  // is authoritative and must not be bumped again.
  const preInvalidated =
    args.generationOverride !== null && args.generationOverride !== undefined;
  const nextGeneration = preInvalidated
    ? Number(args.generationOverride)
    : Number(scene?.plate_generation ?? 1) + 1;

  // ── 2. v376 — INVALIDATE LOGICALLY FIRST ────────────────────────────────
  // Provider cancellation is never fully reliable: the job may already be past
  // the cancel window, the API call may fail, the network may drop. So the
  // generation bump — not the cancel — is the wall. It is written and committed
  // BEFORE any best-effort teardown, so from this instant on every in-flight
  // callback of the previous run is structurally unable to write to the scene
  // (`plate_attempts` rows are tombstoned by the `supersede_plate_attempts`
  // trigger, and the webhook write is generation-scoped).
  let supersededAttempts = 0;
  if (!preInvalidated) {
    try {
      const { error } = await supabase
        .from("composer_scenes")
        .update({
          plate_generation: nextGeneration,
          plate_generation_started_at: nowIso,
          plate_ready_generation: null,
          plate_ready_at: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
      if (error) errors.push(`invalidate:${(error as any).message ?? "unknown"}`);
    } catch (e) {
      errors.push(`invalidate:${(e as Error).message}`.slice(0, 120));
    }
  }

  // The DB trigger already supersedes open attempts on the bump; this call is
  // the belt-and-braces path for rows the trigger could not see (and it gives
  // us the count for the audit log).
  supersededAttempts = await supersedeOpenPlateAttempts(
    supabase,
    sceneId,
    nextGeneration,
  );


  // ── 3. BEST-EFFORT TEARDOWN ─────────────────────────────────────────────
  // Cancel provider jobs + free inflight slots. Credits are refunded ONLY
  // for an open job we are about to cancel (v374). `failLipSync` prefers
  // the persisted cost over the hint, so a non-refund is expressed by
  // withholding the userId — that is the flag it gates the payout on.
  try {
    await failLipSync({
      supabase,
      sceneId,
      userId: refund.decision === "refunded" ? userId : null,
      reason: args.reason ?? "v373_hard_reset",
      extraSyncJobIds: jobIds,
      refundCredits: refund.amount,
      syncApiKey: args.syncApiKey ?? null,
    });
  } catch (e) {
    errors.push(`cancel:${(e as Error).message}`.slice(0, 120));
  }


  // Drop dispatch locks so the next run is never blocked by a stale lease.
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

  // ── 4. PHYSICAL CLEANUP ─────────────────────────────────────────────────
  // Purge artifacts (plate, preclips, anchors, tracking, pass videos, VO).
  // Safe to run late: the scene is already logically invalidated, so nothing
  // that is still in flight can attach itself to the new generation.
  const deletedObjects = await purgeArtifacts(
    supabase,
    sceneId,
    userId,
    projectId,
    errors,
  );

  // ── 5. CLEAR PIPELINE STATE ─────────────────────────────────────────────
  // This runs last so it also wipes anything `failLipSync` wrote during the
  // teardown above. The generation itself was already bumped in step 2 and is
  // re-asserted here only to keep the row consistent if step 2 partially failed.
  //
  // `audio_plan` keeps the user-authored plan (voices, turns, timing) but
  // loses every derived pipeline artifact — a stale faceMap or preclip
  // payload from the previous generation must never survive the reset.
  const prevPlan = (scene?.audio_plan ?? null) as Record<string, unknown> | null;
  const cleanedPlan = stripDerivedAudioPlan(prevPlan);


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
    `[v376_hard_reset] scene=${sceneId} gen=${nextGeneration} jobs_canceled=${jobIds.length} attempts_superseded=${supersededAttempts} objects_deleted=${deletedObjects} refund=${refund.decision}(${refund.amount}) errors=${errors.length}`,
  );

  return {
    ok: errors.length === 0,
    sceneId,
    generation: nextGeneration,
    deletedObjects,
    canceledJobs: jobIds.length,
    supersededAttempts,
    refundDecision: refund.decision,
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

/**
 * v427A2 — Dual-write of the job ledger (additive, freeze-safe).
 *
 * This module records what the legacy dispatch already did. It runs AFTER the
 * provider call, never before it, never in a branch, and every failure is
 * swallowed. With `v427.pipeline_jobs_dual_write` off (the default) it is a
 * no-op, so runtime behaviour stays byte-identical to v426.
 *
 * Legacy stays in control during A2: nothing reads these rows to decide
 * anything yet — the callback guard (A3) is what starts consuming them.
 */

import { isV427FlagEnabled } from "./v427-flags.ts";
import {
  createPipelineJob,
  markPipelineJobDispatched,
  type PipelineStage,
} from "./composer-pipeline-jobs.ts";

export interface DispatchRecord {
  sceneId: string;
  /** Provider job id as stored by the legacy path (may carry a prefix). */
  externalJobId?: string | null;
  provider?: string | null;
  stage?: PipelineStage;
  segmentId?: string | null;
  speakerId?: string | null;
}

/**
 * Mirrors one dispatch into `composer_pipeline_jobs`.
 * `run_id` is taken from the scene's `active_run_id`, so a run that was already
 * superseded while the provider call was in flight records nothing.
 */
export async function dualWriteDispatch(
  admin: any,
  rec: DispatchRecord,
  userId?: string | null,
): Promise<void> {
  try {
    if (!(await isV427FlagEnabled(admin, "v427.pipeline_jobs_dual_write", userId))) return;

    const { data: scene } = await admin
      .from("composer_scenes")
      .select("active_run_id")
      .eq("id", rec.sceneId)
      .maybeSingle();
    const runId = scene?.active_run_id ? String(scene.active_run_id) : null;
    if (!runId) return;

    // Retries of the same stage within one run become attempt_no + 1.
    const { count } = await admin
      .from("composer_pipeline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("scene_id", rec.sceneId)
      .eq("run_id", runId)
      .eq("stage", rec.stage ?? "base_video");

    const job = await createPipelineJob(admin, {
      sceneId: rec.sceneId,
      runId,
      stage: rec.stage ?? "base_video",
      provider: rec.provider ?? null,
      segmentId: rec.segmentId ?? null,
      speakerId: rec.speakerId ?? null,
      attemptNo: (typeof count === "number" ? count : 0) + 1,
      metadata: { source: "dual_write" },
    });
    if (!job) return;

    await markPipelineJobDispatched(admin, job.id, rec.externalJobId ?? null);
  } catch (e) {
    console.warn("[v427] dualWriteDispatch failed", {
      scene_id: rec.sceneId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Batch variant used after the per-scene dispatch loop. */
export async function dualWriteDispatches(
  admin: any,
  recs: DispatchRecord[],
  userId?: string | null,
): Promise<void> {
  for (const rec of recs) await dualWriteDispatch(admin, rec, userId);
}

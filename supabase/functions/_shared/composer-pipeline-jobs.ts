/**
 * v427A — Pipeline job ledger (additive, freeze-safe).
 *
 * One row in `composer_pipeline_jobs` per asynchronous stage of a scene run.
 * The row's own `id` is the PRIMARY callback identity; the provider's
 * `external_job_id` is an additional confirmation, never the only proof.
 *
 * Two deliberately different operations (see the v427 spec):
 *
 *   assertActivePipelineJob()  — pollers / internal workers. Validates run +
 *                                job and refreshes the heartbeat. Consumes
 *                                NOTHING, so `modelark-poll` can validate and
 *                                `compose-clip-webhook` can still claim the
 *                                one completion event afterwards.
 *   claimPipelineCallback()    — real or synthesised completion events only.
 *                                Claims idempotently with a short lease so a
 *                                crashed handler cannot wedge the job.
 *
 * Freeze contract: this module never touches framing, masks, payloads,
 * thresholds or timing. It only decides "may this write proceed at all".
 */

import { V427_RUN_CONTRACT_VERSION } from "./v427-flags.ts";

export type PipelineStage =
  | "base_video"
  | "audio_plan"
  | "tts"
  | "preclip"
  | "sync_segment"
  | "audio_mux"
  | "final_render";

export type PipelineJobStatus =
  | "pending"
  | "dispatching"
  | "dispatched"
  | "running"
  | "callback_processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stale"
  | "dispatch_uncertain";

export const NON_TERMINAL_STATUSES: PipelineJobStatus[] = [
  "pending",
  "dispatching",
  "dispatched",
  "running",
  "callback_processing",
];

export const TERMINAL_STATUSES: PipelineJobStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
  "stale",
];

/** v427A3+ — callback delivery lifecycle, separate from the job lifecycle. */
export type CallbackDeliveryStatus =
  | "received"
  | "processing"
  | "succeeded"
  | "failed_redeliverable";

export type RejectReason =
  | "stale_callback"
  | "duplicate_callback"
  | "wrong_run"
  | "wrong_job"
  | "already_terminal"
  | "claim_locked"
  | "job_missing";

export const CLAIM_LEASE_MS = 5 * 60_000;

export interface PipelineJobRow {
  id: string;
  scene_id: string;
  run_id: string;
  stage: PipelineStage;
  segment_id: string | null;
  attempt_no: number;
  status: PipelineJobStatus;
  callback_delivery_status: CallbackDeliveryStatus | null;
  external_job_id: string | null;
  [k: string]: unknown;
}

export interface CallbackIdentity {
  sceneId: string;
  runId: string;
  stage: PipelineStage;
  pipelineJobId?: string | null;
  attemptNo?: number | null;
  segmentId?: string | null;
  externalJobId?: string | null;
}

export interface GateResult {
  ok: boolean;
  reason?: RejectReason;
  job?: PipelineJobRow;
  claimToken?: string;
}

export function buildIdempotencyKey(id: CallbackIdentity & { attemptNo?: number | null }): string {
  return [
    id.sceneId,
    id.runId,
    id.stage,
    id.segmentId ?? "-",
    String(id.attemptNo ?? 1),
  ].join(":");
}

/**
 * Creates the local job row BEFORE the provider is called, so a very fast
 * callback always finds its identity in the database.
 * Returns the row (its `id` goes into the webhook URL / provider metadata).
 */
export async function createPipelineJob(
  admin: any,
  params: {
    sceneId: string;
    runId: string;
    stage: PipelineStage;
    provider?: string | null;
    segmentId?: string | null;
    speakerId?: string | null;
    attemptNo?: number;
    payloadHash?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<PipelineJobRow | null> {
  const attempt_no = params.attemptNo ?? 1;
  const idempotency_key = buildIdempotencyKey({
    sceneId: params.sceneId,
    runId: params.runId,
    stage: params.stage,
    segmentId: params.segmentId ?? null,
    attemptNo: attempt_no,
  });

  const { data, error } = await admin
    .from("composer_pipeline_jobs")
    .upsert(
      {
        scene_id: params.sceneId,
        run_id: params.runId,
        run_contract_version: V427_RUN_CONTRACT_VERSION,
        stage: params.stage,
        segment_id: params.segmentId ?? null,
        speaker_id: params.speakerId ?? null,
        attempt_no,
        provider: params.provider ?? null,
        idempotency_key,
        status: "dispatching",
        payload_hash: params.payloadHash ?? null,
        started_at: new Date().toISOString(),
        metadata: params.metadata ?? {},
      },
      { onConflict: "idempotency_key", ignoreDuplicates: false },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[v427] createPipelineJob failed", { stage: params.stage, error: error.message });
    return null;
  }
  return data as PipelineJobRow;
}

/**
 * After the provider responded. Never moves the status backwards — a callback
 * that already advanced the job keeps its state.
 */
export async function markPipelineJobDispatched(
  admin: any,
  jobId: string,
  externalJobId: string | null,
): Promise<void> {
  const { error } = await admin.rpc("composer_pipeline_job_mark_dispatched", {
    _job_id: jobId,
    _external_job_id: externalJobId,
  }).then((r: any) => r, (e: any) => ({ error: e }));

  if (!error) return;

  // RPC not present (Phase A1 ships the helper before the SQL function):
  // fall back to a guarded update that cannot move the status backwards.
  const { data: current } = await admin
    .from("composer_pipeline_jobs")
    .select("status, external_job_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!current) return;
  const patch: Record<string, unknown> = {
    external_job_id: current.external_job_id ?? externalJobId,
  };
  if (current.status === "dispatching") patch.status = "dispatched";
  await admin.from("composer_pipeline_jobs").update(patch).eq("id", jobId);
}

export async function markPipelineJobUncertain(
  admin: any,
  jobId: string,
  errorCode: string,
): Promise<void> {
  await admin
    .from("composer_pipeline_jobs")
    .update({ status: "dispatch_uncertain", error_code: errorCode })
    .eq("id", jobId)
    .in("status", ["pending", "dispatching", "dispatched", "running"]);
}

async function loadJob(admin: any, id: CallbackIdentity): Promise<PipelineJobRow | null> {
  let q = admin
    .from("composer_pipeline_jobs")
    .select("*")
    .eq("scene_id", id.sceneId)
    .eq("run_id", id.runId)
    .eq("stage", id.stage);
  if (id.pipelineJobId) q = q.eq("id", id.pipelineJobId);
  if (id.segmentId) q = q.eq("segment_id", id.segmentId);
  if (id.attemptNo != null) q = q.eq("attempt_no", id.attemptNo);
  const { data } = await q.order("attempt_no", { ascending: false }).limit(1).maybeSingle();
  return (data as PipelineJobRow) ?? null;
}

async function sceneRunMatches(admin: any, sceneId: string, runId: string): Promise<boolean> {
  const { data } = await admin
    .from("composer_scenes")
    .select("active_run_id")
    .eq("id", sceneId)
    .maybeSingle();
  return !!data && String(data.active_run_id ?? "") === String(runId);
}

/**
 * Non-consuming validation for pollers and internal workers.
 * Refreshes the heartbeat so provider-aware leases stay alive.
 */
export async function assertActivePipelineJob(
  admin: any,
  id: CallbackIdentity,
): Promise<GateResult> {
  if (!(await sceneRunMatches(admin, id.sceneId, id.runId))) {
    return { ok: false, reason: "wrong_run" };
  }
  const job = await loadJob(admin, id);
  if (!job) return { ok: false, reason: "job_missing" };
  if (id.externalJobId && job.external_job_id && job.external_job_id !== id.externalJobId) {
    return { ok: false, reason: "wrong_job" };
  }
  if (TERMINAL_STATUSES.includes(job.status)) {
    return { ok: false, reason: "already_terminal", job };
  }
  await admin
    .from("composer_pipeline_jobs")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("run_id", id.runId);
  return { ok: true, job };
}

/**
 * Consuming claim for completion events. Idempotent: a duplicate delivery of a
 * finished job is a no-op, a crashed handler's lease expires and can be retaken.
 *
 * v427A3+ also tracks the callback delivery lifecycle:
 *   received            — callback arrived (set explicitly by receivePipelineCallback)
 *   processing          — claim acquired, business logic running
 *   succeeded           — business logic completed
 *   failed_redeliverable — business logic failed but the provider may redeliver
 */
export async function claimPipelineCallback(
  admin: any,
  id: CallbackIdentity,
): Promise<GateResult> {
  if (!(await sceneRunMatches(admin, id.sceneId, id.runId))) {
    return { ok: false, reason: "wrong_run" };
  }
  const job = await loadJob(admin, id);
  if (!job) return { ok: false, reason: "job_missing" };
  if (id.externalJobId && job.external_job_id && job.external_job_id !== id.externalJobId) {
    return { ok: false, reason: "wrong_job" };
  }
  if (TERMINAL_STATUSES.includes(job.status)) {
    return { ok: false, reason: "duplicate_callback", job };
  }
  if (job.callback_delivery_status === "succeeded") {
    return { ok: false, reason: "duplicate_callback", job };
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const patch: Record<string, unknown> = {
    status: "callback_processing",
    callback_delivery_status: "processing",
    callback_claim_token: token,
    callback_claimed_at: now.toISOString(),
    callback_claim_expires_at: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
  };
  if (id.externalJobId && !job.external_job_id) patch.external_job_id = id.externalJobId;

  let q = admin
    .from("composer_pipeline_jobs")
    .update(patch)
    .eq("id", job.id)
    .eq("run_id", id.runId)
    .in("status", NON_TERMINAL_STATUSES);

  // Free lease OR expired lease — a live claim by another handler blocks us.
  // A failed_redeliverable delivery is also free to reclaim.
  q = q.or(`callback_claim_expires_at.is.null,callback_claim_expires_at.lt.${now.toISOString()}`);

  const { data } = await q.select().maybeSingle();
  if (!data) return { ok: false, reason: "claim_locked", job };
  return { ok: true, job: data as PipelineJobRow, claimToken: token };
}

/** Optional explicit receive step. Most callers use claimPipelineCallback directly. */
export async function receivePipelineCallback(
  admin: any,
  id: CallbackIdentity,
): Promise<GateResult> {
  if (!(await sceneRunMatches(admin, id.sceneId, id.runId))) {
    return { ok: false, reason: "wrong_run" };
  }
  const job = await loadJob(admin, id);
  if (!job) return { ok: false, reason: "job_missing" };
  if (id.externalJobId && job.external_job_id && job.external_job_id !== id.externalJobId) {
    return { ok: false, reason: "wrong_job" };
  }
  if (job.callback_delivery_status === "succeeded" || TERMINAL_STATUSES.includes(job.status)) {
    return { ok: false, reason: "duplicate_callback", job };
  }

  await admin
    .from("composer_pipeline_jobs")
    .update({ callback_delivery_status: "received" })
    .eq("id", job.id)
    .eq("run_id", id.runId)
    .in("status", NON_TERMINAL_STATUSES);

  return { ok: true, job };
}

export async function completePipelineJob(
  admin: any,
  jobId: string,
  outcome: "succeeded" | "failed" | "failed_redeliverable",
  errorCode?: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  if (outcome === "failed_redeliverable") {
    // Release the claim so a provider redelivery can try again.
    // The job itself stays non-terminal because the provider job is done;
    // only our processing failed.
    await admin
      .from("composer_pipeline_jobs")
      .update({
        callback_delivery_status: "failed_redeliverable",
        callback_claim_token: null,
        callback_claimed_at: null,
        callback_claim_expires_at: null,
        error_code: errorCode ?? null,
      })
      .eq("id", jobId);
    return;
  }

  await admin
    .from("composer_pipeline_jobs")
    .update({
      status: outcome,
      callback_delivery_status: outcome,
      error_code: errorCode ?? null,
      completed_at: now,
      callback_claim_token: null,
      callback_claimed_at: null,
      callback_claim_expires_at: null,
    })
    .eq("id", jobId);
}

/** Structured stale-callback telemetry. Never mutates the scene. */
export function logRejectedCallback(id: CallbackIdentity, reason: RejectReason, mode: string): void {
  console.warn("[v427] callback_rejected", JSON.stringify({
    mode,
    reason,
    scene_id: id.sceneId,
    run_id: id.runId,
    pipeline_job_id: id.pipelineJobId ?? null,
    stage: id.stage,
    attempt_no: id.attemptNo ?? null,
    segment_id: id.segmentId ?? null,
    external_job_id: id.externalJobId ?? null,
  }));
}

/**
 * Aggregation barrier for parallel sync segments: every segment only ever
 * writes its own job row; the scene stays on `lipsync_running` until ALL
 * expected segments succeeded, and exactly one caller wins the transition.
 */
export async function allRequiredSyncJobsSucceeded(
  admin: any,
  sceneId: string,
  runId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("composer_pipeline_jobs")
    .select("status")
    .eq("scene_id", sceneId)
    .eq("run_id", runId)
    .eq("stage", "sync_segment");
  const rows = (data ?? []) as Array<{ status: PipelineJobStatus }>;
  if (rows.length === 0) return false;
  return rows.every((r) => r.status === "succeeded");
}

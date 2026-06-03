/**
 * Central, idempotent lip-sync failure helper.
 *
 * Used by every dialog/lip-sync edge function so a failure always ends with:
 *   - dialog_shots.status = 'failed' (+ error reason)
 *   - lip_sync_status     = 'failed'
 *   - twoshot_stage       = 'failed'
 *   - clip_error          = <human-friendly reason>
 *   - replicate_prediction_id = null
 *   - inflight Sync.so jobs (per scene + extra ids) removed from registry
 *   - credits refunded once (when refundCredits > 0)
 *
 * Idempotency: safe to call multiple times for the same scene — refund is only
 * issued when `dialog_shots.refunded !== true` AND `refundCredits > 0`.
 *
 * Best-effort: any sub-step failure is logged but the function never throws
 * (callers may still return their own HTTP response).
 */

type SupabaseLike = {
  from: (t: string) => any;
};

export interface FailLipSyncArgs {
  supabase: SupabaseLike;
  sceneId: string;
  reason: string;
  /** Optional user id to refund credits to. */
  userId?: string | null;
  /** Sync.so job ids to also remove from the inflight registry. */
  extraSyncJobIds?: string[];
  /** Credits to refund (0 / undefined skips refund). */
  refundCredits?: number;
  /** Best-effort sync.so DELETE for the listed job ids. */
  syncApiKey?: string | null;
}

export interface FailLipSyncResult {
  ok: boolean;
  refunded: boolean;
  scene_id: string;
  reason: string;
}

export async function failLipSync(args: FailLipSyncArgs): Promise<FailLipSyncResult> {
  const { supabase, sceneId, reason } = args;
  const nowIso = new Date().toISOString();
  const safeReason = String(reason).slice(0, 280);

  // 1. Re-read current state so we don't clobber a finished scene and so we
  //    can collect all known Sync.so job ids on this scene.
  let existing: any = null;
  try {
    const { data } = await supabase
      .from("composer_scenes")
      .select(
        "id, dialog_shots, lip_sync_applied_at, replicate_prediction_id, audio_plan, project_id",
      )
      .eq("id", sceneId)
      .maybeSingle();
    existing = data;
  } catch (e) {
    console.warn(`[failLipSync] read scene crash: ${(e as Error).message}`);
  }
  if (existing?.lip_sync_applied_at) {
    // Already complete — never overwrite a successful scene.
    return { ok: true, refunded: false, scene_id: sceneId, reason: "already_applied" };
  }

  const state: any = (existing as any)?.dialog_shots ?? null;
  const alreadyRefunded = !!state?.refunded;
  const stateCost = Number(state?.cost_credits) || 0;
  const requestedRefund = Number(args.refundCredits) || 0;
  // Prefer the cost persisted on the dialog state (authoritative) over a
  // caller-supplied hint; fall back to the hint when state has none yet.
  const refundAmount = stateCost > 0 ? stateCost : requestedRefund;

  // 2. Collect every Sync.so job id we know about so the inflight registry
  //    is freed even if Sync.so never sends a terminal webhook.
  const jobIds = new Set<string>();
  if (Array.isArray(args.extraSyncJobIds)) {
    args.extraSyncJobIds.forEach((id) => {
      if (typeof id === "string" && id.length > 0) jobIds.add(id);
    });
  }
  if (Array.isArray(state?.shots)) {
    for (const s of state.shots) {
      if (typeof s?.sync_job_id === "string" && s.sync_job_id.length > 0) {
        jobIds.add(s.sync_job_id);
      }
    }
  }
  if (Array.isArray(state?.passes)) {
    for (const p of state.passes) {
      if (typeof p?.job_id === "string" && p.job_id.length > 0) jobIds.add(p.job_id);
    }
  }
  const v5Jobs: any[] = existing?.audio_plan?.twoshot?.syncJobs?.jobs ?? [];
  for (const j of v5Jobs) {
    const id = typeof j === "string" ? j : (j?.id ?? j?.job_id ?? j?.sync_job_id);
    if (typeof id === "string" && id.length > 0) jobIds.add(id);
  }
  const predId: string | null = (existing as any)?.replicate_prediction_id ?? null;
  if (typeof predId === "string" && predId.startsWith("sync:")) {
    jobIds.add(predId.replace(/^sync:/, ""));
  }

  // 3. Best-effort: ask sync.so to cancel any still-billing job + free our
  //    inflight slot for those job ids.
  const ids = Array.from(jobIds);
  if (ids.length > 0) {
    try {
      await supabase.from("syncso_inflight_jobs").delete().in("job_id", ids);
    } catch (e) {
      console.warn(`[failLipSync] inflight cleanup crash: ${(e as Error).message}`);
    }
    if (args.syncApiKey) {
      await Promise.all(
        ids.map((id) =>
          fetch(`https://api.sync.so/v2/generations/${id}`, {
            method: "DELETE",
            headers: { "x-api-key": args.syncApiKey! },
          })
            .then((r) =>
              console.log(`[failLipSync] sync.so DELETE job=${id} → ${r.status}`),
            )
            .catch((e) =>
              console.warn(`[failLipSync] sync.so DELETE job=${id} threw: ${(e as Error).message}`),
            ),
        ),
      );
    }
  }

  // 4. Refund credits exactly once.
  let didRefund = false;
  if (!alreadyRefunded && refundAmount > 0 && args.userId) {
    try {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", args.userId)
        .single();
      if (wallet) {
        await supabase
          .from("wallets")
          .update({
            balance: Number(wallet.balance ?? 0) + refundAmount,
            updated_at: nowIso,
          })
          .eq("user_id", args.userId);
        didRefund = true;
      }
    } catch (e) {
      console.warn(`[failLipSync] refund crash: ${(e as Error).message}`);
    }
  }

  // 5. Patch dialog_shots (mark failed/refunded) and the scene row.
  const patchedState = state
    ? {
        ...state,
        status: "failed",
        error: safeReason,
        finished_at: state.finished_at ?? nowIso,
        refunded: alreadyRefunded || didRefund || refundAmount === 0,
      }
    : { version: 5, status: "failed", error: safeReason, refunded: refundAmount === 0 };

  try {
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: patchedState,
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: safeReason,
        replicate_prediction_id: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);
  } catch (e) {
    console.warn(`[failLipSync] scene update crash: ${(e as Error).message}`);
    return { ok: false, refunded: didRefund, scene_id: sceneId, reason: safeReason };
  }

  console.log(
    `[failLipSync] scene=${sceneId} reason="${safeReason}" jobs=${ids.length} refunded=${didRefund}/${refundAmount}`,
  );
  return { ok: true, refunded: didRefund, scene_id: sceneId, reason: safeReason };
}

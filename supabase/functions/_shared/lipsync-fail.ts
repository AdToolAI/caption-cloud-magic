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
  rpc?: (fn: string, args: Record<string, unknown>) => any;
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
  /**
   * V459 — Run des fehlgeschlagenen Laufs. Der Euro-Refund wird an die
   * Belastung dieses Runs gebunden (`metadata.run_id`).
   */
  runId?: string | null;
  /** V459 — konkrete Quell-Belastung (`ai_video_transactions.id`), falls bekannt. */
  sourceTransactionId?: string | null;
  /** Best-effort sync.so DELETE for the listed job ids. */
  syncApiKey?: string | null;
}


export interface FailLipSyncResult {
  ok: boolean;
  refunded: boolean;
  scene_id: string;
  reason: string;
  /** V459 — Rohantwort von `v459_refund_lipsync_euros` (Kasse: Euro-Wallet). */
  refund?: Record<string, unknown> | null;
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
        "id, dialog_shots, lip_sync_applied_at, replicate_prediction_id, audio_plan, project_id, active_run_id",
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
  // v431 RS3 — der Reset beansprucht den Refund bereits im Reset-Commit
  // (`audio_plan.twoshot.rs3_reset.refund_claimed`). Danach darf hier kein
  // zweiter Refund entstehen, auch wenn `dialog_shots` geleert wurde.
  const rs3Marker: any = (existing as any)?.audio_plan?.twoshot?.rs3_reset ?? null;
  const rs3RefundClaimed = rs3Marker?.refund_claimed === true;
  const alreadyRefunded = !!state?.refunded || rs3RefundClaimed;

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

  // 4. V459 — Refund IMMER in der Kasse, die belastet wurde: dem Euro-Wallet
  //    (`ai_video_wallets.balance_euros`). Der Credit-Ledger (`wallets.balance`)
  //    ist ausdrücklich NICHT mehr der Refund-Pfad — genau diese Fehlbuchung hat
  //    beim Run a3b5541b 960 Credits gegen eine €4,50-Belastung gestellt.
  //    Idempotenz haengt an der Quell-Belastung, nicht an (scene, run) allein:
  //    refund_key = lipsync_refund:<run_id>:<source_transaction_id>.
  let didRefund = false;
  let refundInfo: Record<string, unknown> | null = null;
  const runIdForRefund =
    args.runId ??
    (typeof state?.run_id === "string" ? state.run_id : null) ??
    ((existing as any)?.active_run_id ?? null);
  if (!alreadyRefunded && refundAmount > 0 && args.userId && typeof supabase.rpc === "function") {
    try {
      const { data: refundRes, error: refundErr } = await supabase.rpc(
        "v459_refund_lipsync_euros",
        {
          p_user_id: args.userId,
          p_scene_id: sceneId,
          p_run_id: runIdForRefund ? String(runIdForRefund) : null,
          p_source_transaction_id: args.sourceTransactionId ?? null,
          p_reason: safeReason,
        },
      );
      if (refundErr) {
        console.warn(`[failLipSync] euro refund rpc error: ${refundErr.message ?? refundErr}`);
      } else {
        refundInfo = (refundRes ?? null) as Record<string, unknown> | null;
        didRefund = (refundInfo as any)?.refunded === true;
        console.log(
          `[failLipSync] v459 euro_refund scene=${sceneId} run=${runIdForRefund ?? "-"} ` +
            `refunded=${didRefund} detail=${JSON.stringify(refundInfo ?? {})}`,
        );
      }
    } catch (e) {
      console.warn(`[failLipSync] refund crash: ${(e as Error).message}`);
    }
  }


  // 5. Patch dialog_shots (mark failed/refunded) and the scene row.
  // Ein bereits gebuchter Refund (`already_refunded`) gilt als erledigt und
  // darf keinen zweiten Versuch ausloesen.
  const refundSettled =
    didRefund || (refundInfo as any)?.reason === "already_refunded";
  // ── V511 F4 — terminalize through the V510 contract ───────────────────
  //
  // This used to be a full-column UPDATE carrying `{...state}` — the
  // read-at-entry `dialog_shots`, `passes[]` and all. Two defects in one
  // statement:
  //
  //   · it is the last stale-`passes[]` overwrite outside compose. A sibling
  //     that bound a job id between the read at the top of this function and
  //     this write lost its pointer — exactly the generation-10 lost update
  //     V510-P0 removed everywhere else.
  //   · it never wrote `v510_terminal`. Generation 12 proved the cost: after
  //     `watchdog_hard_timeout` the scene was failed with NO marker, so a
  //     late COMPLETED callback could not reach
  //     `composer_reconcile_terminal_sync_result` and the finished provider
  //     output stayed unbookable.
  //
  // The root patch below therefore carries NO `passes` key at all; the RPC
  // merges it server-side, leaves every sibling slot untouched, and stamps
  // the run-scoped marker.
  //
  // `_pass_idx` is null on purpose. This helper terminalizes a SCENE; it is
  // called from preflight aborts, circuit breakers, resets and the watchdog,
  // and none of them owns a single failing pass. A null index patches no slot.
  //
  // The run id comes from the FRESH scene read above, never from the caller.
  // `args.runId` is the refund's binding and may name a historical run; using
  // it here could fence a run that is no longer current. A null
  // `active_run_id` yields a marker with a null run id, which
  // `isRunTerminal` and the RPC's own guard both refuse to match — it fails
  // open rather than fencing an unknown run.
  const v511TerminalRunId = String((existing as any)?.active_run_id ?? "") || null;
  const v511RootPatch: Record<string, unknown> = {
    version: 5,
    status: "failed",
    error: safeReason,
    finished_at: (state as any)?.finished_at ?? nowIso,
    refunded: alreadyRefunded || refundSettled || refundAmount === 0,
    v459_refund: refundInfo ?? (state as any)?.v459_refund ?? null,
  };
  const v511ScenePatch: Record<string, unknown> = {
    lip_sync_status: "failed",
    twoshot_stage: "failed",
    clip_error: safeReason,
  };

  let v511Terminalized = false;
  try {
    if (typeof supabase.rpc === "function") {
      const { error: termErr } = await supabase.rpc("composer_terminalize_dialog_run", {
        _scene_id: sceneId,
        _run_id: v511TerminalRunId,
        _pass_idx: null,
        _pass_patch: {},
        _root_patch: v511RootPatch,
        _scene_patch: v511ScenePatch,
        _terminal_reason: safeReason,
      });
      if (termErr) {
        console.error(
          `[failLipSync] v511 terminalize rpc error scene=${sceneId}: ${termErr.message ?? termErr}`,
        );
      } else {
        v511Terminalized = true;
      }
    }
  } catch (e) {
    console.error(`[failLipSync] v511 terminalize crash: ${(e as Error).message}`);
  }

  try {
    if (!v511Terminalized) {
      // DEGRADED PATH — the RPC is unreachable. Merge the root server-side
      // anyway rather than shipping a stale snapshot: `passes` is absent from
      // the patch, so no sibling slot can be overwritten even here. What is
      // lost is the terminal marker, and that is logged, not hidden.
      console.error(
        `[failLipSync] v511 terminalize unavailable scene=${sceneId} — root-merge fallback, NO v510_terminal marker`,
      );
      if (typeof supabase.rpc === "function") {
        await supabase.rpc("update_dialog_shots_root_merge", {
          _scene_id: sceneId,
          _patch: { ...v511RootPatch, v511_terminal_degraded: true },
        });
      }
      await supabase
        .from("composer_scenes")
        .update({ ...v511ScenePatch, updated_at: nowIso })
        .eq("id", sceneId);
    }
    // `replicate_prediction_id` is a transport pointer, not part of the
    // monotonic terminal contract, and the RPC does not carry it. Clearing it
    // is a narrow column write that touches no `dialog_shots` at all.
    await supabase
      .from("composer_scenes")
      .update({ replicate_prediction_id: null, updated_at: nowIso })
      .eq("id", sceneId);
  } catch (e) {
    console.warn(`[failLipSync] scene update crash: ${(e as Error).message}`);
    return { ok: false, refunded: didRefund, scene_id: sceneId, reason: safeReason, refund: refundInfo };
  }

  console.log(
    `[failLipSync] scene=${sceneId} reason="${safeReason}" jobs=${ids.length} refunded=${didRefund}/${refundAmount}`,
  );
  return { ok: true, refunded: didRefund, scene_id: sceneId, reason: safeReason, refund: refundInfo };
}

/**
 * sync-so-webhook — Stage 5 B.1
 *
 * Receives terminal-status webhooks from Sync.so for per-turn lipsync jobs
 * dispatched by `poll-dialog-shots` (v9 Artlist pipeline). When a webhook
 * arrives we immediately patch the matching shot's status/output_url in
 * `composer_scenes.dialog_shots` and fire-and-forget `poll-dialog-shots`
 * for that scene so the next pending turn (or the Lambda stitch) starts
 * within ~1s instead of waiting up to 60s for the next pg_cron tick.
 *
 * Auth: shared-secret `?token=...` (WEBHOOK_SHARED_SECRET) — same scheme
 * used for the Remotion webhook. The full webhook URL is constructed by
 * `poll-dialog-shots` via `appendWebhookToken`.
 *
 * Failure mode: if anything goes wrong we still return 200 so Sync.so does
 * NOT retry storm us. The 60s pg_cron poller is the safety net.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { verifyWebhookRequest } from "../_shared/webhook-auth.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
import {
  releaseInflightSyncJob,
  classifySyncError,
  classifySyncErrorCode,
  explainSyncErrorCode,
  fetchSyncJobError,
  isTransientSyncError,
  recordCircuitFailure,
  recordCircuitSuccess,
  logSyncDispatch,
} from "../_shared/syncso-preflight.ts";
import { probeMp4Dims } from "../_shared/twoshot-face-map.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";
// V461 B — semantic input fingerprint: refuse transport-only re-dispatches.
import { evaluateNoopRedispatch } from "../_shared/v461-input-fingerprint.ts";
// v431 G3.2.2 — B11 gelöscht: kein Complete-Pfad im Sync-Apply mehr,
// `materializeCompatibilityOutput` gehört ausschließlich dem Finalizer.

import { acquireLedgerJob, observeCallbackProvenance, readPipelineJobId } from "../_shared/v431-ledger.ts";
// FA-4 Provider-No-op Fix Contract C′ — PURE motion classifier (LEGACY
// TELEMETRY since V465-B2b; never authoritative).
import {
  classifyMotionProbe,
  type MotionProbeResult,
} from "../_shared/motion-probe-classifier.ts";
// V465-B2b — authoritative paired mouth-over-frame verdict.
import { resolveV465Verdict, V466_GRAY_BAND_SAMPLES } from "../_shared/v465-verdict.ts";
// FA-4 v404 — server-side synchronous measurement owner (Remotion stills).
import {
  measureProviderMotionSync,
  type MeasureProviderMotionSyncResult,
} from "../_shared/measure-provider-motion-sync.ts";
// V443 — probe-infrastructure failures are not verdicts about the clip.
import {
  classifyMeasurementFailure,
  isMouthRoiUnresolved,
  measureWithBoundedReMeasure,
  MOTION_UNVERIFIED_STATE,
  PROBE_INFRA_MAX_RETRIES,
} from "../_shared/motion-probe-infra.ts";
// V456 Gate 2 — anchor-coherent, validated mouth-ROI contract.
import { evaluateMouthRoiContract } from "../_shared/v456-roi-contract.ts";
// FA-4 v409 — PURE Speaker-Cardinality (distinct speaker_idx, NOT pass count).
import {
  classifySpeakerCardinality,
  decideCompletedSpeakerBranch,
  planPreLockSpeakerMeasurement,
} from "../_shared/fa4-speaker-cardinality.ts";
// FA-4 v410 — kein Medien-/AWS-I/O unter dem Dialog-Lock.
import {
  decideUnderLockIoAction,
  Fa4OutOfLockIoRequired,
  type Fa4OutOfLockIoRequest,
  runLockedPhasesWithOutOfLockIo,
} from "../_shared/fa4-lock-phase-orchestration.ts";

/** Cold-start / deploy marker for the v404 server-measurement wire. */
const SYNC_SO_WEBHOOK_VERSION = "v410-fa4-no-media-io-under-dialog-lock-final";

// v410 observability — module-load boot marker. Proves which build is actually
// running inside Edge Runtime (vs a stale cached copy). Look for this exact
// string in logs immediately after any deploy to confirm the new code is live.
console.log(
  `[sync-so-webhook] BOOT version=${SYNC_SO_WEBHOOK_VERSION} deploy_marker=${Date.now()} pid=${(globalThis as any).Deno?.pid ?? "?"}`,
);

// V434 Step 1 — immutable, sha256-pinned evidence copies. Purely additive:
// the frozen FA-4 path keeps using the legacy re-hosted URL for mux/playback.
import {
  buildImmutableArtifactKey,
  pinImmutableArtifact,
  resolveArtifactAttempt,
  type PinnedArtifact,
} from "../_shared/v434-immutable-artifact.ts";
import { isTerminalNoopPass } from "../_shared/v459-fanout-aggregation.ts";

/**
 * V434 Step 1 — records an immutable artifact pin. Never throws, never touches
 * scene state; a failure only means this run has no evidence copy.
 */
async function recordV434Pin(
  supabase: any,
  row: {
    scene_id: string;
    run_id: string | null;
    generation: number | null;
    pass_idx: number;
    attempt?: number | null;
    kind: string;
    source_url: string | null;
    pin: PinnedArtifact;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("v434_artifact_pins").insert({
      scene_id: row.scene_id,
      run_id: row.run_id,
      generation: row.generation,
      pass_idx: row.pass_idx,
      attempt: row.attempt ?? 0,
      kind: row.kind,
      purpose: "production",
      source_url: row.source_url,
      object_key: row.pin.key,
      pinned_url: row.pin.url,
      sha256: row.pin.sha256,
      byte_size: row.pin.bytes,
      status: row.pin.status,
    });

    if (error) {
      console.warn(`[sync-so-webhook] v434_pin_log_failed scene=${row.scene_id}: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[sync-so-webhook] v434_pin_log_crash scene=${row.scene_id}: ${(e as Error).message}`);
  }
}

/**
 * v404 §5 — Rehost the provider output to `ai-videos` OUTSIDE the dialog lock.
 * Pure I/O, no scene-state mutation, safe to run before locking.
 */
async function rehostSyncOutput(
  supabase: any,
  sceneId: string,
  passIdx: number,
  outputUrl: string,
): Promise<string | null> {
  try {
    const { data: row } = await supabase
      .from("composer_scenes").select("project_id").eq("id", sceneId).single();
    const { data: proj } = await supabase
      .from("composer_projects").select("user_id").eq("id", (row as any)?.project_id).single();
    const uid = (proj as any)?.user_id;
    if (!uid) return null;
    const dl = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) });
    if (!dl.ok) return null;
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const objectPath = `composer/${uid}/${sceneId}-lipsync-pass-${passIdx + 1}.mp4`;
    const up = await supabase.storage.from("ai-videos").upload(
      objectPath, bytes, { contentType: "video/mp4", upsert: true },
    );
    if (up.error) return null;
    const { data: pub } = supabase.storage.from("ai-videos").getPublicUrl(objectPath);
    return pub?.publicUrl ?? null;
  } catch (err) {
    console.warn(`[sync-so-webhook] scene=${sceneId} pass ${passIdx + 1} re-host: ${(err as Error).message}`);
    return null;
  }
}




const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dispatchModeForShot(shot: any): "auto" | "coords" {
  return shot?.target_coords && (shot?.deterministic_coords === true || !!shot?.force_coords)
    ? "coords"
    : "auto";
}

const ASSUMED_MASTER_FPS = 24;
// v15 Race-Fix: align webhook retry budget with poll-dialog-shots
// (MAX_SHOT_RETRIES = 4 there). Previously the webhook hard-terminal-failed
// a shot after a single Sync.so error, which prematurely killed scenes that
// the poller's differentiated retry matrix (frame, temp, preclip↔master)
// would have recovered.
const MAX_SHOT_RETRIES = 4;
const RETRY_TEMPERATURES = [0.5, 0.35, 0.7, 0.4];
// v30 — Added "coords-pro-box" (bounding-box targeting) as a safer fallback
// for 3+ speaker plates BEFORE jumping to auto-* (face-swap risk).
// v37 — Added "sync3-coords" as the Sync.so-recommended fallback for
// difficult / occluded / multi-speaker plates (sync-3 has built-in
// obstruction detection and can open closed lips; lipsync-2-pro cannot).
// v61 — Added "coords-pro-lp2pro": forces lipsync-2-pro on the proven
// coords-pro point-ASD shape. This is the final multi-speaker fallback
// AFTER sync-3 attempts exhaust (sync-3 is the new default for N>=2, but
// we keep the historically-stable lipsync-2-pro chained path as last
// resort instead of refunding).
// v82 (Phase 2.1) — `bbox-url-pro` (Sync.so `bounding_boxes_url`) is now
// PRIMARY for multi-speaker dialog. On failure we step down to the
// inline-bbox `coords-pro-box`, then the rest of the legacy ladder.
// v431 G3.2.2 — die Variantenleiter des Callbacks (B14) ist entfallen; ein
// erneuter Versuch läuft ausschließlich über den NOOP-Escalate-Vertrag (§5a).


function isMultiSpeakerScene(shots: any[]): boolean {
  return new Set(shots.map((s) => s?.speaker_idx)).size >= 2;
}

function pickRetryFrame(segFrames: number, attempt: number): number {
  const positions = [0.5, 0.25, 0.75, 0.15];
  const pos = positions[Math.min(attempt, positions.length - 1)];
  return Math.min(segFrames - 1, Math.max(0, Math.floor(segFrames * pos)));
}

function prepareRetryFromWebhook(shot: any, reason: string, allShots: any[]): boolean {
  if ((shot?.retry_count ?? 0) >= MAX_SHOT_RETRIES) return false;
  const failedMode = dispatchModeForShot(shot);
  shot.retry_count = (shot.retry_count ?? 0) + 1;
  shot.status = "pending";
  shot.sync_job_id = undefined;
  shot.output_url = undefined;
  shot.started_at = undefined;
  shot.completed_at = undefined;
  shot.error = `retrying_after_${reason}`.slice(0, 300);

  const attempt = shot.retry_count;

  if (isMultiSpeakerScene(allShots) && shot.target_coords) {
    shot.force_coords = true;
    shot.deterministic_coords = true;
    // Sync.so v2 + `segments_secs`: `frame_number` is SEGMENT-RELATIVE
    // (0 = first frame of the trimmed segment). Compute relative to the
    // render_window (matches poll-dialog-shots).
    const win = (Array.isArray(shot.render_window) && shot.render_window.length === 2)
      ? shot.render_window
      : (Array.isArray(shot.window) ? shot.window : [0, 0]);
    const [s, e] = [Number(win[0]) || 0, Number(win[1]) || 0];
    const segFrames = Math.max(1, Math.floor((e - s) * ASSUMED_MASTER_FPS));
    shot.frame_number_override = pickRetryFrame(segFrames, attempt);
    shot.temperature = RETRY_TEMPERATURES[attempt % RETRY_TEMPERATURES.length];
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt}/${MAX_SHOT_RETRIES} coords-locked segRelFrame=${shot.frame_number_override}/${segFrames} temp=${shot.temperature}`,
    );
  } else if (failedMode === "coords") {
    shot.force_coords = false;
    shot.deterministic_coords = false;
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt} auto fallback`,
    );
  } else if (shot.target_coords) {
    shot.force_coords = true;
    console.warn(
      `[sync-so-webhook] turn=${shot.idx ?? "?"} ${reason} → retry ${attempt} coords fallback`,
    );
  }
  return true;
}

function triggerV5Advance(supabaseUrl: string, serviceKey: string, sceneId: string, passIdx: number, totalPasses: number) {
  fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: passIdx }),
  }).catch(() => {});
  console.log(`[sync-so-webhook] v5 scene=${sceneId} advancing pending pass ${passIdx + 1}/${totalPasses}`);
}

async function headAsset(url: string | null | undefined): Promise<{ bytes: number | null; contentType: string | null; etag: string | null } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") ?? NaN);
    return {
      bytes: Number.isFinite(len) ? len : null,
      contentType: r.headers.get("content-type"),
      etag: r.headers.get("etag"),
    };
  } catch {
    return null;
  }
}

// v431 G3.2.2 — `terminalV5Counts` entfällt: das Pass-Aggregat wird
// ausschließlich im Apply-RPC berechnet (§3/§3a).



// ── v431 G3.2.2 — Sync Segment Authoritative Apply ─────────────────────────
// Contract: docs/v431-g3-2-2-contract.md. `composer_apply_sync_segment_result`
// ist SOLE OWNER von Slot-Patch, Scene-Verdict und Ledger-Terminalisierung.
export type SyncSegmentWriteId =
  | "ssw:success"
  | "ssw:failed"
  | "ssw:noop_fail"
  | "ssw:noop_escalate";

export interface ApplySyncSegmentResult {
  applied: boolean;
  verdict: string;
  segment_result?: string | null;
  scene_verdict?: string | null;
  pass_idx?: number | null;
  replacement_job_id?: string | null;
  reason?: string | null;
  total_passes?: number | null;
  done_count?: number | null;
  failed_count?: number | null;
  final_url?: string | null;
  next_pending_pass_idx?: number | null;
  refund_due?: number | null;
  already_refunded?: boolean | null;
}

async function applySyncSegmentResult(
  supabase: any,
  params: {
    pipelineJobId: string | null;
    externalJobId: string;
    writeId: SyncSegmentWriteId;
    providerStatus: string;
    outputUrl: string | null;
    errorText: string | null;
  },
): Promise<ApplySyncSegmentResult | null> {
  // §2 — Provenienz kommt ausschließlich aus dem Ledger. Ohne Transport-Pointer
  // wird NICHT angewandt (fail-closed); Watchdog/Poller sind das Sicherheitsnetz.
  if (!params.pipelineJobId) {
    console.error(
      `[sync-so-webhook] g322_missing_binding job=${params.externalJobId} write_id=${params.writeId} — apply refused`,
    );
    return null;
  }
  const { data, error } = await supabase.rpc("composer_apply_sync_segment_result", {
    _pipeline_job_id: params.pipelineJobId,
    _external_job_id: params.externalJobId,
    _write_id: params.writeId,
    _provider_status: params.providerStatus,
    _output_url: params.outputUrl,
    _error_text: params.errorText,
  });
  if (error) {
    console.error(
      `[sync-so-webhook] g322_apply_failed job=${params.externalJobId} write_id=${params.writeId}: ${error.message}`,
    );
    return null;
  }
  const res = (data ?? {}) as ApplySyncSegmentResult;
  console.log(
    `[sync-so-webhook] g322_apply write_id=${params.writeId} verdict=${res.verdict} segment_result=${res.segment_result ?? "-"} pass=${res.pass_idx ?? "-"} reason=${res.reason ?? "-"}`,
  );
  return res;
}

// v404 — `readMotionProbeMetrics()` (client-persisted `meta_yavg_probe` poll)
// ist ersatzlos entfallen. Die Motion-Metrik wird ausschließlich serverseitig
// und synchron von `measureProviderMotionSync()` erzeugt; der Client hat keine
// Autorität mehr (nur noch Telemetrie).



/** Wallet-Refund als Edge-Nebenwirkung; der Marker ist idempotent (DB-seitig). */
async function refundSceneIfDue(
  supabase: any,
  sceneId: string,
  res: ApplySyncSegmentResult,
): Promise<void> {
  const amount = Number(res.refund_due ?? 0);
  if (!(amount > 0) || res.already_refunded) return;
  try {
    const { data: claimed } = await supabase.rpc("composer_mark_sync_refund_applied", {
      _scene_id: sceneId,
      _amount: amount,
    });
    if (claimed !== true) return;
    const { data: row } = await supabase
      .from("composer_scenes").select("project_id").eq("id", sceneId).single();
    const { data: proj } = await supabase
      .from("composer_projects").select("user_id").eq("id", (row as any)?.project_id).single();
    const uid = (proj as any)?.user_id;
    if (!uid) return;
    const { data: w } = await supabase
      .from("wallets").select("balance").eq("user_id", uid).single();
    await supabase
      .from("wallets")
      .update({ balance: Number((w as any)?.balance ?? 0) + amount, updated_at: new Date().toISOString() })
      .eq("user_id", uid);
    console.warn(`[sync-so-webhook] g322_refund scene=${sceneId} amount=${amount}`);
  } catch (e) {
    console.warn(`[sync-so-webhook] g322_refund_failed scene=${sceneId}: ${(e as Error).message}`);
  }
}

/**
 * Mux-Dispatch. Der RPC-Claim ist re-drivable; die Exactly-once-Schranke ist
 * `acquireLedgerJob('audio_mux')` (`already_in_flight`). D6: der Mux-Owner
 * setzt `lipsync_muxing` selbst, hier entsteht nur die Provenienz-Zeile.
 */
async function dispatchAudioMux(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  sceneId: string,
  scene: any,
  totalPasses: number,
): Promise<string> {
  const acquisition = await acquireLedgerJob(supabase, {
    sceneId,
    runId: (scene as any)?.active_run_id ?? null,
    stage: "audio_mux",
    plateGeneration: typeof (scene as any)?.plate_generation === "number"
      ? (scene as any).plate_generation
      : null,
    provider: "remotion",
    metadata: { dispatcher: "sync-so-webhook", fan_in_passes: totalPasses },
  });
  if (acquisition.outcome === "already_in_flight" || acquisition.outcome === "predecessor_exists") {
    console.warn(`[sync-so-webhook] scene=${sceneId} mux attempt ${acquisition.outcome} → dispatch skipped`);
    return acquisition.outcome;
  }
  const muxJob = acquisition.outcome === "acquired" ? acquisition.job : null;
  try {
    fetch(`${supabaseUrl}/functions/v1/render-sync-segments-audio-mux`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        scene_id: sceneId,
        ...(muxJob ? { pipeline_job_id: muxJob.id } : {}),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  return "dispatched";
}






serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  if (req.method !== "POST") return ok({ ok: true, skipped: "non_post" });

  const unauth = verifyWebhookRequest(req);
  if (unauth) return unauth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return ok({ ok: true, skipped: "no_json" });
  }

  // Sync.so payload shape varies; extract what we need defensively.
  const jobId: string | undefined =
    payload?.id ?? payload?.job_id ?? payload?.data?.id;
  const status: string = String(payload?.status ?? payload?.data?.status ?? "")
    .toUpperCase();
  const outputUrl: string | undefined =
    payload?.outputUrl ??
    payload?.output_url ??
    payload?.data?.outputUrl ??
    payload?.data?.output_url;
  // Sync.so terminal webhooks expose TWO official fields per the spec
  // (https://sync.so/docs/api-reference/api/webhooks-payload-reference/...):
  //   • `error`       — human message
  //   • `error_code`  — machine enum (e.g. generation_pipeline_failed)
  // Previously we only read `error_message` (which doesn't exist in the spec)
  // and fell back to the useless "An unknown error occurred" string. Now we
  // read both official fields, walk every legacy/nested variant as a safety
  // net, and — if the payload is STILL empty — issue a GET against
  // /v2/generate/{job_id} to fetch the canonical fields from Sync.so.
  const extractErrorFields = (p: any): { message?: string; code?: string } => {
    if (!p) return {};
    const msgCandidates = [
      p.error,                  // official
      p?.data?.error,           // official (nested)
      p.errorMessage,
      p.error_message,
      p.message,
      p.failureReason,
      p.failure_reason,
      p?.error?.message,
      p?.error?.details,
      p?.error?.detail,
      p?.error?.reason,
      p?.data?.errorMessage,
      p?.data?.error_message,
      p?.data?.failureReason,
      p?.data?.error?.message,
      p?.data?.error?.details,
      p?.data?.error?.detail,
      p?.data?.error?.reason,
    ].filter((x) => typeof x === "string" && x.trim().length > 0);
    const codeCandidates = [
      p.error_code,             // official
      p?.data?.error_code,      // official (nested)
      p.errorCode,
      p?.error?.code,
      p?.data?.error?.code,
    ].filter((x) => typeof x === "string" && x.trim().length > 0);
    const message = msgCandidates.find(
      (s) => !/^an unknown error occurred\.?$/i.test(String(s).trim()),
    ) ?? msgCandidates[0];
    return {
      message: typeof message === "string" ? message : undefined,
      code: typeof codeCandidates[0] === "string" ? codeCandidates[0] : undefined,
    };
  };
  let { message: errorMsg, code: errorCode } = extractErrorFields(payload);

  // GET-fallback (v28): terminal FAILED with NO `error_code` AND either no
  // message OR only the generic "An unknown error occurred." string → ask
  // Sync.so directly via `GET /v2/generate/{job_id}`. Previously we only
  // fell back when both fields were missing, but the live failure path
  // returns the generic message *without* a code — exactly the case where
  // GET-fallback was supposed to help.
  const isGenericMsg = (m?: string | null) =>
    !m || /^an unknown error occurred\.?$/i.test(String(m).trim());
  if (
    ["FAILED", "REJECTED", "CANCELED"].includes(status) &&
    !errorCode &&
    isGenericMsg(errorMsg) &&
    jobId
  ) {
    const fetched = await fetchSyncJobError(jobId);
    if (fetched) {
      if (fetched.error && !isGenericMsg(fetched.error)) {
        errorMsg = fetched.error;
      }
      if (fetched.error_code) errorCode = fetched.error_code;
      console.log(`[sync-so-webhook] GET-fallback job=${jobId} code=${errorCode ?? "null"} msg=${(errorMsg ?? "").slice(0, 200)}`);
    }
  }


  if (status !== "COMPLETED") {
    // Log the full payload once so we can post-mortem the "unknown error"
    // class without re-instrumenting the webhook.
    console.log(
      `[sync-so-webhook] terminal=${status} job=${payload?.id ?? payload?.job_id} code=${errorCode ?? "null"} extractedErr=${JSON.stringify(errorMsg ?? null)} fullPayload=${JSON.stringify(payload).slice(0, 1500)}`,
    );
  }

  if (!jobId) {
    console.warn("[sync-so-webhook] no job id in payload");
    return ok({ ok: true, skipped: "no_job_id" });
  }
  if (!["COMPLETED", "FAILED", "REJECTED", "CANCELED"].includes(status)) {
    // Intermediate event — nothing to persist, just ack.
    return ok({ ok: true, skipped: `non_terminal:${status}` });
  }
  // E.3: release inflight slot for any terminal status (best-effort)
  await releaseInflightSyncJob(supabase, jobId);

  // Stage F.3 — feed the provider circuit breaker on terminal status.
  // v30: Do NOT tick the global breaker on `provider_unknown_error` — that
  // class is opaque and routinely triggered by single problematic multi-speaker
  // plates (Sync.so refuses certain coords-pro jobs without an error_code).
  // Counting these globally caused a single bad 3-speaker scene to slam the
  // breaker OPEN and block every Sync.so dispatch (including its own
  // bbox/repair retries) for 30 min.
  if (status === "COMPLETED") {
    await recordCircuitSuccess(supabase, "sync.so");
  } else {
    const cls = classifySyncError((errorMsg ?? "").toString());
    if (cls !== "provider_unknown_error") {
      await recordCircuitFailure(supabase, "sync.so", cls);
    } else {
      console.log(`[sync-so-webhook] skip circuit-breaker tick (class=provider_unknown_error, scoped per-scene)`);
    }
  }


  // Locate the scene that owns this sync_job_id. Prefer the scene_id query
  // hint if poll-dialog-shots embedded it in the webhook URL.
  const url = new URL(req.url);
  const sceneHint = url.searchParams.get("scene_id");

  let sceneId: string | null = null;
  let scene: any = null;

  if (sceneHint) {
    const { data } = await supabase
      .from("composer_scenes")
      .select("id, dialog_shots, lip_sync_applied_at, lip_sync_status, active_run_id, plate_generation")
      .eq("id", sceneHint)
      .maybeSingle();
    if (data) {
      sceneId = data.id;
      scene = data;
    }
  }

  if (!scene) {
    // Fallback: scan in-flight scenes for the job id. Bounded scan, low volume.
    // v25: a fan-out scene tracks job ids in `dialog_shots.passes[].job_id`,
    // not only `shots[]` (v4) or the top-level `sync_job_id` (v5 single-call).
    // We must check ALL three so late/parallel pass webhooks find their scene.
    const { data: rows } = await supabase
      .from("composer_scenes")
      .select("id, dialog_shots, lip_sync_applied_at, lip_sync_status, active_run_id, plate_generation")
      .in("lip_sync_status", ["running", "stitching", "audio_muxing"])
      .limit(200);
    for (const r of rows ?? []) {
      const ds = (r as any)?.dialog_shots ?? {};
      const shots = Array.isArray(ds.shots) ? ds.shots : [];
      const passes = Array.isArray(ds.passes) ? ds.passes : [];
      const hit =
        shots.some((s: any) => s?.sync_job_id === jobId) ||
        passes.some((p: any) => p?.job_id === jobId) ||
        ds?.sync_job_id === jobId;
      if (hit) {
        sceneId = r.id;
        scene = r;
        break;
      }
    }
  }

  if (!scene || !sceneId) {
    console.warn(`[sync-so-webhook] no scene matched job ${jobId}`);
    return ok({ ok: true, skipped: "no_scene_match", job_id: jobId });
  }

  // ── Run-Guard (2026-08-03) ────────────────────────────────────────────────
  // A restart purges `dialog_shots`. Any result that arrives afterwards
  // belongs to the PREVIOUS run and must never touch the new one. We only
  // discard when the scene actually tracks job ids and this one is not among
  // them — a webhook that races the initial `dialog_shots` write (no job ids
  // recorded yet) is still accepted, exactly as before.
  {
    const ds: any = scene.dialog_shots ?? null;
    const shots = Array.isArray(ds?.shots) ? ds.shots : [];
    const passes = Array.isArray(ds?.passes) ? ds.passes : [];
    const knownJobIds = [
      ...shots.map((s: any) => s?.sync_job_id),
      ...passes.map((p: any) => p?.job_id),
      ds?.sync_job_id,
    ].filter((v: unknown) => typeof v === "string" && v.length > 0);

    const purged = ds === null;
    const stale = knownJobIds.length > 0 && !knownJobIds.includes(jobId);

    if (purged || stale) {
      console.warn(
        `[sync-so-webhook] run_guard_discarded scene=${sceneId} job=${jobId} ` +
          `reason=${purged ? "dialog_shots_purged" : "job_not_in_current_run"}`,
      );
      return ok({
        ok: true,
        skipped: "stale_run_result",
        scene_id: sceneId,
        job_id: jobId,
      });
    }
  }

  // ── v431 G3.1 — Ledger-Observe (schreibt nichts, blockiert nichts) ─────────
  // G3.1b: dieselbe Job-ID ist zugleich der Vorgänger jedes Retry-Dispatch,
  // der aus diesem Callback heraus ausgelöst wird.
  const v431CallbackJobId = readPipelineJobId(url, payload as Record<string, unknown>);
  await observeCallbackProvenance(supabase, {
    handler: "sync-so-webhook",
    pipelineJobId: v431CallbackJobId,
    sceneId,
    stage: "sync_segment",
    externalJobId: jobId ? String(jobId) : null,
  });



  if (scene.lip_sync_applied_at) {
    return ok({ ok: true, skipped: "already_applied" });
  }
  // v18 Cancel-Guard: ignore late webhooks for user-cancelled scenes.
  if (
    (scene as any).lip_sync_status === "canceled" ||
    (scene.dialog_shots as any)?.status === "canceled"
  ) {
    return ok({ ok: true, skipped: "canceled", scene_id: sceneId });
  }

  // v129.4a — Late-webhook guard for already-terminal scenes.
  // The webhook is the single source of truth for scene terminalisation
  // (Watchdog defers to it). A FAILED/COMPLETED arriving after the scene
  // is already failed must not flip it to done (partial output) or replay
  // refund logic. Ack 200 so Sync.so stops retrying, no state mutation.
  //
  // v131.8 — Ausnahme: wenn die Szene NUR wegen unseres eigenen
  // `watchdog_provider_timeout` als failed markiert wurde UND Sync.so jetzt
  // doch `COMPLETED` für einen Pass liefert, der in `dialog_shots.passes[]`
  // bekannt ist, dürfen wir die Szene aus failed zurückholen. Sonst
  // verlieren wir gesunde Provider-Outputs durch unsere eigene zu strenge
  // Liveness-Heuristik. Echte Sync.so-Failures bleiben terminal.
  const sceneFailedSelfInflicted =
    ((scene as any).lip_sync_status === "failed" ||
      (scene.dialog_shots as any)?.status === "failed") &&
    typeof (scene as any).clip_error === "string" &&
    /^watchdog_(provider_timeout|auto_retry_|hard_timeout)/.test((scene as any).clip_error ?? "");
  const dsForRecover: any = scene.dialog_shots ?? {};
  const passesForRecover: any[] = Array.isArray(dsForRecover?.passes) ? dsForRecover.passes : [];
  const jobKnown = passesForRecover.some((p: any) => p?.job_id === jobId) ||
    dsForRecover?.sync_job_id === jobId;

  if (
    ((scene as any).lip_sync_status === "failed" ||
      (scene.dialog_shots as any)?.status === "failed")
  ) {
    if (status === "COMPLETED" && outputUrl && sceneFailedSelfInflicted && jobKnown) {
      // v431 G3.2.2 R5: write-free. Die Ruecknahme der Failure-Mirrors gehoert
      // ausschliesslich der autoritativen Apply-Transaktion
      // (composer_apply_sync_segment_result, geguardete Recovery-Vorstufe).
      console.log(
        `[sync-so-webhook] v431 recover_from_self_inflicted_fail_delegated scene=${sceneId} job=${jobId} ` +
        `prev_clip_error=${(scene as any).clip_error} — recovery is applied inside the authoritative RPC`,
      );
      (scene as any).lip_sync_status = "running";
      (scene.dialog_shots as any).status = "rendering";
      // fall through into the normal v5 success branch below

    } else {
      console.log(
        `[sync-so-webhook] v129.4a ignored_due_scene_failed scene=${sceneId} job=${jobId} status=${status}`,
      );
      return ok({ ok: true, skipped: "ignored_due_scene_failed", scene_id: sceneId, job_id: jobId });
    }
  }

  // v410: `state` wird zwischen zwei kurzen Locked-Phasen frisch nachgeladen.
  let state: any = scene.dialog_shots ?? null;

  if (!state) {
    return ok({ ok: true, skipped: "no_state" });
  }

  const nowIso = new Date().toISOString();

  // ── v80: legacy v41-v56 single-call segments[] branch removed ─────────
  // The single-call `sync-3 + segments[]` dispatcher in compose-dialog-
  // segments was deleted in v79 (no production code ever set force_v56).
  // Late webhooks for historical `version∈{41..52,55,56}` rows fall
  // through to the legacy_v4_ignored short-circuit at the end of this
  // function (200 OK, no state mutation). Watchdog already refunded
  // historical rows per v70.


  // ── v5: Sync.so Segments (1-call pipeline) ────────────────────────────
  // No per-turn shots; the webhook output IS the final clip.
  // v128 Phase B2 — wrap the entire v5 read-modify-write block in
  // `withDialogLock(scene_id)`. Previously the webhook patched
  // `composer_scenes.dialog_shots` without holding the per-scene lock, so a
  // poller / compose-dialog-segments / sibling-pass webhook running in the
  // same ~ms window could observe a stale snapshot and either skip a
  // pending-pass kick OR overwrite a sibling's job_id. The lock serializes
  // every mutation on dialog_shots.passes[]; on contention we proceed
  // without it (poller reconciliation is the safety net) so Sync.so never
  // sees a 5xx and starts retrying.
  if (state.version === 5 && state.engine === "sync-segments") {
    // ── FA-4 v404 §5 — KEIN AWS-WAIT IM DIALOG LOCK ───────────────────────
    // Rehost + serverseitige Motion-Messung laufen VOR dem Dialog-Lock auf
    // einem immutablen Snapshot. Unter `withDialogLock` findet kein Lambda-
    // Invoke, kein Still-Download, kein JPEG-Decode und keine Messung statt.
    let v404RehostedUrl: string | null = null;
    let v404MotionProbe: MotionProbeResult | null = null;
    let v404MotionMeasurement: MeasureProviderMotionSyncResult | null = null;
    // FA-4 v409 Residual — merkt sich, dass die Pre-Lock-Messung NUR wegen
    // eines unvollständigen Pass-Sets (Fan-Out-Race) aufgeschoben wurde.
    let v404MeasurementDeferred = false;
    // V443 — true when EVERY bounded re-measure attempt failed for pure
    // infrastructure reasons. The pass then passes through as success with
    // telemetry state `motion_unverified`; it never terminalizes the scene.
    let v443MotionUnverified = false;
    let v443MeasureAttempts = 0;
    let v443LastInfraReason: string | null = null;

    // Eine einzige Messroutine (gleiche Metrik/Threshold/Deadline/ROI/N=6,
    // gleiche rehostete Output-URL) — pre-lock ODER nachgeholt unter Lock.
    const runServerMotionMeasurement = async (
      measurePass: any,
      measurePassIdx: number,
      phase: string,
    ): Promise<void> => {
      const preclipUrl = String(
        measurePass?.preclip_url ?? measurePass?._v105_probe?.payload_video_url ?? "",
      );
      const seg = Array.isArray(measurePass?.segments) ? measurePass.segments[0] : null;
      const duration = Number(measurePass?.preclip_duration_sec ?? NaN) ||
        (seg ? Number(seg.endTime) - Number(seg.startTime) : NaN);
      // V443 — the measurement inputs are IMMUTABLE for the whole bounded
      // re-measure: same pinned provider output, same pre-clip, same duration,
      // same run/generation/pass identity. No provider call, no new spend.
      const v456Geometry = {
        anchor: (measurePass as any)?.preclip_anchor ?? null,
        faceShareInCrop: (measurePass as any)?.preclip_face_share ?? null,
        cropSize: (measurePass as any)?.preclip_crop?.size ?? null,
        mouthOffsetPx: (measurePass as any)?.preclip_mouth_offset_px ?? null,
        mouthOffset: (measurePass as any)?.preclip_mouth_offset_xy ?? null,
      };
      // ── V456 Gate 2 — the ROI contract decides the measurement band ───────
      // The geometry ROI becomes authoritative ONLY when the anchor source,
      // face bbox, mouth anchor, ROI bounds and identity all hold. Otherwise
      // the pass is `mouth_roi_unresolved` → motion_unverified. We never fall
      // back to the frozen v404 cheek band as an authority again.
      const v456Contract = evaluateMouthRoiContract({
        ...v456Geometry,
        geometryMeasureSrc: (measurePass as any)?.preclip_geometry_anchor_src ?? null,
        expectedAnchorSrc: (measurePass as any)?.preclip_geometry_anchor_expected ?? null,
        faceBbox: (measurePass as any)?.preclip_from_bbox ?? null,
        identity: (measurePass as any)?.preclip_geometry_identity ?? null,
        expectedIdentity: {
          runId: String((scene as any)?.active_run_id ?? "") || null,
          generation: Number((scene as any)?.plate_generation ?? NaN),
          passIdx: measurePassIdx,
          speakerIdx: Number((measurePass as any)?.speaker_idx ?? NaN),
        },
      });
      console.log(
        `[sync-so-webhook] v456_roi_contract scene=${sceneId} pass=${measurePassIdx} ` +
          `status=${v456Contract.status} reason=${v456Contract.reason} ` +
          `failed_check=${v456Contract.failedCheck ?? "none"} ` +
          `checks=${JSON.stringify(v456Contract.checks)}`,
      );
      const v443MeasureArgs = {
        preclipUrl,
        providerOutputUrl: v404RehostedUrl ?? outputUrl!,
        durationSeconds: duration,
        // V434 Step 4 — geometry the pre-clip renderer already persisted.
        preclipGeometry: v456Geometry,
        // V456 — validated contract; frozen v404 band stays as telemetry.
        roiContract: v456Contract,
      };
      const runBounded = async (sampleCount?: number) =>
        await measureWithBoundedReMeasure(
          () =>
            measureProviderMotionSync(
              sampleCount ? { ...v443MeasureArgs, sampleCount } : v443MeasureArgs,
            ),
          {
            maxRetries: PROBE_INFRA_MAX_RETRIES,
            onRetry: ({ attempt, reason, waitMs }) => {
              console.warn(
                `[sync-so-webhook] v443_probe_infra_remeasure scene=${sceneId} pass=${measurePassIdx} ` +
                  `attempt=${attempt}/${PROBE_INFRA_MAX_RETRIES + 1} wait_ms=${waitMs} ` +
                  `class=probe_infra_error reason=${reason} — same immutable pinned output, no provider call`,
              );
            },
          },
        );
      let v443Bounded = await runBounded();
      v404MotionMeasurement = v443Bounded.result;
      // ── V465-B2b — AUTHORITY FLIP ────────────────────────────────────────
      // The authoritative outcome scalar is the paired `mouth_over_frame`
      // ratio (docs/v465b2a-lambda-still-parity.md). The frozen v404
      // `delta_mean` and the V434 `mad_ratio` are computed and logged as LEGACY
      // TELEMETRY only and may never override the verdict below.
      const verdictOf = (m: MeasureProviderMotionSyncResult) =>
        m.measurement_status === "measured"
          ? resolveV465Verdict((m as any)?.v465 ?? null)
          : resolveV465Verdict(null);
      let v465Verdict = verdictOf(v404MotionMeasurement);
      // ── V466-A — GRAY BAND IS NOT A FAILURE ──────────────────────────────
      // A near-boundary ratio measured on only N=6 stills is a SAMPLING
      // question, not a verdict. Exactly ONE re-measure of the very same
      // immutable pinned output at N=16 stills (parity-verified: 0 hard
      // NOOP<->MOVED flips on the 32 frozen pairs, gray cases resolve towards
      // their true class). No provider call, no spend, no new artifact.
      let v466ReMeasured = false;
      if (
        v404MotionMeasurement.measurement_status === "measured" &&
        v465Verdict.verdict === "indeterminate"
      ) {
        console.warn(
          `[sync-so-webhook] v466_gray_band_remeasure scene=${sceneId} pass=${measurePassIdx} ` +
            `mouth_over_frame=${v465Verdict.mouth_over_frame ?? "n/a"} guard=${v465Verdict.guard ?? "none"} ` +
            `frames=${v465Verdict.frames} → one re-measure at ${V466_GRAY_BAND_SAMPLES} stills (same pinned output)`,
        );
        const retry = await runBounded(V466_GRAY_BAND_SAMPLES);
        v466ReMeasured = true;
        if (retry.result.measurement_status === "measured") {
          v443Bounded = retry;
          v404MotionMeasurement = retry.result;
          v465Verdict = verdictOf(v404MotionMeasurement);
        }
      }
      v443MeasureAttempts = v443Bounded.attempts;
      // V456 — an unresolved ROI contract is NOT a verdict about the clip:
      // it passes through as `motion_unverified` exactly like a probe-infra
      // exhaustion (non-terminal, no retry, no refund, no provider call).
      const v456Unresolved = v404MotionMeasurement.measurement_status !== "measured" &&
        isMouthRoiUnresolved(v404MotionMeasurement.reason);
      // V466-A — a still-gray verdict after the bounded re-measure falls
      // through as `motion_unverified`: never green, never a hard failure.
      const v466StillGray = v465Verdict.verdict === "indeterminate";
      v443MotionUnverified = v443Bounded.infraExhausted || v456Unresolved || v466StillGray;
      v443LastInfraReason = v443MotionUnverified
        ? (v466StillGray && !v456Unresolved && !v443Bounded.infraExhausted
          ? v465Verdict.reason
          : v404MotionMeasurement.reason)
        : null;
      const v465Metric = (v404MotionMeasurement as any)?.v465 ?? null;
      const legacyProbe: MotionProbeResult | null =
        v404MotionMeasurement.measurement_status === "measured" &&
          v404MotionMeasurement.preclip_metric && v404MotionMeasurement.provider_metric
          ? classifyMotionProbe({
            preclip: v404MotionMeasurement.preclip_metric,
            provider: v404MotionMeasurement.provider_metric,
          })
          : null;
      v404MotionProbe = {
        verdict: v465Verdict.verdict,
        // Reason of the measurement failure wins so that V443/V456 pass-through
        // classification keeps working on unmeasurable runs.
        reason: v404MotionMeasurement.measurement_status === "measured"
          ? v465Verdict.reason
          : v404MotionMeasurement.reason,
        deltaMean: legacyProbe?.deltaMean ?? v404MotionMeasurement.deltaMean ?? 0,
        deltaPeak: legacyProbe?.deltaPeak ?? v404MotionMeasurement.deltaPeak ?? 0,
        preclipMean: v404MotionMeasurement.preclip_metric?.mean ?? 0,
        preclipPeak: v404MotionMeasurement.preclip_metric?.peak ?? 0,
        providerMean: v404MotionMeasurement.provider_metric?.mean ?? 0,
        providerPeak: v404MotionMeasurement.provider_metric?.peak ?? 0,
      };
      console.log(
        `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} server_motion_measure scene=${sceneId} pass=${measurePassIdx} ` +
          `phase=${phase} status=${v404MotionMeasurement.measurement_status} ` +
          `authority=v465_mouth_over_frame mouth_over_frame=${v465Verdict.mouth_over_frame ?? "n/a"} ` +
          `guard=${v465Verdict.guard ?? "none"} verdict=${v404MotionProbe.verdict} reason=${v404MotionProbe.reason} ` +
          `v466_remeasured=${v466ReMeasured} frames=${v465Verdict.frames} ` +
          `legacy_delta_mean=${v404MotionMeasurement.deltaMean ?? "n/a"} ` +
          `legacy_verdict=${legacyProbe?.verdict ?? "n/a"} (legacy telemetry only)`,
      );


      // V443 — bounded re-measure exhausted for INFRASTRUCTURE reasons only.
      // Persist everything the watchdog needs for exactly ONE re-measure of the
      // very same immutable provider output. No provider job is referenced.
      if (v443MotionUnverified) {
        console.warn(
          `[sync-so-webhook] v443_motion_unverified scene=${sceneId} pass=${measurePassIdx} ` +
            `attempts=${v443MeasureAttempts} class=probe_infra_error reason=${v443LastInfraReason} ` +
            `→ pass-through as success (no terminalization, no refund, no provider call)`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          job_id: jobId,
          engine: "sync-segments",
          turn_idx: measurePassIdx,
          sync_status: "MOTION_UNVERIFIED",
          error_class: "motion_probe_infra_error",
          error_message: String(v443LastInfraReason ?? "").slice(0, 500),
          meta: {
            v443: true,
            telemetry_state: MOTION_UNVERIFIED_STATE,
            failure_class: v456Unresolved
              ? "mouth_roi_unresolved"
              : (v466StillGray && !v443Bounded.infraExhausted
                ? "v466_gray_band_unresolved"
                : "probe_infra_error"),
            v466_gray_band: v466StillGray,
            v466_remeasured: v466ReMeasured,
            v466_remeasure_samples: v466ReMeasured ? V466_GRAY_BAND_SAMPLES : null,
            mouth_over_frame: v465Verdict.mouth_over_frame,
            v456_roi_contract: {
              status: v456Contract.status,
              reason: v456Contract.reason,
              failed_check: v456Contract.failedCheck,
              checks: v456Contract.checks,
            },
            measure_attempts: v443MeasureAttempts,
            max_remeasure: PROBE_INFRA_MAX_RETRIES,
            pass_idx: measurePassIdx,
            phase,
            pipeline_job_id: v431CallbackJobId ?? null,
            preclip_url: preclipUrl,
            provider_output_url: v404RehostedUrl ?? outputUrl,
            duration_sec: Number.isFinite(duration) ? duration : null,
            preclip_geometry: v443MeasureArgs.preclipGeometry,
          },
        });
      }
      // ── V465-B2b — AUTHORITATIVE paired mouth-over-frame record ────────
      // Measured on the production Lambda stills; this is now the verdict
      // owner. `delta_mean` / `mad_ratio` ride along as legacy telemetry.
      const v465 = v465Metric;
      if (v465) {
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} v465_verdict scene=${sceneId} pass=${measurePassIdx} ` +
            `mouth_over_frame=${v465.mouth_over_frame ?? "unknown"} mouth_edit=${v465.mouth_edit ?? "unknown"} ` +
            `frame_edit=${v465.frame_edit ?? "unknown"} roi_px=${v465.roi_pixels ?? "unknown"} ` +
            `verdict=${v465Verdict.verdict} guard=${v465Verdict.guard ?? "none"} ` +
            `band=${v465Verdict.band.noop_below}/${v465Verdict.band.moved_above} reason=${v465Verdict.reason} ` +
            `authority=authoritative`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          job_id: jobId,
          engine: "sync-segments",
          turn_idx: measurePassIdx,
          sync_status: "V465_VERDICT",
          error_class: null,
          error_message: null,
          meta: {
            v465: {
              ...v465,
              verdict: v465Verdict.verdict,
              verdict_reason: v465Verdict.reason,
              guard: v465Verdict.guard,
              verdict_band: v465Verdict.band,
              legacy_delta_mean: v404MotionMeasurement?.deltaMean ?? null,
              legacy_verdict: legacyProbe?.verdict ?? null,
              legacy_mad_ratio:
                (v404MotionMeasurement as any)?.v434?.mad_ratio?.mad_ratio ?? null,
              still_source: "remotion_lambda",
              authority: "v465_mouth_over_frame",
              phase,
              pass_idx: measurePassIdx,
            },
          },
        });
      }

      // V434 Step 3/4 — scale-free outcome telemetry, printed next to (never
      // instead of) the authoritative v404 verdict.
      const v434 = (v404MotionMeasurement as any)?.v434;
      if (v434) {
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} v434_telemetry scene=${sceneId} pass=${measurePassIdx} ` +
            `mad_ratio=${v434.mad_ratio?.mad_ratio ?? "unknown"} ` +
            `mad_ratio_median=${v434.mad_ratio?.mad_ratio_median ?? "unknown"} ` +
            `preclip_mad=${v434.preclip_mad?.mean ?? "unknown"} provider_mad=${v434.provider_mad?.mean ?? "unknown"} ` +
            `roi_source=${v434.roi?.source} roi_reason=${v434.roi?.reason} ` +
            `roi_applied_to_verdict=${v434.roi_applied_to_verdict} authority=telemetry_only`,
        );
      }
    };

    if (status === "COMPLETED" && outputUrl) {
      const snapPasses: any[] = Array.isArray((state as any).passes) ? (state as any).passes : [];
      const snapMatchedIdx = snapPasses.findIndex((p: any) => p?.job_id === jobId);
      const snapTotalPasses = Number((state as any).total_passes ?? snapPasses.length ?? 1);
      // FA-4 v409 — Sprecher-Klasse NIE aus der Pass-Kardinalität ableiten:
      // der Per-Turn-Split erzeugt mehrere Passes für EINEN `speaker_idx`.
      const snapSpeakerCardinality = classifySpeakerCardinality(snapPasses, {
        totalPasses: snapTotalPasses,
      });
      const snapPassIdx = snapMatchedIdx >= 0
        ? snapMatchedIdx
        : Number((state as any).current_pass ?? 0);
      const snapPass = snapPasses[snapPassIdx] ?? null;

      v404RehostedUrl = await rehostSyncOutput(supabase, sceneId, snapPassIdx, outputUrl);

      // ── V434 Step 1 — IMMUTABLE EVIDENCE COPY ──────────────────────────
      // The legacy re-host key above is MUTABLE (scene+pass only) and was the
      // proven cause of the corrupted v404 calibration ground truth
      // (docs/v433-motion-studio-rca.md). We additionally pin the exact bytes
      // under a run/generation/pass/attempt-qualified key with a recorded
      // sha256. Playback and mux are untouched.
      try {
        const pinUserId = String((scene as any)?.user_id ?? "") ||
          String(v404RehostedUrl?.split("/ai-videos/")[1]?.split("/")[1] ?? "") ||
          "unknown";
        const pinRunId = String((scene as any)?.active_run_id ?? "") || "unknown-run";
        const pinGeneration = Number((scene as any)?.plate_generation ?? 0) || 0;
        // V465-B2a — real attempt qualifier: a NOOP-ladder retry must never
        // collide with the first attempt's key and be silently dropped.
        const pinAttempt = resolveArtifactAttempt(snapPass);
        const key = buildImmutableArtifactKey({
          userId: pinUserId,
          sceneId,
          runId: pinRunId,
          generation: pinGeneration,
          passIdx: snapPassIdx,
          kind: "provider-output",
          attempt: pinAttempt,
        });
        const pin = await pinImmutableArtifact({
          supabase,
          sourceUrl: v404RehostedUrl ?? outputUrl,
          key,
        });
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} v434_pin scene=${sceneId} pass=${snapPassIdx} ` +
            `status=${pin.status} sha256=${pin.sha256 ?? "n/a"} key=${pin.key ?? "n/a"}`,
        );
        await recordV434Pin(supabase, {
          scene_id: sceneId,
          run_id: (scene as any)?.active_run_id ?? null,
          generation: Number.isFinite(Number((scene as any)?.plate_generation))
            ? Number((scene as any).plate_generation)
            : null,
          pass_idx: snapPassIdx,
          attempt: pinAttempt,

          kind: "provider-output",
          source_url: v404RehostedUrl ?? outputUrl,
          pin,
        });
      } catch (e) {
        console.warn(`[sync-so-webhook] v434_pin_crash scene=${sceneId}: ${(e as Error).message}`);
      }

      const prePlan = planPreLockSpeakerMeasurement(snapSpeakerCardinality);
      v404MeasurementDeferred = prePlan.action === "defer";
      if (prePlan.action === "measure") {
        await runServerMotionMeasurement(snapPass, snapPassIdx, "pre_lock");
      } else if (v404MeasurementDeferred) {
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} motion_measure_deferred scene=${sceneId} ` +
            `pass=${snapPassIdx} reason=${prePlan.reason}`,
        );
      }
    }


    // ── FA-4 v410 — Medien-/AWS-I/O NIE unter dem Dialog-Lock ────────────
    // Der Lease (TTL 30 s, kein Renewal) darf niemals über eine Messung
    // (Deadline 27 s), einen HEAD-Probe oder einen MP4-Dimensions-Probe
    // gehalten werden. Die Locked-Phase fordert fehlendes I/O per Sentinel
    // an, der Lock wird freigegeben, das I/O läuft ausserhalb, danach wird
    // frisch gelesen und der Lock neu erworben.
    const headCache = new Map<string, Awaited<ReturnType<typeof headAsset>>>();
    const dimCache = new Map<string, any>();
    let catchUpMeasurePass: any = null;

    const performOutOfLockIo = async (request: Fa4OutOfLockIoRequest): Promise<void> => {
      if (request.kind === "measurement") {
        await runServerMotionMeasurement(
          catchUpMeasurePass,
          request.passIdx,
          "out_of_lock_catch_up",
        );
        return;
      }
      await Promise.all([
        ...request.headUrls.map(async (u) => {
          let v: Awaited<ReturnType<typeof headAsset>> = null;
          try { v = await headAsset(u); } catch { v = null; }
          headCache.set(u, v);
        }),
        ...request.dimUrls.map(async (u) => {
          let v: any = null;
          try { v = await probeMp4Dims(u); } catch { v = null; }
          dimCache.set(u, v);
        }),
      ]);
    };

    const refreshStateBetweenRounds = async (): Promise<void> => {
      const { data: refreshedRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const next = (refreshedRow as any)?.dialog_shots;
      if (next) state = next;
    };

    const __v5PhaseRun = await runLockedPhasesWithOutOfLockIo<Response>({
      performOutOfLockIo,
      refreshBetweenRounds: refreshStateBetweenRounds,
      runLockedPhase: async () => {
        const { result } = await withDialogLock(
          supabase,
          sceneId,
          "sync-so-webhook",
          async () => {


    // v25 Fan-Out: match the job_id against passes[].job_id (preferred) OR
    // the legacy top-level state.sync_job_id (single-pass scenes).
    //
    // v431 G3.2.2 — B5 (v141 `syncso_dispatch_log`-Reattach) ist entfallen:
    // die Pass-Identität kommt ausschließlich aus der gebundenen Ledger-Zeile
    // (`metadata.pass_idx`), bestätigt durch das Slot-Pointer-Paar. Dieses
    // Matching hier dient nur noch der Orphan-Erkennung (B6, Edge-Nebenwirkung)
    // und der Forensik.
    const passesPre = Array.isArray((state as any).passes) ? [...(state as any).passes] : [];
    const matchedIdx = passesPre.findIndex((p: any) => p?.job_id === jobId);
    const isLegacySingle = matchedIdx < 0 && state.sync_job_id === jobId;
    if (matchedIdx < 0 && !isLegacySingle) {
      console.warn(`[sync-so-webhook] v5 scene=${sceneId} job=${jobId} ORPHAN (not in passes[] count=${passesPre.length}) — releasing inflight slot + best-effort provider cancel`);
      // v33: clean up the orphan so we don't leak a Sync.so concurrency slot
      // and don't keep paying for a generation whose state we no longer track.
      try { await releaseInflightSyncJob(supabase, jobId); } catch { /* ignore */ }
      const apiKey = Deno.env.get("SYNC_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY") ?? "";
      if (apiKey && status !== "COMPLETED") {
        fetch(`https://api.sync.so/v2/generations/${encodeURIComponent(jobId)}`, {
          method: "DELETE",
          headers: { "x-api-key": apiKey },
        }).catch(() => { /* best-effort */ });
      }
      return ok({ ok: true, skipped: "v5_job_orphan_cleaned", job_id: jobId });
    }

    // ── v431 G3.2.2 — Post-Commit-Nebenwirkungen zum Scene-Verdict ─────────
    // Der RPC hat bereits committet. Hier laufen ausschließlich Effekte, die
    // nicht in die DB-Transaktion gehören: Wallet-Refund, Mux-Dispatch
    // (exactly-once über `acquireLedgerJob('audio_mux')`), Advance-Kick.
    const settleVerdict = async (res: ApplySyncSegmentResult, extra: Record<string, unknown> = {}) => {
      const verdict = String(res.verdict ?? "");
      const total = Number(res.total_passes ?? passesPre.length ?? 1);
      const done = Number(res.done_count ?? 0);
      let compositor: string | null = null;

      if (verdict === "fail") {
        await refundSceneIfDue(supabase, sceneId!, res);
      } else if (verdict === "dispatch_mux") {
        compositor = await dispatchAudioMux(
          supabase, supabaseUrl, serviceKey, sceneId!, scene, total,
        );
      } else if (verdict === "continue") {
        if (total >= 2 && done === total - 1) {
          try {
            fetch(`${supabaseUrl}/functions/v1/render-sync-segments-audio-mux`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({ warmup: true }),
            }).catch(() => {});
          } catch { /* ignore */ }
        }
        const nextIdx = res.next_pending_pass_idx;
        if (typeof nextIdx === "number" && nextIdx >= 0) {
          try { triggerV5Advance(supabaseUrl, serviceKey, sceneId!, nextIdx, total); } catch { /* ignore */ }
        }
      }

      return ok({
        ok: true,
        scene_id: sceneId,
        job_id: jobId,
        status,
        engine: "sync-segments",
        applied: !!res.applied,
        verdict,
        segment_result: res.segment_result ?? null,
        pass_idx: res.pass_idx ?? null,
        reason: res.reason ?? null,
        ...(compositor ? { compositor } : {}),
        ...extra,
      });
    };



    if (status === "COMPLETED" && outputUrl) {
      // ── v25 Fan-Out: passes run in parallel, all against the ORIGINAL
      //    plate. Webhook simply marks THIS pass done, re-hosts its output
      //    (so the compositor has a stable URL), and dispatches the final
      //    compositor only when EVERY pass is done. No chained next-pass
      //    dispatch (compose-dialog-segments fans them out itself).
      const passes = passesPre;
      // `totalPasses` bleibt reine PASS-Kardinalität (Aggregat, Done-Count,
      // Mux-Fan-In) — sie entscheidet ab v409 NICHT mehr die Sprecher-Klasse.
      const totalPasses = Number((state as any).total_passes ?? passes.length ?? 1);
      const currentPass = matchedIdx >= 0 ? matchedIdx : Number((state as any).current_pass ?? 0);

      // v404 §5 — the rehost already happened OUTSIDE the dialog lock.
      const rehostedUrl: string | null = v404RehostedUrl;


      // v29: Re-read the latest passes[] from the DB and merge ONLY our
      // pass's done-patch so concurrent COMPLETED/FAILED webhooks for sibling
      // passes don't clobber each other's job_ids/status.
      const { data: freshDoneRow } = await supabase
        .from("composer_scenes")
        // v430 Step 1 — the plate columns come along so the finalize below can
        // keep base_video_url intact while writing the processed result.
        .select("dialog_shots, base_video_url, lip_sync_source_clip_url")
        .eq("id", sceneId)
        .maybeSingle();
      const freshDoneState: any = (freshDoneRow as any)?.dialog_shots ?? state;
      const freshDonePasses: any[] = Array.isArray(freshDoneState?.passes)
        ? freshDoneState.passes.map((p: any) => ({ ...p }))
        : passes;

      // ── V459 — Idempotenz VOR Logging und Writes ────────────────────────
      // Der Pass ist bereits terminal NOOP-gescheitert und der Callback gehört
      // zum validierten Attempt-Job-Tupel: reiner No-Op, kein Re-Apply, kein
      // zweiter Ladder-Schritt, keine doppelte Verdict-Zeile.
      if (isTerminalNoopPass(freshDonePasses[currentPass] ?? null)) {
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} v459_idempotent_noop_callback ` +
            `scene=${sceneId} pass=${currentPass} job=${jobId} — no-op`,
        );
        return ok({
          ok: true,
          skipped: "v459_idempotent_terminal_noop",
          scene_id: sceneId,
          pass_idx: currentPass,
          job_id: jobId,
        });
      }

      // ── FA-4 v409 — kanonische Sprecher-Kardinalität ────────────────────
      // Klassifikation IMMER auf dem frischesten Pass-Set UNTER dem Dialog-
      // Lock: der Pre-Lock-Snapshot kann durch das Fan-Out-Race (Pass 0 +
      // root total_passes vor dem Sibling-Seeding) unvollständig sein.
      const freshTotalPasses = Number(
        freshDoneState?.total_passes ?? totalPasses ?? freshDonePasses.length ?? 1,
      );
      const speakerCardinality = classifySpeakerCardinality(freshDonePasses, {
        totalPasses: freshTotalPasses,
      });
      const speakerBranch = decideCompletedSpeakerBranch(speakerCardinality);
      console.log(
        `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} speaker_cardinality scene=${sceneId} pass=${currentPass} ` +
          `distinct=${speakerCardinality.distinctSpeakerCount} total_passes=${freshTotalPasses} ` +
          `observed=${freshDonePasses.length} class=${speakerCardinality.classification} ` +
          `reason=${speakerCardinality.reason}`,
      );
      if (speakerBranch.branch === "fail_closed") {
        // Fail-closed VOR jeder Motion-/Success-Semantik: eine Szene, deren
        // Sprecher-Identität nicht bestimmbar ist, darf weder gemuxt noch
        // retried werden. Terminal-State gehört dem G3.2.2-Apply.
        const indeterminateCardinalityRes = await applySyncSegmentResult(supabase, {
          pipelineJobId: v431CallbackJobId,
          externalJobId: jobId,
          writeId: speakerBranch.writeId,
          providerStatus: "COMPLETED",
          outputUrl: null,
          errorText: speakerBranch.errorText,
        });
        if (!indeterminateCardinalityRes) {
          return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
        }
        console.error(
          `[sync-so-webhook] v409/g322 scene=${sceneId} pass=${currentPass} ` +
            `SPEAKER-CARDINALITY-INDETERMINATE reason=${speakerCardinality.reason} → ssw:failed`,
        );
        return await settleVerdict(indeterminateCardinalityRes, {
          speaker_cardinality: "indeterminate",
          reason: speakerCardinality.reason,
        });
      }

      const passBeforeDone = freshDonePasses[currentPass] ?? null;

      // ── FA-4 v410 — aufgeschobene Multi-Speaker-Messung NICHT unter Lock ──
      // Der Pre-Lock-Snapshot war unvollständig (Fan-Out-Race), das frische
      // Set ist jetzt echtes Multi-Speaker. Die fehlende Messung wird
      // angefordert, der Lock freigegeben, ausserhalb gemessen und dieser
      // Abschnitt danach mit frisch gelesenem Zustand erneut betreten.
      // Kein Apply, kein Mux, kein Retry in dieser Phase.
      const ioDecision = decideUnderLockIoAction({
        fresh: speakerCardinality,
        preLockDeferred: v404MeasurementDeferred,
        hasMeasurement: v404MotionProbe !== null,
      });
      if (
        ioDecision.action === "needs_catch_up_measurement" &&
        status === "COMPLETED" && outputUrl
      ) {
        catchUpMeasurePass = passBeforeDone;
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} motion_measure_catch_up_requested scene=${sceneId} ` +
            `pass=${currentPass} reason=${ioDecision.reason} — releasing dialog lock before measurement`,
        );
        throw new Fa4OutOfLockIoRequired({ kind: "measurement", passIdx: currentPass });
      }

      const inputPreclipUrl = String(passBeforeDone?.preclip_url ?? passBeforeDone?._v105_probe?.payload_video_url ?? "");
      const outputProbeUrl = String(rehostedUrl ?? outputUrl ?? "");
      // v410: HEAD-/MP4-Probes sind Netz-I/O → nur ausserhalb des Locks.
      const missingHeadUrls = [inputPreclipUrl, outputProbeUrl].filter(
        (u) => !!u && !headCache.has(u),
      );
      const missingDimUrls = [inputPreclipUrl, outputProbeUrl].filter(
        (u) => !!u && !dimCache.has(u),
      );
      if (missingHeadUrls.length > 0 || missingDimUrls.length > 0) {
        throw new Fa4OutOfLockIoRequired({
          kind: "media_probe",
          headUrls: missingHeadUrls,
          dimUrls: missingDimUrls,
        });
      }
      const inputHead = inputPreclipUrl ? (headCache.get(inputPreclipUrl) ?? null) : null;
      const outputHead = outputProbeUrl ? (headCache.get(outputProbeUrl) ?? null) : null;
      const inputDims = inputPreclipUrl ? (dimCache.get(inputPreclipUrl) ?? null) : null;
      const outputDims = outputProbeUrl ? (dimCache.get(outputProbeUrl) ?? null) : null;

      const minOutputAxis = Math.min(Number(outputDims?.width ?? 0), Number(outputDims?.height ?? 0));
      const expectedPreclipAxis = Number(passBeforeDone?.preclip_crop?.outputSize ?? 0);
      const syncOutputUnchanged = !!(
        inputHead && outputHead &&
        ((inputHead.etag && outputHead.etag && inputHead.etag === outputHead.etag) ||
          (inputHead.bytes != null && outputHead.bytes != null && inputHead.bytes === outputHead.bytes))
      );
      const syncOutputResolutionRegression = expectedPreclipAxis >= 720 && minOutputAxis > 0 && minOutputAxis < 720;
      // v150 — `reencodedPassthroughSuspect` (sizeRatio 0.65–1.35) lieferte
      // strukturell False-Positives für korrekt lipgesynchte Passes mit
      // wenig Mouth-Movement: Sync.so verändert nur ~10–25% der Frames,
      // Output-Bytes liegen dadurch erwartet bei 70–90% der Input-Bytes.
      // Die Heuristik flaggte das als NOOP, die v134-Ladder dispatch'te
      // 2 weitere identisch-strukturierte Retries (die ebenfalls "0.84"
      // produzierten), und HARD-FAIL'te schließlich einen erfolgreichen
      // Pass (Beispiel: Szene 827ed500 / Matthew Dusatko, 2026-06-20).
      //
      // Wir behalten die Berechnung als reines Forensik-Log, aber sie
      // entscheidet NICHT mehr über `noopSuspect`. Echte NOOPs werden
      // weiterhin deterministisch erkannt:
      //   - `syncOutputUnchanged`         → etag/bytes EXAKT identisch
      //   - `syncOutputResolutionRegression` → min-axis <720 bei ≥720 erwartet
      // Beide sind harte Signale ohne False-Positive-Risiko.
      const inBytes = Number(inputHead?.bytes ?? 0);
      const outBytes = Number(outputHead?.bytes ?? 0);
      const sizeRatio = inBytes > 0 && outBytes > 0 ? outBytes / inBytes : 0;
      const reencodedPassthroughSuspect_DEPRECATED = !syncOutputUnchanged &&
        sizeRatio >= 0.65 && sizeRatio <= 1.35;
      const reencodedPassthroughSuspect = false; // v150: disabled, see comment above
      // v231 — Motion Content Gate für Einzelsprecher (N=1).
      // Für Multi-Cast ist die bytes-Heuristik ein False-Positive-Generator
      // (v150-Kommentar oben). Für N=1 gibt es aber KEINE Kaskaden-Risiken:
      // ein statischer Sync.so-Output („Noop") lässt den Sprecher eingefroren
      // erscheinen und der Kunde bekommt sichtbar keine Lippenbewegung.
      // Deshalb reaktivieren wir den byte-basierten Gate GEZIELT und nur mit
      // einem sehr engen Passthrough-Band (0.92–1.08), das nur echte
      // Beinahe-Identitäts-Outputs trifft (real animiertes Lip-Sync
      // produziert typischerweise sizeRatio ≤ 0.90 durch veränderte
      // Keyframes im Mund-Bereich).
      // FA-4 v409 — Sprecher-Klasse aus distinkten `speaker_idx`, nicht aus
      // der Pass-Anzahl (Per-Turn-Split!). Single-Speaker-Verhalten bleibt
      // damit für 1-Sprecher/N-Turn-Szenen unverändert (v231-Gate aktiv).
      const isSingleSpeakerScene = speakerBranch.branch === "single";
      const singleSpeakerMotionNoop = isSingleSpeakerScene &&
        !syncOutputUnchanged &&
        inBytes > 0 && outBytes > 0 &&
        sizeRatio >= 0.92 && sizeRatio <= 1.08;
      const noopSuspect = syncOutputUnchanged || syncOutputResolutionRegression || singleSpeakerMotionNoop;
      if (singleSpeakerMotionNoop) {
        console.warn(
          `[sync-so-webhook] v231_n1_motion_gate scene=${sceneId} pass=${currentPass} sizeRatio=${sizeRatio.toFixed(3)} → NOOP suspect (single-speaker tight-band)`,
        );
      }
      // v150 — Diagnostik-Log auch wenn nur die alte (jetzt deaktivierte)
      // bytes-Heuristik anschlagen würde. So sehen wir in den Logs, ob die
      // alte v128 noch täglich False-Positives produziert hätte — ohne dass
      // sie noch die Ladder triggert.
      if (reencodedPassthroughSuspect_DEPRECATED && !noopSuspect) {
        console.log(
          `[sync-so-webhook] v150_bytes_heuristic_suppressed scene=${sceneId} pass=${currentPass} sizeRatio=${sizeRatio.toFixed(2)} — alte v128-Heuristik hätte fälschlich NOOP markiert, jetzt unterdrückt.`,
        );
      }
      // v404 FA-4 Server-Side Synchronous Motion Measurement:
      // For multi-speaker scenes the authoritative motion/noop/indeterminate
      // verdict comes from the SERVER measurement executed before this lock
      // (measureProviderMotionSync + PURE classifyMotionProbe). No browser,
      // no client telemetry, no `meta_yavg_probe` dependency.
      // Single-speaker behavior is unchanged.
      const motionProbeResult: MotionProbeResult | null = isSingleSpeakerScene
        ? null
        : (v404MotionProbe ?? {
          verdict: "indeterminate",
          deltaMean: 0,
          deltaPeak: 0,
          preclipMean: 0,
          preclipPeak: 0,
          providerMean: 0,
          providerPeak: 0,
          reason: "motion_probe_indeterminate:measurement_missing",
        });
      const motionVerdictForMultiSpeaker: "motion" | "noop" | "indeterminate" | null =
        isSingleSpeakerScene ? null : (motionProbeResult!.verdict);
      if (!isSingleSpeakerScene) {
        console.log(
          `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} motion_gate scene=${sceneId} pass=${currentPass} ` +
            `verdict=${motionVerdictForMultiSpeaker} delta_mean=${motionProbeResult!.deltaMean} reason=${motionProbeResult!.reason}`,
        );
      }


      if (noopSuspect) {
        const noopReason = syncOutputResolutionRegression
          ? "sync_output_resolution_regression"
          : "sync_output_unchanged";
        await logSyncDispatch(supabase, {
          scene_id: sceneId, job_id: jobId, engine: "sync-segments",
          sync_status: "COMPLETED_NOOP_SUSPECT",
          error_class: "sync_completed_noop",
          meta: {
            v150_terminal: true,
            pass_idx: currentPass,
            attempt_id: passBeforeDone?.attempt_id ?? null,
            model: passBeforeDone?.retry_variant ?? null,
            variant: passBeforeDone?.retry_variant ?? null,
            retry_variant: passBeforeDone?.retry_variant ?? null,
            dispatch_source: "webhook",
            inputHead, outputHead, inputDims, outputDims,
            syncOutputUnchanged, syncOutputResolutionRegression,
            reencodedPassthroughSuspect, sizeRatio,
            reason: noopReason,
            // v403 — for multi-speaker this is supplementary evidence only;
            // the authoritative verdict comes from the motion classifier.
            motion_verdict: motionVerdictForMultiSpeaker,
          },
        });
        console.warn(
          `[sync-so-webhook] v150 scene=${sceneId} pass=${currentPass} NOOP-suspect (${noopReason}, sizeRatio=${sizeRatio.toFixed(2)}) → PASS_DONE_SUSPECT (no auto-retry, awaiting user retry)`,
        );
        // Fall through to mark this pass `done` with `sync_noop_suspect: true`
        // (patched in the freshDonePasses update below).
      }

      // v134 — Deterministic NOOP escalation ladder (sync-3 only, per
      // v129.29 directive). Replaces v129.26's single-shot escalation
      // to `coords-pro` (which dispatched IDENTICAL input and produced
      // the same NOOP). The ladder varies the ASD-shape — the only
      // input axis Sync.so actually responds to — and hard-fails after
      // step 2 instead of silently muxing a NOOP output (which made
      // Speaker 2 in 4-speaker scenes appear frozen).
      //
      // Step 0 (1st NOOP)  → variant `coords-pro-box` (inline bounding_boxes, sync-3 conform)
      // Step 1 (2nd NOOP)  → HARD FAIL + idempotent refund + `needs_clip_rerender`
      //
      // All steps stay on `sync-3`. No model swap. ASD is rebuilt
      // by compose-dialog-segments' v130 buildAsdStrategy() based on the
      // new retry_variant — single source of truth.
      const noopEscalationStep = Number(passBeforeDone?.noop_escalation_step ?? 0);
      const havePlateCoords = Array.isArray(passBeforeDone?.coords) &&
        passBeforeDone.coords.length === 2;
      const havePreclipCrop = !!passBeforeDone?.preclip_crop &&
        Number.isFinite(Number(passBeforeDone.preclip_crop.size));
      const passSpeakerName = String(passBeforeDone?.speaker_name ?? "Speaker");
      const passTurnIdx = Number(passBeforeDone?.idx ?? currentPass);

      // v150 — Step 0 (bbox-url-pro) entfernt: ist nach v147+v150-B bereits
      // PRIMARY auf Fresh-Dispatch für Multi-Speaker. Ein erneuter Retry mit
      // derselben Variante produziert garantiert dasselbe Ergebnis. Nur noch
      // 1 echte Eskalations-Stufe (coords-pro-box), danach Hard-Fail.
      const NOOP_LADDER: Array<{ step: number; variant: string; label: string }> = [
        { step: 0, variant: "coords-pro-box", label: "bounding-box ASD (sync-3)" },
      ];
      const nextRung = NOOP_LADDER.find((r) => r.step === noopEscalationStep);

      // ══ V461 B — no semantically identical re-dispatch ══════════════════
      // Stufe 1 (docs/v461-stage1-dispatch-parity.md) proved: `coords-pro-box`
      // ships the SAME video, the SAME audio and the SAME box coordinates as
      // `bbox-url-pro` — only the transport differs. The rung stays (it is not
      // the root cause), but repeating an unchanged semantic input is refused:
      // it cannot change the provider's answer, it only costs time and money.
      const v461Redispatch = evaluateNoopRedispatch({
        nextVariant: nextRung?.variant ?? null,
        plannedSemanticFingerprint: String(passBeforeDone?.semantic_input_fingerprint ?? ""),
        seenSemanticFingerprints: Array.isArray(passBeforeDone?.noop_semantic_fingerprints)
          ? passBeforeDone.noop_semantic_fingerprints
          : [],
      });
      if (!v461Redispatch.allow) {
        console.log(
          `[sync-so-webhook] scene=${sceneId} pass=${currentPass + 1} v461_semantic_dedup — escalation refused (${v461Redispatch.reason})`,
        );
      }

      // Single-speaker: keep legacy byte-based noopSuspect gate.
      // Multi-speaker: motion classifier is authoritative.
      const canEscalateSingleSpeaker = isSingleSpeakerScene &&
        noopSuspect && !!nextRung && havePlateCoords && havePreclipCrop &&
        Number.isFinite(Number(passBeforeDone?.reference_frame_number));
      const canEscalateMultiSpeaker = !isSingleSpeakerScene &&
        motionVerdictForMultiSpeaker === "noop" && !!nextRung && havePlateCoords && havePreclipCrop &&
        Number.isFinite(Number(passBeforeDone?.reference_frame_number));
      const canEscalate = (canEscalateSingleSpeaker || canEscalateMultiSpeaker) &&
        v461Redispatch.allow;

      // Single-speaker: hard-fail when byte-based NOOP suspect and no ladder rung.
      // Multi-speaker: ladder-exhausted motion noop also hard-fails.
      // Multi-speaker: fail-closed when motion classifier is indeterminate.
      const shouldHardFailNoopLadderExhausted =
        (isSingleSpeakerScene && noopSuspect && !canEscalate) ||
        (!isSingleSpeakerScene && motionVerdictForMultiSpeaker === "noop" && !canEscalate);

      if (shouldHardFailNoopLadderExhausted) {
        // Ladder erschöpft ODER fehlende Inputs → fachliches Segment-Fail.
        // v431 G3.2.2: der Apply gehört ausschließlich dem RPC (write_id
        // `ssw:noop_fail`); Refund + Folge-Dispatch sind Edge-Nebenwirkungen.
        const noopReasonHard = isSingleSpeakerScene
          ? (syncOutputResolutionRegression
            ? "sync_output_resolution_regression"
            : syncOutputUnchanged
              ? "sync_output_unchanged"
              : "sync_output_reencoded_passthrough_suspect")
          : (motionProbeResult?.reason ?? "sync_output_motion_noop_ladder_exhausted");
        const turnStart = Number(passBeforeDone?.segments?.[0]?.startTime ?? 0).toFixed(1);
        const turnEnd = Number(passBeforeDone?.segments?.[0]?.endTime ?? 0).toFixed(1);
        const userMsg = tl({ de: `Lip-Sync für ${passSpeakerName} (Turn ${turnStart}s–${turnEnd}s) konnte nach ${NOOP_LADDER.length + 1} Versuchen nicht erzeugt werden. Bitte Plate neu rendern.`, en: `Lip-sync for ${passSpeakerName} (Turn ${turnStart}s–${turnEnd}s) could not be generated after ${NOOP_LADDER.length + 1} attempts. Please re-render plate.`, es: `La sincronización labial para ${passSpeakerName} (Turno ${turnStart}s–${turnEnd}s) no pudo generarse después de ${NOOP_LADDER.length + 1} intentos. Por favor, vuelve a renderizar la placa.` });

        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          engine: "sync-segments",
          job_id: jobId,
          turn_idx: passTurnIdx,
          sync_status: "NOOP_LADDER_EXHAUSTED",
          error_class: "sync_noop_unrecoverable",
          error_message: userMsg,
          meta: {
            v134_ladder: true,
            pass_idx: currentPass,
            speaker_name: passSpeakerName,
            noop_escalation_step: noopEscalationStep,
            noop_reason: noopReasonHard,
            ladder_size: NOOP_LADDER.length,
            v461_semantic_dedup: !v461Redispatch.allow,
            v461_dedup_code: v461Redispatch.code,
            v461_dedup_reason: v461Redispatch.reason,
            previous_noop_output_url: rehostedUrl ?? outputUrl,
            size_ratio: sizeRatio,
            ...(isSingleSpeakerScene
              ? {}
              : {
                motion_verdict: motionVerdictForMultiSpeaker,
                motion_delta_peak: motionProbeResult?.deltaPeak ?? null,
                motion_delta_mean: motionProbeResult?.deltaMean ?? null,
              }),
          },
        });

        const noopFailRes = await applySyncSegmentResult(supabase, {
          pipelineJobId: v431CallbackJobId,
          externalJobId: jobId,
          writeId: "ssw:noop_fail",
          providerStatus: "COMPLETED",
          outputUrl: null,
          errorText: userMsg,
        });
        if (!noopFailRes) {
          return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
        }
        console.error(
          `[sync-so-webhook] ${isSingleSpeakerScene ? "v134" : "v403"}/g322 scene=${sceneId} pass=${currentPass} speaker="${passSpeakerName}" NOOP-LADDER-EXHAUSTED step=${noopEscalationStep} verdict=${noopFailRes.verdict}`,
        );
        return await settleVerdict(noopFailRes, {
          escalated: "noop_ladder_exhausted_v134",
          speaker_name: passSpeakerName,
        });
      }

      // V443 — split the single `indeterminate` outcome:
      //   probe_infra_error (bounded re-measure exhausted) → pass-through as
      //     success with telemetry state `motion_unverified`; the watchdog
      //     re-measures the SAME immutable output exactly once.
      //   measured_ambiguous (gray zone / unusable metric) → fail-closed as before.
      const v443FailureClass = !isSingleSpeakerScene &&
          motionVerdictForMultiSpeaker === "indeterminate"
        ? classifyMeasurementFailure(motionProbeResult?.reason ?? "")
        : null;
      // V458 — a structurally unresolved mouth ROI is NOT a verdict about the
      // clip either. It is admitted through the SAME narrow gate as a probe
      // infra exhaustion (indeterminate + motion_unverified). No other
      // `measured_ambiguous` reason is ever passed through.
      const v458RoiUnresolvedPassthrough = !isSingleSpeakerScene &&
        motionVerdictForMultiSpeaker === "indeterminate" &&
        v443MotionUnverified &&
        isMouthRoiUnresolved(motionProbeResult?.reason ?? "");
      // V466-A — the V465 gray band is a SAMPLING statement, not a verdict.
      // After the one bounded 16-still re-measure it passes through the same
      // narrow gate: `motion_unverified` (never green, never terminal).
      const v466GrayPassthrough = !isSingleSpeakerScene &&
        motionVerdictForMultiSpeaker === "indeterminate" &&
        v443MotionUnverified &&
        /v465_gray_band/.test(String(motionProbeResult?.reason ?? ""));
      const v443MotionUnverifiedPassthrough = !isSingleSpeakerScene &&
        motionVerdictForMultiSpeaker === "indeterminate" &&
        v443MotionUnverified &&
        (v443FailureClass === "probe_infra_error" || v458RoiUnresolvedPassthrough ||
          v466GrayPassthrough);
      if (v443MotionUnverifiedPassthrough) {
        console.warn(
          `[sync-so-webhook] v443 scene=${sceneId} pass=${currentPass} speaker="${passSpeakerName}" ` +
            `MOTION_UNVERIFIED (${
              v466GrayPassthrough
                ? "v466_gray_band"
                : v458RoiUnresolvedPassthrough
                ? "mouth_roi_unresolved"
                : "probe_infra_error"
            }, ` +
            `attempts=${v443MeasureAttempts}) → success pass-through, telemetry stays motion_unverified ` +
            `(never motion_verified) — no terminalization, no refund, no provider dispatch`,
        );
      }



      if (
        !isSingleSpeakerScene && motionVerdictForMultiSpeaker === "indeterminate" &&
        !v443MotionUnverifiedPassthrough
      ) {
        // v403 — Fail-closed: an unclassified multi-speaker pass must never be
        // muxed as success. The existing G3.2.2 failure-apply owns the terminal
        // state and refund/scene-verdict.
        // v441 — Write-Contract-Fix: `ssw:failed` akzeptiert im RPC NUR echte
        // Provider-Fehler (FAILED/REJECTED/CANCELED). Ein COMPLETED-Provider
        // ohne verwertbaren Output gehört auf `ssw:noop_fail` — sonst kommt
        // `write_id_mismatch` zurück, der Pass bleibt `rendering` und der
        // Watchdog re-forwardet endlos.
        const indeterminateRes = await applySyncSegmentResult(supabase, {
          pipelineJobId: v431CallbackJobId,
          externalJobId: jobId,
          writeId: "ssw:noop_fail",
          providerStatus: "COMPLETED",
          outputUrl: null,
          errorText: "motion_probe_indeterminate",
        });
        if (!indeterminateRes) {
          return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
        }
        console.error(
          `[sync-so-webhook] v403/g322 scene=${sceneId} pass=${currentPass} speaker="${passSpeakerName}" INDETERMINATE reason=${motionProbeResult?.reason ?? "unknown"} → ssw:failed`,
        );
        return await settleVerdict(indeterminateRes, {
          motion_probe: "indeterminate",
          reason: motionProbeResult?.reason ?? "unknown",
        });
      }

      if (canEscalate && nextRung) {
        const newAttemptId = crypto.randomUUID();
        const nextStep = nextRung.step + 1;
        const noopReason = isSingleSpeakerScene
          ? (syncOutputResolutionRegression
            ? "sync_output_resolution_regression"
            : syncOutputUnchanged
              ? "sync_output_unchanged"
              : "sync_output_reencoded_passthrough_suspect")
          : (motionProbeResult?.reason ?? "sync_output_motion_noop");

        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          engine: "sync-segments",
          job_id: jobId,
          turn_idx: passTurnIdx,
          sync_status: "NOOP_ESCALATING",
          error_class: "sync_completed_noop",
          meta: {
            v134_ladder: true,
            pass_idx: currentPass,
            speaker_name: passSpeakerName,
            noop_escalation_step: nextStep,
            from_variant: passBeforeDone?.retry_variant ?? null,
            to_variant: nextRung.variant,
            rung_label: nextRung.label,
            noop_reason: noopReason,
            size_ratio: sizeRatio,
            attempt_id: newAttemptId,
            // v403 — motion classifier diagnostics for multi-speaker retry.
            ...(isSingleSpeakerScene
              ? {}
              : {
                motion_verdict: motionVerdictForMultiSpeaker,
                motion_delta_peak: motionProbeResult?.deltaPeak ?? null,
                motion_delta_mean: motionProbeResult?.deltaMean ?? null,
              }),
          },
        });

        // §5a — Slot-Reset, Segment-Fail (`sync_noop_retryable`) und
        // Replacement-Attempt entstehen atomar im RPC. Der Edge-Aufruf darf
        // KEINEN eigenen Attempt erzeugen.
        const escalateRes = await applySyncSegmentResult(supabase, {
          pipelineJobId: v431CallbackJobId,
          externalJobId: jobId,
          writeId: "ssw:noop_escalate",
          providerStatus: "COMPLETED",
          outputUrl: null,
          errorText: noopReason,
        });
        if (!escalateRes) {
          return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
        }
        if (escalateRes.verdict !== "redispatch" || !escalateRes.replacement_job_id) {
          return await settleVerdict(escalateRes, { escalated: `noop_ladder_step_${nextStep}_v134` });
        }

        try {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              scene_id: sceneId,
              retry: true,
              pass_idx: currentPass,
              retry_variant: nextRung.variant,
              user_retry_flag: true,
              // v404 §10 — `new_attempt_id` hat KEINE Ledger-Autorität: es
              // wird ausschliesslich vom v128-Terminal-Transition-Guard
              // (`canLeaveTerminal`) geprueft. Die Ledger-Identitaet des
              // Retries ist `escalateRes.replacement_job_id` (im RPC erzeugt).
              new_attempt_id: newAttemptId,
              // §5a Schritt 5 — vorab erzeugte Ledger-Identität, kein neuer Attempt.
              pipeline_job_id: escalateRes.replacement_job_id,
              retry_of_pipeline_job_id: v431CallbackJobId,
              retry_reason: "sync_noop_retryable",
              credit_charge_result: "skip",
              noop_auto_escalation: true,
              noop_escalation_step: nextStep,
            }),
          }).catch(() => {});
        } catch { /* ignore */ }

        console.warn(
          `[sync-so-webhook] ${isSingleSpeakerScene ? "v134" : "v403"}/g322 scene=${sceneId} pass=${currentPass} NOOP → escalating step ${nextStep} variant=${nextRung.variant} replacement=${escalateRes.replacement_job_id}`,
        );
        return ok({
          ok: true,
          scene_id: sceneId,
          job_id: jobId,
          status,
          engine: "sync-segments",
          verdict: "redispatch",
          segment_result: escalateRes.segment_result ?? "failed",
          escalated: `noop_ladder_step_${nextStep}_v134`,
          pass_idx: escalateRes.pass_idx ?? currentPass,
          speaker_name: passSpeakerName,
          variant: nextRung.variant,
          replacement_job_id: escalateRes.replacement_job_id,
        });
      }

      // ── Regulärer Segment-Erfolg ────────────────────────────────────────
      // Slot-Patch, Aggregat, Scene-Mirror und Ledger-Terminalisierung laufen
      // in EINER Transaktion. B11 (Single-Speaker-Finalize) ist entfallen:
      // auch N=1 geht über `dispatch_mux` → Mux-Owner → Finalizer.
      const successRes = await applySyncSegmentResult(supabase, {
        pipelineJobId: v431CallbackJobId,
        externalJobId: jobId,
        writeId: "ssw:success",
        providerStatus: "COMPLETED",
        outputUrl: rehostedUrl ?? outputUrl,
        errorText: null,
      });
      if (!successRes) {
        return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
      }
      console.log(
        `[sync-so-webhook] g322 scene=${sceneId} pass=${successRes.pass_idx ?? currentPass} success → verdict=${successRes.verdict} (${successRes.done_count ?? "?"}/${successRes.total_passes ?? totalPasses} done)`,
      );
      return await settleVerdict(successRes, {
        rehosted: !!rehostedUrl,
        noop_suspect: noopSuspect || undefined,
        motion_unverified: v443MotionUnverifiedPassthrough || undefined,
      });

    } else {
      // ── FAILED / REJECTED / CANCELED ────────────────────────────────────
      // v431 G3.2.2: B13 (Forensik-Log) bleibt Edge-Nebenwirkung, der Apply
      // selbst gehört vollständig `composer_apply_sync_segment_result`.
      // B14 (tote Retry-Ladder) und die Whole-JSON-Fail-Writes (B15/B16/B17)
      // sind entfallen — das Scene-Verdict kommt aus dem RPC-Aggregator.
      const rawErr = (errorMsg ?? "unknown").toString();
      const errClass = classifySyncError(rawErr);
      const codeBucket = classifySyncErrorCode(errorCode);
      const codeExplain = explainSyncErrorCode(errorCode);
      const passesArr: any[] = Array.isArray((state as any).passes) ? (state as any).passes : [];
      const currentPass = matchedIdx >= 0 ? matchedIdx : Number((state as any).current_pass ?? 0);
      const currentPassState = passesArr[currentPass] ?? null;

      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          job_id: jobId,
          engine: "sync-segments",
          sync_status: status,
          http_status: 200,
          error_class: errClass,
          error_message: rawErr.slice(0, 500),
          meta: {
            diagnostic_id: currentPassState?.diagnostic_id ?? (state as any).last_diagnostic_id ?? null,
            pass_idx: currentPass,
            total_passes: Number((state as any).total_passes ?? passesArr.length ?? 1),
            retry_variant: currentPassState?.retry_variant ?? (state as any).retry_variant ?? "coords-pro",
            input_summary: {
              video: currentPassState?.input_url ?? (state as any).source_clip_url ?? null,
              audio: currentPassState?.audio_url ?? null,
              coords: currentPassState?.coords ?? null,
              speaker: currentPassState?.speaker_name ?? null,
            },
            webhook_payload: payload,
            sync_error_code: errorCode ?? null,
            sync_error_bucket: codeBucket,
            transient: isTransientSyncError(errClass),
          },
        });
      } catch (_e) { /* ignore log errors */ }

      const noCodeSuffix = !errorCode && isGenericMsg(rawErr)
        ? tl({ de: " — Sync.so lieferte keinen error_code", en: " — Sync.so did not provide an error_code", es: " — Sync.so no proporcionó un error_code" })
        : "";
      const codePrefix = errorCode ? `[${errorCode}] ` : "";
      const explainSuffix = codeExplain ? ` — ${codeExplain}` : "";
      const reason = `syncso_segments_${status}: ${codePrefix}${rawErr.slice(0, 200)}${explainSuffix}${noCodeSuffix}`;

      const failRes = await applySyncSegmentResult(supabase, {
        pipelineJobId: v431CallbackJobId,
        externalJobId: jobId,
        writeId: "ssw:failed",
        providerStatus: status,
        outputUrl: null,
        errorText: reason,
      });
      if (!failRes) {
        return ok({ ok: true, skipped: "apply_unavailable", scene_id: sceneId, job_id: jobId });
      }
      return await settleVerdict(failRes);
    }

    return ok({ ok: true, scene_id: sceneId, job_id: jobId, status, engine: "sync-segments" });
          },
          { ttlSeconds: 30, maxAttempts: 4 },
        );
        return result;
      },
    });
    if (__v5PhaseRun.outcome !== "done") {
      console.error(
        `[sync-so-webhook] ${SYNC_SO_WEBHOOK_VERSION} lock_phase_io_rounds_exhausted scene=${sceneId} ` +
          `job=${jobId} last_request=${__v5PhaseRun.lastRequest?.kind ?? "none"} — no apply, no mux, no retry`,
      );
      return ok({
        ok: true,
        skipped: "lock_phase_io_rounds_exhausted",
        scene_id: sceneId,
        job_id: jobId,
      });
    }
    return __v5PhaseRun.result;

  }

  // ── v70: legacy v4 per-turn chain removed ─────────────────────────────
  // Historical scenes with `dialog_shots.version === 4` (or v5 + shots[])
  // are no longer dispatched. Any late-arriving webhook for them is
  // accepted with a 200 so Sync.so stops retrying, but no state is
  // mutated and `poll-dialog-shots` is no longer fanned out (function
  // deleted). The user must reset such scenes via `reset-lipsync-scene`
  // to restart on the v69 unified pipeline.
  console.log(
    `[sync-so-webhook] legacy_v4_ignored scene=${sceneId} job=${jobId} version=${(state as any)?.version ?? "?"}`,
  );
  return ok({ ok: true, skipped: "legacy_v4_ignored" });
})(req)));

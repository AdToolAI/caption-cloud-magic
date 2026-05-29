/**
 * poll-dialog-shots — v5 SERIAL per-turn Sync.so dispatcher + ffmpeg stitch.
 *
 * v4 design:
 *  - Each turn = ONE Sync.so lipsync-2-pro pass on the ORIGINAL pristine
 *    master plate (no chaining). Tight single-window `segments_secs=[[t]]`
 *    + identity-matched face coords + per-turn temperature.
 *  - Only one new Sync.so turn is dispatched per scene/tick and only when no
 *    other turn is in flight. This keeps Creator-plan concurrency stable.
 *  - Per-tick: poll every in-flight shot, then dispatch the next pending shot.
 *  - On `allReady`: stitch with ffmpeg by time-slicing — window i from
 *    out_T_i, gaps from the pristine master — then remux the master WAV.
 *  - Result: every sentence has identical Sync.so attention, only ONE
 *    re-encode generation per pixel, no chained softening.
 *
 *   pending → lipsyncing (sync_job_id set) → ready (output_url set)
 *                                          → failed
 *   (all turns ready) → stitching → done (clip_url updated)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";
const MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK = 1;

class SyncConcurrencyDeferredError extends Error {
  constructor(message: string, readonly retryAfter?: string | null) {
    super(message);
    this.name = "SyncConcurrencyDeferredError";
  }
}

/** Pre-roll/tail for `segments_secs` (Sync.so VAD onset + frame-grid rounding).
 *  Hard-clamped to ½ of the gap to the nearest neighbour window so it can
 *  never bleed into another turn's region. */
const SYNC_LEAD_IN_SEC = 0.18;
const SYNC_TAIL_SEC = 0.12;

interface DialogShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  /** Single time window for THIS turn (tight voiced range). */
  window: [number, number];
  /** v9 Artlist-style: slightly expanded window (lead-in/tail) used both
   *  as Sync.so `segments_secs` and as the Lambda-stitch overlay range.
   *  Persisting it guarantees stitch + lipsync target the IDENTICAL slice. */
  render_window?: [number, number];
  durSec: number;
  target_coords: [number, number] | null;
  temperature: number;
  /** v7: ISOLATED per-speaker audio (only this speaker's voice + silence
   *  elsewhere). Fixes "ghost-speech" where Sync.so animated the wrong
   *  face because the merged WAV contained other speakers' voices. */
  audio_url?: string;
  /** v7: when true, MUST dispatch with coords + frame_number (no auto). */
  deterministic_coords?: boolean;
  status: "pending" | "lipsyncing" | "ready" | "failed";
  sync_job_id?: string;
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
  last_deferred_at?: string;
  retry_count?: number;
  /** When true, the next dispatch MUST use the coords+frame_number fallback
   *  path instead of auto_detect. */
  force_coords?: boolean;
  /** Optional override for the Sync.so `frame_number` sample point. Used on
   *  retries to avoid the frame that originally triggered Sync.so's
   *  "unknown error" (cuts/blinks/motion blur at window start). */
  frame_number_override?: number;
}


interface DialogShotsState {
  version: 4;
  status: "queued" | "lipsyncing" | "stitching" | "done" | "failed";
  shots: DialogShot[];
  source_clip_url: string;
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  video_width: number;
  video_height: number;
  final_url?: string | null;
  stitch?: { render_id: string; dispatched_at: string };
  finished_at?: string;
  error?: string;
}

function dispatchModeForShot(shot: DialogShot): "auto" | "coords" {
  return shot.target_coords && (shot.deterministic_coords === true || !!shot.force_coords)
    ? "coords"
    : "auto";
}

function isMultiSpeakerScene(allShots: DialogShot[]): boolean {
  return new Set(allShots.map((s) => s.speaker_idx)).size >= 2;
}

const ASSUMED_MASTER_FPS_CONST = 24;

function prepareShotRetry(
  shot: DialogShot,
  reason: string,
  allShots: DialogShot[],
): boolean {
  if ((shot.retry_count ?? 0) >= 1) return false;
  shot.retry_count = (shot.retry_count ?? 0) + 1;
  shot.status = "pending";
  shot.sync_job_id = undefined;
  shot.output_url = undefined;
  shot.started_at = undefined;
  shot.completed_at = undefined;
  shot.error = `retrying_after_${reason}`.slice(0, 300);

  const multi = isMultiSpeakerScene(allShots);

  // Multi-speaker + we have coords → NEVER drop to auto_detect. Auto-detect
  // in a two-shot frame routinely picks the wrong face (and may animate
  // nothing on short isolated windows). Instead, keep coords and shift the
  // sampling frame to the middle of the window so we sidestep Hailuo cuts/
  // blinks at the window start that triggered Sync.so's "unknown error".
  if (multi && shot.target_coords) {
    shot.force_coords = true;
    shot.deterministic_coords = true;
    const [s, e] = shot.window;
    shot.frame_number_override = Math.max(
      0,
      Math.round(((s + e) / 2) * ASSUMED_MASTER_FPS_CONST),
    );
    console.warn(
      `[poll-dialog-shots] turn ${shot.idx} ${reason} → retry coords-locked (multi-speaker) frame=${shot.frame_number_override} (attempt ${shot.retry_count})`,
    );
    return true;
  }

  const failedMode = dispatchModeForShot(shot);
  if (failedMode === "coords") {
    // Single-speaker scenes with coords: safe to fall back to auto_detect.
    shot.force_coords = false;
    shot.deterministic_coords = false;
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry with auto_detect fallback (attempt ${shot.retry_count})`);
  } else if (shot.target_coords) {
    shot.force_coords = true;
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry with coords fallback (attempt ${shot.retry_count})`);
  } else {
    console.warn(`[poll-dialog-shots] turn ${shot.idx} ${reason} → retry with auto_detect (attempt ${shot.retry_count})`);
  }
  return true;
}

function markShotTerminalFailed(shot: DialogShot, error: string) {
  shot.status = "failed";
  shot.error = error.slice(0, 300);
  shot.completed_at = new Date().toISOString();
}

// ── Sync.so dispatch ────────────────────────────────────────────────────

/** Expand a turn's single window with pre-roll/tail, clamping each side
 *  to the nearest neighbour boundary across ALL turns so a pre-roll/tail
 *  can never bleed into another turn's region. */
function expandWindow(
  shot: DialogShot,
  allShots: DialogShot[],
): [number, number] {
  const [start, end] = shot.window;
  const others = allShots.filter((s) => s.idx !== shot.idx).map((s) => s.window);
  const prevEnd = others
    .filter(([, e]) => e <= start)
    .reduce((m, [, e]) => Math.max(m, e), 0);
  const nextStart = others
    .filter(([s]) => s >= end)
    .reduce((m, [s]) => Math.min(m, s), Number.POSITIVE_INFINITY);
  const maxLeadIn = Math.min(SYNC_LEAD_IN_SEC, Math.max(0, (start - prevEnd) / 2));
  const maxTail = Number.isFinite(nextStart)
    ? Math.min(SYNC_TAIL_SEC, Math.max(0, (nextStart - end) / 2))
    : SYNC_TAIL_SEC;
  return [Math.max(0, start - maxLeadIn), end + maxTail];
}

/** Default fps assumption for Hailuo i2v master clips. Used to map a turn's
 *  start time to a `frame_number` so Sync.so samples coords INSIDE the
 *  turn window, not at frame 0 of the master video. */
const ASSUMED_MASTER_FPS = 24;
async function startSyncTurnJob(
  apiKey: string,
  videoUrl: string,
  audioUrl: string,
  window: [number, number],
  coords: [number, number] | null,
  temperature: number,
  turnIdx?: number,
  /** 'auto' = let Sync.so detect the active speaker inside the segment
   *  window (robust against camera moves, recommended primary).
   *  'coords' = use fixed pixel coords + frame_number aligned to the
   *  turn start (deterministic fallback when auto_detect fails). */
  mode: "auto" | "coords" = "auto",
  /** Optional Sync.so webhook URL (B.1 Stage 5). When set, Sync.so will POST
   *  the terminal status to this URL — cuts per-shot completion latency from
   *  ~60s (cron tick) down to ~1s. pg_cron polling stays as safety net. */
  webhookUrl?: string,
  /** Optional override for the `frame_number` coord-sampling point. Used on
   *  retries to step away from the original failing frame (cuts/blinks). */
  frameNumberOverride?: number,
): Promise<string> {
  const options: Record<string, unknown> = {
    output_format: "mp4",
    sync_mode: "cut_off",
    temperature,
  };
  if (mode === "coords" && coords) {
    const frameNumber = Number.isFinite(frameNumberOverride as number)
      ? Math.max(0, Math.round(frameNumberOverride as number))
      : Math.max(0, Math.round(window[0] * ASSUMED_MASTER_FPS));
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: frameNumber,
      coordinates: coords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }
  const payload: Record<string, unknown> = {
    model: LIPSYNC_MODEL,
    input: [
      { type: "video", url: videoUrl, segments_secs: [window] },
      // Sync.so v2 only accepts `segments_secs` on video inputs. Audio MUST be
      // pre-trimmed to the same window upstream (see `ensureTurnAudioUrl`),
      // otherwise Sync.so reads audio from t=0 (= first sentence) while the
      // video plays a later turn → wrong speaker / "unknown error".
      { type: "audio", url: audioUrl },
    ],
    options,
  };


  if (webhookUrl) {
    // Sync.so v2 accepts `webhookUrl` (camelCase). Include `webhook_url` too
    // for forward-compat. Unknown fields are ignored by the API.
    payload.webhookUrl = webhookUrl;
    (payload as any).webhook_url = webhookUrl;
  }
  console.log(
    `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} mode=${mode} window=[${window[0].toFixed(3)},${window[1].toFixed(3)}] dur=${(window[1] - window[0]).toFixed(3)}s coords=${JSON.stringify(coords)} payload=${JSON.stringify(payload).slice(0, 800)}`,
  );

  let r = await fetch(`${SYNC_API_BASE}/generate`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // Always surface rate-limit headers so we can detect plan throttling.
  const rl = {
    limit: r.headers.get("x-ratelimit-limit"),
    remaining: r.headers.get("x-ratelimit-remaining"),
    reset: r.headers.get("x-ratelimit-reset"),
    retryAfter: r.headers.get("retry-after"),
  };
  if (rl.limit || rl.remaining || rl.retryAfter) {
    console.log(
      `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} status=${r.status} rate-limit=${JSON.stringify(rl)}`,
    );
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    if (r.status === 429) {
      console.warn(
        `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} deferred_due_to_concurrency retryAfter=${rl.retryAfter ?? "?"} body=${txt.slice(0, 500)}`,
      );
      throw new SyncConcurrencyDeferredError(
        `sync.so concurrency limit: ${txt.slice(0, 240)}`,
        rl.retryAfter,
      );
    }
    console.error(
      `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} FAILED status=${r.status} body=${txt.slice(0, 1500)}`,
    );
    // Fallback: retry without segments_secs if Sync.so rejects the window.
    if (
      r.status === 400 &&
      /segments? configuration is invalid|only supported for video inputs|invalid.+segment/i.test(txt)
    ) {
      console.warn(
        `[poll-dialog-shots] segment rejected, retry without window: ${txt.slice(0, 200)}`,
      );
      const fallback = { ...payload };
      (fallback.input as any[])[0] = { type: "video", url: videoUrl };
      (fallback.input as any[])[1] = { type: "audio", url: audioUrl };
      r = await fetch(`${SYNC_API_BASE}/generate`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(fallback),
      });
      if (!r.ok) {
        const t2 = await r.text().catch(() => "");
        console.error(
          `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} fallback-FAILED status=${r.status} body=${t2.slice(0, 1500)}`,
        );
        throw new Error(`sync.so create ${r.status}: ${t2.slice(0, 300)}`);
      }
    } else {
      throw new Error(`sync.so create ${r.status}: ${txt.slice(0, 300)}`);
    }
  }

  const data = await r.json();
  console.log(
    `[poll-dialog-shots] DISPATCH turn=${turnIdx ?? "?"} OK job_id=${data.id} status=${data.status ?? "?"}`,
  );
  return String(data.id);
}

async function pollSyncJob(
  apiKey: string,
  jobId: string,
): Promise<{ status: string; outputUrl?: string; error?: string }> {
  const r = await fetch(`${SYNC_API_BASE}/generate/${jobId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    console.error(
      `[poll-dialog-shots] POLL ${jobId} http-error status=${r.status} body=${txt.slice(0, 600)}`,
    );
    return { status: "FAILED", error: `poll ${r.status}: ${txt.slice(0, 200)}` };
  }
  const data = await r.json();
  const status = String(data.status ?? "UNKNOWN");
  // On FAILED/REJECTED/CANCELED, dump the FULL body so we can finally diagnose
  // Sync.so's opaque "unknown error" responses.
  if (["FAILED", "REJECTED", "CANCELED"].includes(status)) {
    console.error(
      `[poll-dialog-shots] POLL ${jobId} terminal=${status} body=${JSON.stringify(data).slice(0, 1500)}`,
    );
  }
  // Robust error extraction — Sync.so spreads error info across many shapes.
  const inputErrors = Array.isArray(data.input)
    ? data.input
        .map((i: any, idx: number) => (i?.error ? `input[${idx}]:${i.error}` : null))
        .filter(Boolean)
        .join("; ")
    : "";
  const errorMsg =
    data.error ??
    data.errorMessage ??
    data.error_message ??
    data.failureReason ??
    data.failure_reason ??
    data.error_detail ??
    data.errorDetail ??
    data.message ??
    (inputErrors || undefined) ??
    (["FAILED", "REJECTED", "CANCELED"].includes(status)
      ? `body:${JSON.stringify(data).slice(0, 240)}`
      : undefined);
  return {
    status,
    outputUrl: data.outputUrl ?? data.output_url ?? undefined,
    error: errorMsg,
  };
}

async function refundIfNeeded(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  state: DialogShotsState,
): Promise<DialogShotsState> {
  if (state.refunded || !state.cost_credits) return state;
  try {
    const { data: w } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (w) {
      await supabase
        .from("wallets")
        .update({
          balance: Number(w.balance ?? 0) + state.cost_credits,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
  } catch (e) {
    console.warn("[poll-dialog-shots] refund failed", (e as Error).message);
  }
  return { ...state, refunded: true };
}

// ── Lambda-side stitch (replaces forbidden Edge-Runtime ffmpeg) ────────
//
// poll-dialog-shots used to run `ffmpeg` via Deno.Command to time-slice
// per-turn outputs against the master plate and remux the WAV. Supabase
// Edge Runtime forbids spawning subprocesses ("Spawning subprocesses is
// not allowed on Supabase Edge Runtime."), so the stitch step now runs
// inside AWS Lambda via the DialogStitchVideo Remotion composition.
//
// We just delegate to render-dialog-stitch, which:
//   1. creates a video_renders row,
//   2. invokes Remotion Lambda with the composition,
//   3. lets remotion-webhook write the final clip_url back to the scene.
async function dispatchDialogStitch(
  supabase: ReturnType<typeof createClient>,
  sceneId: string,
): Promise<{ ok: true; render_id: string } | { ok: false; error: string; code?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resp = await fetch(`${supabaseUrl}/functions/v1/render-dialog-stitch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ sceneId }),
  });
  const raw = await resp.text().catch(() => "");
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!resp.ok) {
    const errStr = (data?.error ?? raw).toString();
    const code =
      data?.code === "aws_credentials_missing" ||
      /security token included in the request is invalid|unrecognizedclientexception|invalidsignatureexception|expiredtoken|http 403|aws_credentials/i.test(errStr)
        ? "aws_credentials_invalid"
        : undefined;
    return { ok: false, error: `render-dialog-stitch ${resp.status}: ${errStr.slice(0, 260)}`, code };
  }
  if (data && (data as any).render_id) {
    return { ok: true, render_id: String((data as any).render_id) };
  }
  return {
    ok: false,
    error: `unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
  };
}

// ── Per-scene processor ─────────────────────────────────────────────────

async function processScene(
  supabase: ReturnType<typeof createClient>,
  syncKey: string,
  sceneId: string,
): Promise<{ status: string; mutated: boolean }> {
  const { data: scene } = await supabase
    .from("composer_scenes")
    .select(
      "id, project_id, dialog_shots, lip_sync_applied_at, clip_url, lip_sync_source_clip_url",
    )
    .eq("id", sceneId)
    .single();
  if (!scene) return { status: "not_found", mutated: false };
  if (scene.lip_sync_applied_at) return { status: "already_done", mutated: false };

  const state = (scene.dialog_shots ?? null) as DialogShotsState | null;
  if (!state) return { status: "no_state", mutated: false };
  if (state.version !== 4) {
    // Legacy v1/v2/v3 state — ignore; user must reset via UI to migrate.
    return { status: `legacy_v${(state as any).version ?? "?"}_ignored`, mutated: false };
  }
  if (state.status === "done" || state.status === "failed") {
    return { status: state.status, mutated: false };
  }

  const { data: project } = await supabase
    .from("composer_projects")
    .select("user_id")
    .eq("id", scene.project_id)
    .single();
  const userId = project?.user_id;

  const shots = state.shots.map((s) => ({ ...s }));
  let mutated = false;
  let newState: DialogShotsState = { ...state, shots };

  // ── Step 1: poll every in-flight shot in parallel ───────────────────
  const inFlight = shots.filter((s) => s.status === "lipsyncing" && s.sync_job_id);
  if (inFlight.length > 0) {
    const polled = await Promise.allSettled(
      inFlight.map((s) => pollSyncJob(syncKey, s.sync_job_id!)),
    );
    polled.forEach((res, i) => {
      const shot = inFlight[i];
      if (res.status !== "fulfilled") {
        console.warn(
          `[poll-dialog-shots] turn ${shot.idx} poll error`,
          (res.reason as Error)?.message,
        );
        return;
      }
      const p = res.value;
      if (p.status === "COMPLETED" && p.outputUrl) {
        shot.output_url = p.outputUrl;
        shot.status = "ready";
        shot.completed_at = new Date().toISOString();
        mutated = true;
      } else if (["FAILED", "REJECTED", "CANCELED"].includes(p.status)) {
        if (!prepareShotRetry(shot, `sync_${p.status}`, shots)) {
          markShotTerminalFailed(shot, `sync_${p.status}: ${p.error ?? "unknown"}`);
        }
        mutated = true;
      }

    });

    // ── Step 1b (Stage 5 B.4): per-shot 8-min watchdog ────────────────
    // A Sync.so job that hasn't returned COMPLETED/FAILED within 8 min
    // after dispatch is functionally dead. Mark it failed with a clear
    // error code so the user (and our diagnostics) can distinguish a
    // provider stall from a render-stitch issue. Refund happens via
    // pipelineStatus='failed' below (refundIfNeeded is idempotent via
    // state.refunded).
    const PER_SHOT_TIMEOUT_MS = 8 * 60 * 1000;
    for (const shot of shots) {
      if (shot.status !== "lipsyncing" || !shot.started_at) continue;
      const ageMs = Date.now() - Date.parse(shot.started_at);
      if (!Number.isFinite(ageMs) || ageMs <= PER_SHOT_TIMEOUT_MS) continue;
      const timeoutReason = `sync_so_timeout_8min: job ${shot.sync_job_id ?? "?"} stuck ${Math.round(ageMs / 1000)}s`;
      if (!prepareShotRetry(shot, "sync_so_timeout_8min", shots)) {
        markShotTerminalFailed(shot, timeoutReason);
      }
      mutated = true;
      console.warn(
        `[poll-dialog-shots] turn ${shot.idx} sync_so_timeout_8min job=${shot.sync_job_id} ageMs=${ageMs}`,
      );
    }
  }

  // Webhook URL for B.1 — Sync.so will POST terminal status here, cutting
  // poll latency from ~60s (cron) to ~1s. The shared secret comes from
  // WEBHOOK_SHARED_SECRET via appendWebhookToken (same scheme as Remotion).
  const supabaseUrl0 = Deno.env.get("SUPABASE_URL") ?? "";
  const syncWebhookUrl = supabaseUrl0
    ? appendWebhookToken(`${supabaseUrl0}/functions/v1/sync-so-webhook?scene_id=${sceneId}`)
    : undefined;


  // ── Step 2: dispatch pending shots (v9 Artlist-style, NO chaining) ──
  // Every turn is lipsynced on the ORIGINAL pristine master plate with its
  // own isolated speaker WAV. Turns are independent → no chaining, no
  // re-encode generation stacking, no risk of a later pass overwriting an
  // earlier speaker's mouth animation. The deterministic Lambda stitch
  // (DialogStitchVideo) recombines them by timeline window afterwards.
  //
  // We dispatch strictly serial per scene: if any turn is still lipsyncing,
  // no new turn starts. This matches Artlist-style provider-pool behavior and
  // avoids Sync.so concurrency/race failures.
  const sortedShots = [...shots].sort((a, b) => a.idx - b.idx);
  const stillInFlight = sortedShots.some((s) => s.status === "lipsyncing" && s.sync_job_id);
  if (stillInFlight) {
    if (mutated) {
      newState = { ...newState, shots, status: "lipsyncing" };
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return { status: "lipsyncing", mutated: true };
    }
    return { status: "lipsyncing", mutated: false };
  }
  const pending = sortedShots.filter((s) => s.status === "pending");
  let dispatchedThisTick = 0;
  for (const nextShot of pending) {
    if (dispatchedThisTick >= MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK) break;
    try {
      // Always render on the ORIGINAL master plate — never on another shot's
      // Sync.so output. Chaining caused later turns to re-animate earlier
      // speakers' mouths with the wrong audio ("ghost speech").
      const sourceUrl = state.source_clip_url;
      const win = (nextShot.render_window
        ?? expandWindow(nextShot, shots)) as [number, number];
      nextShot.render_window = win;
      // Deterministic-first dispatch (Artlist parity, May 2026):
      // For multi-speaker scenes the FaceMap already identity-matched each
      // turn to a pixel coordinate. Letting Sync.so auto_detect the speaker
      // inside a two-shot frame is the #1 cause of "wrong mouth moves" —
      // the provider routinely picks the wrong face when both are visible.
      // → If we have target_coords AND the shot was flagged deterministic
      //   (or this is a retry), dispatch with coords + frame_number.
      // → Only fall back to auto_detect when no coords exist at all
      //   (single-speaker scenes are safe).
      const mode = dispatchModeForShot(nextShot);
      const audioUrl = nextShot.audio_url || state.master_audio_url;
      const jobId = await startSyncTurnJob(
        syncKey,
        sourceUrl,
        audioUrl,
        win,
        nextShot.target_coords,
        nextShot.temperature,
        nextShot.idx,
        mode,
        syncWebhookUrl,
        nextShot.frame_number_override,
      );
      nextShot.sync_job_id = jobId;
      nextShot.status = "lipsyncing";
      nextShot.started_at = new Date().toISOString();
      mutated = true;
      dispatchedThisTick++;
      console.log(
        `[poll-dialog-shots] v9 dispatched turn ${nextShot.idx} speaker=${nextShot.speaker_name} mode=${mode} src=MASTER audio=${audioUrl === state.master_audio_url ? "MERGED(fallback)" : "ISOLATED"} window=[${win[0].toFixed(2)},${win[1].toFixed(2)}] coords=${JSON.stringify(nextShot.target_coords)} temp=${nextShot.temperature} retry=${nextShot.retry_count ?? 0} frameOverride=${nextShot.frame_number_override ?? "default"}`,
      );
    } catch (e) {
      if (e instanceof SyncConcurrencyDeferredError) {
        nextShot.status = "pending";
        nextShot.sync_job_id = undefined;
        nextShot.last_deferred_at = new Date().toISOString();
        mutated = true;
        console.warn(
          `[poll-dialog-shots] turn ${nextShot.idx} deferred_due_to_concurrency retryAfter=${e.retryAfter ?? "?"}`,
        );
        // Stop dispatching more on this tick — concurrency saturated.
        break;
      } else {
        const reason = `dispatch: ${(e as Error)?.message ?? "unknown"}`;
        if (!prepareShotRetry(nextShot, "dispatch_failed", shots)) {
          markShotTerminalFailed(nextShot, reason);
        }
        mutated = true;
      }
    }
  }

  // ── Step 3: determine pipeline status ──────────────────────────────
  const allReady = shots.every((s) => s.status === "ready");
  const hasFailure = shots.some((s) => s.status === "failed");
  const hasActive = shots.some((s) => s.status === "lipsyncing" || s.status === "pending");

  let pipelineStatus: DialogShotsState["status"] = state.status;
  if (allReady) {
    // Don't mark "done" until the Lambda stitch finishes — only ready for
    // the stitch step.
    pipelineStatus = state.stitch?.render_id ? "stitching" : "stitching";
  } else if (hasFailure && !hasActive) {
    pipelineStatus = "failed";
  } else if (hasActive) {
    pipelineStatus = "lipsyncing";
  }

  newState = { ...newState, shots, status: pipelineStatus };

  // ── Step 4: all shots ready → Artlist-style Lambda stitch ───────────
  // We never use the last Sync.so output as the final clip. The Remotion
  // composition `DialogStitchVideo` overlays each per-turn Sync.so output
  // onto the original master plate, trimmed to that turn's window, and
  // remuxes the master WAV as the single canonical audio track.
  if (allReady) {
    // ── Multi-speaker integrity gate ──────────────────────────────────
    // For 2+ speakers, every shot MUST have been dispatched with
    // deterministic coords. A `ready` shot without deterministic_coords
    // means Sync.so ran in auto_detect and almost certainly animated the
    // wrong face. Refuse to ship that as final output.
    const multi = isMultiSpeakerScene(shots);
    if (multi) {
      const invalid = shots.filter(
        (s) => !s.target_coords || s.deterministic_coords !== true,
      );
      if (invalid.length > 0) {
        const ids = invalid.map((s) => s.idx).join(",");
        console.error(
          `[poll-dialog-shots] scene ${sceneId} multi-speaker integrity FAIL — shots [${ids}] missing deterministic coords; refusing stitch.`,
        );
        invalid.forEach((s) =>
          markShotTerminalFailed(
            s,
            `multi_speaker_coords_missing: shot dispatched without deterministic face coords`,
          ),
        );
        const failedState: DialogShotsState = {
          ...newState,
          shots,
          status: "failed",
        };
        const refunded = userId
          ? await refundIfNeeded(supabase, userId, failedState)
          : failedState;
        await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: refunded,
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: `lipsync_wrong_face_guard: shots ${ids} mis-targeted, bitte Szene neu rendern`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        return { status: "failed", mutated: true };
      }
    }

    // Idempotency guard — if a stitch render is already in flight, just
    // persist state and wait for the webhook to write clip_url back. If the
    // previous dispatch failed or never created a render row, clear the stale
    // render_id and retry below — otherwise a scene can sit at 95% forever.
    if (state.stitch?.render_id) {
      const { data: existingRender } = await supabase
        .from("video_renders")
        .select("status")
        .eq("render_id", state.stitch.render_id)
        .maybeSingle();
      const renderStatus = String(existingRender?.status ?? "missing");
      if (!["pending", "rendering", "completed"].includes(renderStatus)) {
        console.warn(
          `[poll-dialog-shots] stale stitch render ${state.stitch.render_id} status=${renderStatus}; retrying dispatch`,
        );
        newState = {
          ...newState,
          stitch: undefined,
          status: "stitching",
          error: `stale_stitch_render:${renderStatus}`,
        } as DialogShotsState;
      } else {
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "stitching",
          twoshot_stage: "dialog_stitching",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return { status: "stitching", mutated: true };
      }
    }

    // Credential-blocked cooldown: if a previous tick saw AWS_INVALID, hold off
    // re-dispatching for 10 minutes so we don't spam Lambda once per minute.
    const blockedAt = (newState as any).stitch_blocked_at as string | undefined;
    const blockedCode = (newState as any).stitch_blocked_code as string | undefined;
    if (blockedCode === "aws_credentials_invalid" && blockedAt) {
      const ageMs = Date.now() - Date.parse(blockedAt);
      if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) {
        return { status: "stitching_blocked_credentials", mutated };
      }
    }

    const dispatch = await dispatchDialogStitch(supabase, sceneId);
    if (!dispatch.ok) {
      const isCredBlock = dispatch.code === "aws_credentials_invalid";
      console.warn(
        `[poll-dialog-shots] stitch dispatch failed${isCredBlock ? " (CREDENTIALS BLOCKED)" : ""}: ${dispatch.error}`,
      );
      const patched: any = {
        ...newState,
        stitch_error: dispatch.error.slice(0, 500),
      };
      if (isCredBlock) {
        patched.stitch_blocked_at = new Date().toISOString();
        patched.stitch_blocked_code = "aws_credentials_invalid";
      }
      const clipErrorMsg = isCredBlock
        ? "render_credentials_invalid: AWS Render-Credentials sind ungültig oder abgelaufen. Bitte AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (ggf. AWS_SESSION_TOKEN) erneuern."
        : `dialog_stitch_dispatch: ${dispatch.error}`;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: patched,
          lip_sync_status: "stitching",
          twoshot_stage: "dialog_stitching",
          clip_error: clipErrorMsg.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return {
        status: isCredBlock ? "stitching_blocked_credentials" : "stitching",
        mutated: true,
      };
    }

    console.log(
      `[poll-dialog-shots] v9 scene ${sceneId} all turns ready → stitch render ${dispatch.render_id} dispatched`,
    );
    // `render-dialog-stitch` already persists `dialog_shots.stitch.render_id`
    // and sets `lip_sync_status='stitching'`. `remotion-webhook` writes the
    // final clip_url + lip_sync_applied_at on completion.
    return { status: "stitching", mutated: true };
  }


  // ── Step 5: terminal failure → refund + persist ─────────────────────
  if (pipelineStatus === "failed") {
    if (userId) newState = await refundIfNeeded(supabase, userId, newState);
    const firstErr = shots.find((s) => s.error)?.error ?? "unknown";
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "failed",
        twoshot_stage: "failed",
        clip_error: `dialog_shots_failed: ${firstErr}`.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
    return { status: "failed", mutated: true };
  }

  // ── Step 6: mid-flight persist ─────────────────────────────────────
  if (mutated) {
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: newState,
        lip_sync_status: "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
  }

  return { status: pipelineStatus, mutated };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncKey =
      Deno.env.get("SYNC_API_KEY") ??
      Deno.env.get("SYNC_SO_API_KEY") ??
      Deno.env.get("SYNCSO_API_KEY");
    if (!syncKey) {
      return json(
        {
          error: "missing_sync_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* empty body OK (pg_cron tick) */
    }
    const url = new URL(req.url);
    const querySceneId = url.searchParams.get("scene_id");
    const targetSceneId = (body?.scene_id as string) ?? querySceneId ?? null;

    let sceneIds: string[] = [];
    let kickstarted: string[] = [];
    if (targetSceneId) {
      sceneIds = [targetSceneId];
    } else {
      const { data: rows } = await supabase
        .from("composer_scenes")
        .select("id, dialog_shots")
        .in("lip_sync_status", ["running", "stitching"]);
      sceneIds = (rows ?? [])
        .filter(
          (r: any) =>
            r?.dialog_shots?.version === 4 &&
            ["queued", "lipsyncing", "stitching"].includes(
              String(r.dialog_shots?.status),
            ),
        )
        .map((r: any) => r.id);

      // ── Kickstart sweep ────────────────────────────────────────────────
      // Cinematic-Sync scenes whose master clip is ready but whose Lip-Sync
      // never started (no dialog_shots, lip_sync_status pending/null) get
      // stuck because the post-render handoff (compose-clip-webhook fire-and-
      // forget) sometimes drops. We sweep them here on every cron tick.
      // Guard with a 30s grace so we don't race the in-flight handoff.
      const { data: stuckRows } = await supabase
        .from("composer_scenes")
        .select("id, updated_at")
        .eq("engine_override", "cinematic-sync")
        .eq("clip_status", "ready")
        .is("dialog_shots", null)
        .is("lip_sync_applied_at", null)
        .not("clip_url", "is", null)
        .or("lip_sync_status.is.null,lip_sync_status.eq.pending");
      const GRACE_MS = 30_000;
      const now = Date.now();
      const toKick = (stuckRows ?? []).filter((r: any) => {
        const ts = r?.updated_at ? Date.parse(r.updated_at) : 0;
        return !ts || now - ts > GRACE_MS;
      });
      if (toKick.length > 0) {
        console.log(
          `[poll-dialog-shots] kickstart sweep: ${toKick.length} scene(s) need compose-dialog-scene`,
        );
        for (const r of toKick) {
          kickstarted.push(r.id);
          // Fire-and-forget; compose-dialog-scene returns 202 and handles its own state.
          const kickPromise = fetch(
            `${supabaseUrl}/functions/v1/compose-dialog-scene`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ scene_id: r.id }),
            },
          ).then(async (resp) => {
            if (!resp.ok) {
              const t = await resp.text().catch(() => "");
              console.warn(
                `[poll-dialog-shots] kickstart compose-dialog-scene ${r.id} failed ${resp.status}: ${t.slice(0, 300)}`,
              );
              // Stop the endless cron loop: if compose-dialog-scene rejects
              // with a permanent precondition error, mark the scene as failed
              // with a clear clip_error so the UI shows a retry hint instead
              // of spinning forever.
              const permanent =
                resp.status === 422 ||
                resp.status === 400 ||
                resp.status === 404 ||
                resp.status === 403;
              if (permanent) {
                let code = `compose_dialog_scene_${resp.status}`;
                try {
                  const j = JSON.parse(t);
                  if (j?.error) code = String(j.error);
                } catch { /* keep default */ }
                await supabase
                  .from("composer_scenes")
                  .update({
                    lip_sync_status: "failed",
                    clip_error: `lipsync_kickstart_failed:${code}`,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", r.id);
              }
            }
          }).catch((e) => {
            console.warn(
              `[poll-dialog-shots] kickstart compose-dialog-scene ${r.id} threw: ${(e as Error).message}`,
            );
          });
          // @ts-ignore EdgeRuntime is global
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(kickPromise);
          }
        }
      }
    }


    if (sceneIds.length === 0) {
      return json({ ok: true, processed: 0, kickstarted });
    }

    const results: any[] = [];
    for (const id of sceneIds) {
      try {
        const r = await processScene(supabase, syncKey, id);
        results.push({ scene_id: id, ...r });
      } catch (e) {
        console.error(`[poll-dialog-shots] scene ${id} crashed`, e);
        results.push({ scene_id: id, error: (e as Error).message });
      }
    }

    return json({ ok: true, processed: sceneIds.length, results });
  } catch (e) {
    console.error("[poll-dialog-shots] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

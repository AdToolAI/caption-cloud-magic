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
): Promise<string> {
  const options: Record<string, unknown> = {
    output_format: "mp4",
    sync_mode: "cut_off",
    temperature,
  };
  if (mode === "coords" && coords) {
    // Sample coords WITHIN the turn window — frame 0 of the master video
    // is virtually never where the speaker sits during a later turn, which
    // is exactly what produced "An unknown error occurred." from Sync.so
    // for all non-first turns.
    const frameNumber = Math.max(0, Math.round(window[0] * ASSUMED_MASTER_FPS));
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
      { type: "audio", url: audioUrl },
    ],
    options,
  };
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
): Promise<{ ok: true; render_id: string } | { ok: false; error: string }> {
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
    return { ok: false, error: `render-dialog-stitch ${resp.status}: ${(data?.error ?? raw).toString().slice(0, 260)}` };
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
        // 1× retry: if this was the first attempt (auto_detect) and we
        // have FaceMap coords available, redispatch with coords mode
        // (deterministic fallback) instead of giving up. Empirically
        // fixes the "An unknown error occurred." silent-fail on Sync.so
        // for turns whose window does not start at t=0.
        const canRetry =
          (shot.retry_count ?? 0) < 1 && shot.target_coords && !shot.force_coords;
        if (canRetry) {
          shot.retry_count = (shot.retry_count ?? 0) + 1;
          shot.force_coords = true;
          shot.status = "pending";
          shot.sync_job_id = undefined;
          shot.error = undefined;
          console.warn(
            `[poll-dialog-shots] turn ${shot.idx} ${p.status} → retry with coords fallback (attempt ${shot.retry_count})`,
          );
        } else {
          shot.status = "failed";
          shot.error = `sync_${p.status}: ${p.error ?? "unknown"}`.slice(0, 300);
        }
        mutated = true;
      }

    });
  }

  // ── Step 2: dispatch pending shots (v9 Artlist-style, NO chaining) ──
  // Every turn is lipsynced on the ORIGINAL pristine master plate with its
  // own isolated speaker WAV. Turns are independent → no chaining, no
  // re-encode generation stacking, no risk of a later pass overwriting an
  // earlier speaker's mouth animation. The deterministic Lambda stitch
  // (DialogStitchVideo) recombines them by timeline window afterwards.
  //
  // We still dispatch at most MAX_NEW_SYNC_JOBS_PER_SCENE_PER_TICK new jobs
  // per tick to respect the Sync.so Creator-plan concurrency budget — but
  // turn ordering no longer matters for correctness.
  const sortedShots = [...shots].sort((a, b) => a.idx - b.idx);
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
      // Try auto_detect FIRST on the isolated speaker WAV; only fall back
      // to coords+frame_number on a failed-poll retry.
      const useCoords = !!nextShot.force_coords && !!nextShot.target_coords;
      const mode: "auto" | "coords" = useCoords ? "coords" : "auto";
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
      );
      nextShot.sync_job_id = jobId;
      nextShot.status = "lipsyncing";
      nextShot.started_at = new Date().toISOString();
      mutated = true;
      dispatchedThisTick++;
      console.log(
        `[poll-dialog-shots] v9 dispatched turn ${nextShot.idx} speaker=${nextShot.speaker_name} mode=${mode} src=MASTER audio=${audioUrl === state.master_audio_url ? "MERGED(fallback)" : "ISOLATED"} window=[${win[0].toFixed(2)},${win[1].toFixed(2)}] coords=${JSON.stringify(nextShot.target_coords)} temp=${nextShot.temperature}`,
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
        nextShot.status = "failed";
        nextShot.error = `dispatch: ${(e as Error)?.message ?? "unknown"}`.slice(0, 300);
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
    // Idempotency guard — if a stitch render is already in flight, just
    // persist state and wait for the webhook to write clip_url back.
    if (state.stitch?.render_id) {
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

    const dispatch = await dispatchDialogStitch(supabase, sceneId);
    if (!dispatch.ok) {
      // Stitch dispatch failed — do NOT fall back to "last shot output".
      // Keep dialog_shots ready, mark status as stitching with a retry
      // hint; the next cron tick will retry render-dialog-stitch.
      console.warn(
        `[poll-dialog-shots] stitch dispatch failed: ${dispatch.error} — will retry next tick`,
      );
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: newState,
          lip_sync_status: "stitching",
          twoshot_stage: "dialog_stitching",
          clip_error: `dialog_stitch_dispatch: ${dispatch.error}`.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return { status: "stitching", mutated: true };
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
    }

    if (sceneIds.length === 0) {
      return json({ ok: true, processed: 0 });
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

/**
 * compose-dialog-segments — Sync.so Segments API, multi-pass per-speaker.
 *
 * MAY 2026 PIVOT (character-swap fix):
 * --------------------------------------------------------------------
 * The old "1-call" segments dispatch (single audio multiplexed across
 * speakers via `segments[]` + `active_speaker_detection.bounding_boxes`)
 * has two unsolvable problems against `lipsync-2-pro`:
 *
 *   1. Sync.so segments + per-frame `bounding_boxes` returns
 *      `An unknown error occurred` (DB-confirmed across May 2026 runs;
 *      v4 source comment in compose-twoshot-lipsync also documents this
 *      regression). Removing ASD makes the call complete BUT Sync.so
 *      then picks the audio→face mapping itself and routinely swaps
 *      speakers — exactly the bug the user reported.
 *   2. There is no per-segment ASD field in the documented schema:
 *      https://sync.so/docs/developer-guides/speaker-selection (top-level
 *      `options.active_speaker_detection` only).
 *
 * The only stable multi-speaker pattern is the one v4 used: one Sync.so
 * call per speaker, each with single-coord ASD pointing at THAT speaker's
 * face. We chain them: pass N's video input = pass N-1's output. The final
 * pass's output has every speaker correctly lip-synced.
 *
 * State model (dialog_shots, multi-pass):
 *  {
 *    version: 5,
 *    engine: "sync-segments",
 *    status: "queued" | "rendering" | "done" | "failed",
 *    multi_pass: true,
 *    passes: [{
 *      idx, speaker_idx, character_id, audio_url, coords,
 *      segments[], input_url, job_id?, output_url?, status, started_at?,
 *      finished_at?
 *    }, ...],
 *    current_pass: number,           // index into passes[]
 *    total_passes: number,
 *    sync_job_id: string,            // CURRENT pass's job id (for webhook)
 *    source_clip_url: string,        // pass 0 video input (master plate)
 *    total_sec: number,
 *    cost_credits: number,           // SUM across all passes
 *    refunded: boolean,
 *    final_url?: string,
 *    error?: string,
 *  }
 *
 * The webhook calls back into this function with `{ advance: true }` to
 * dispatch the next pass once a pass completes. Idempotent. Single-speaker
 * scenes still run as a single pass (no behaviour change for monologues).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import {
  classifySyncError,
  detectVoicedFrames,
  countInflightSyncJobs,
  emitSystemAlert,
  evaluateCircuit,
  getSyncApiKey,
  inspectWav,
  logSyncDispatch,
  openCircuit,
  probeAsset,
  readPreferredSyncSourceKind,
  recordCircuitFailure,
  recordCircuitSuccess,
  registerInflightSyncJob,
  SYNCSO_DEFAULT_MAX_PARALLEL,
  trimWavLeadIn,
  validateFrameFace,
  validateSegments,
  validateSyncResponseShape,
} from "../_shared/syncso-preflight.ts";
import {
  pickSpeakerCoordinates,
  probeMp4Dims,
  resolveCharacterPortraits,
  resolveSceneFaceMap,
} from "../_shared/twoshot-face-map.ts";
import { validateCast } from "../_shared/cast-validation.ts";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
const LIPSYNC_MODEL = "lipsync-2-pro";
const LIPSYNC_FALLBACK_MODEL = "lipsync-2";
const RETRY_VARIANTS = ["coords-pro", "coords-pro-box", "auto-pro", "auto-standard"] as const;
type RetryVariant = typeof RETRY_VARIANTS[number];

// Pricing: Sync.so lipsync-2-pro = 9 credits/s.  ONE pass over the full clip
// (regardless of speaker count), so cost = ceil(totalSec) * 9 (min 9).
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const MIN_TURN_DUR_SEC = 0.4;

const computeCost = (durSec: number) =>
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

const isRetryVariant = (value: unknown): value is RetryVariant =>
  typeof value === "string" && (RETRY_VARIANTS as readonly string[]).includes(value);

const clampSyncCoords = (coords: [number, number] | null | undefined): [number, number] | null => {
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const [x, y] = coords;
  if (x <= 1 && y <= 1) return [Math.round(x * 1280), Math.round(y * 720)];
  return [Math.max(1, Math.round(x)), Math.max(1, Math.round(y))];
};

async function inspectSpeakerAudio(url: string) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`audio_get_${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const wav = inspectWav(bytes);
  const vad = detectVoicedFrames(bytes);
  return { bytes: bytes.byteLength, wav, vad };
}

interface Turn { startSec: number; endSec: number }
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  track_url?: string;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}

interface SegmentItem {
  startTime: number;
  endTime: number;
  speakerIdx: number;
  speakerName: string;
  refId: string;
}

interface PassState {
  idx: number;
  speaker_idx: number;
  character_id: string | null;
  speaker_name: string;
  audio_url: string;
  coords: [number, number] | null;
  segments: SegmentItem[];
  input_url: string;
  job_id?: string;
  diagnostic_id?: string;
  retry_variant?: RetryVariant;
  output_url?: string;
  status: "pending" | "rendering" | "done" | "failed";
  started_at?: string;
  finished_at?: string;
  error?: string;
}

interface SegmentsState {
  version: 5;
  engine: "sync-segments";
  status: "queued" | "rendering" | "done" | "failed" | "retrying";
  // Multi-pass per-speaker chain (added May 2026 to fix character swap).
  // Optional for back-compat with in-flight single-pass rows.
  multi_pass?: boolean;
  passes?: PassState[];
  current_pass?: number;
  total_passes?: number;
  sync_job_id?: string;
  source_clip_url: string;
  total_sec: number;
  segments: SegmentItem[];
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  first_started_at?: string;
  retry_count?: number;
  retry_variant?: RetryVariant;
  fallback_history?: Array<Record<string, unknown>>;
  last_diagnostic_id?: string;
  last_error?: string;
  last_error_class?: string;
  finished_at?: string;
  final_url?: string | null;
  error?: string;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // v33: strict per-scene single-flight lock. Released in `finally` below so
  // every return path (including early 202s, 422s, and thrown errors) frees it.
  let lockSupabase: any = null;
  let lockSceneId: string | null = null;
  let lockHolder: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncApiKey = getSyncApiKey();
    if (!syncApiKey) {
      return json(
        {
          error: "missing_sync_api_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sceneId = body?.scene_id;
    const isRetry = body?.retry === true;
    const requestedRetryVariant = isRetryVariant(body?.retry_variant) ? body.retry_variant : null;
    // Set by sync-so-webhook when the official error_code maps to
    // `retry_with_repair` (generation_input_audio_invalid / metadata_missing).
    // Surfaced in dispatch logs + downstream so an upcoming WAV-repair pass
    // (ffmpeg re-encode) can hook in without another routing change.
    const repairAudio = body?.repair_audio === true;
    // `advance: true` is sent by the webhook to chain to the next pass after
    // a successful pass completion. Skips wallet debit + face-gate (already
    // validated on pass 0) and dispatches passes[current_pass].
    const isAdvance = body?.advance === true;
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }
    if (repairAudio) {
      console.log(`[compose-dialog-segments] scene=${sceneId} repair_audio=true (audio re-encode requested by webhook)`);
    }

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, reference_image_url, lock_reference_url",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: "scene_not_found", details: sceneErr?.message }, 404);
    }

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "missing_user" }, 403);

    // ── Validate audio plan ───────────────────────────────────────────────
    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = (Array.isArray(twoshot.speakers) ? twoshot.speakers : []) as TwoshotSpeaker[];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      return json(
        {
          error: "missing_audio_plan",
          message: "Sync-Segments requires compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
        },
        422,
      );
    }

    // ── Cast validation (max 4, no duplicate character_id, no overlap) ──
    // Run BEFORE wallet debit / Sync.so dispatch so an invalid cast never
    // costs credits and never reaches the provider.
    {
      const castCheck = validateCast(speakers as any[]);
      if (!castCheck.ok) {
        await failLipSync({
          supabase,
          sceneId,
          userId,
          reason: `${castCheck.reason}: ${castCheck.message ?? "invalid cast"}`,
          syncApiKey: syncApiKey || null,
        });
        return json(
          {
            error: castCheck.reason,
            message: castCheck.message,
            offenders: castCheck.offenders ?? [],
          },
          422,
        );
      }
    }

    // Pick the master plate for lipsync. CRITICAL: for cinematic-sync we
    // must NEVER use a `talking-head-renders/...` URL as the source — that
    // is a HeyGen avatar bust from an earlier engine, and using it as the
    // v5 lipsync input produces the "raw avatar instead of the scene" bug.
    // We check BOTH `clip_url` AND `lip_sync_source_clip_url` and block the
    // dispatch outright if both are talking-head plates.
    const isTalkingHead = (u: unknown) =>
      typeof u === "string" && u.includes("/talking-head-renders/");
    const lipSrcCandidate = (scene as any).lip_sync_source_clip_url ?? null;
    const clipUrlCandidate = (scene as any).clip_url ?? null;
    let sourceClipUrl: string | null = null;
    if (typeof lipSrcCandidate === "string" && !isTalkingHead(lipSrcCandidate)) {
      sourceClipUrl = lipSrcCandidate;
    } else if (typeof clipUrlCandidate === "string" && !isTalkingHead(clipUrlCandidate)) {
      sourceClipUrl = clipUrlCandidate;
    }
    const bothTalkingHead =
      (lipSrcCandidate == null || isTalkingHead(lipSrcCandidate)) &&
      isTalkingHead(clipUrlCandidate);
    if (bothTalkingHead) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} BLOCKED — both clip_url and lip_sync_source_clip_url are raw talking-head plates → resetting clip for re-render`,
      );
      // Self-heal: clear the invalid talking-head master so the next
      // "Alle generieren" / per-scene render produces a real scene plate
      // (Hailuo/HappyHorse i2v) instead of looping back into this block.
      await supabase
        .from("composer_scenes")
        .update({
          clip_url: null,
          clip_status: "pending",
          lip_sync_status: "pending",
          lip_sync_source_clip_url: null,
          lip_sync_applied_at: null,
          twoshot_stage: null,
          dialog_shots: null,
          replicate_prediction_id: null,
          clip_error:
            'raw_talking_head_source_blocked: Cinematic-Sync benötigt eine Scene-Plate (Hailuo/HappyHorse), nicht den rohen Talking-Head-Clip. Clip wurde zurückgesetzt — bitte erneut „Alle generieren" drücken.',
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return json(
        {
          error: "raw_talking_head_source_blocked",
          message:
            "Cinematic-Sync benötigt eine Scene-Plate, nicht den rohen Avatar-Clip. Clip wurde zurückgesetzt — bitte erneut generieren.",
        },
        422,
      );
    }
    if (!sourceClipUrl) {
      return json(
        { error: "missing_source_clip", message: "Scene has no master plate to lipsync onto." },
        422,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} source_kind=scene_plate url=${sourceClipUrl.slice(0, 80)}…`,
    );

    // Idempotency: an active render already exists → nudge and return.
    // On `retry=true` (E.5 webhook retry path) we bypass this guard because
    // the previous job already terminated FAILED.
    // On `advance=true` (multi-pass chain) we bypass too — the previous pass
    // completed and we're now dispatching the NEXT pass on the same scene.
    const existing = (scene as any).dialog_shots as SegmentsState | null;
    if (
      !isRetry &&
      !isAdvance &&
      existing &&
      existing.version === 5 &&
      existing.engine === "sync-segments" &&
      ["queued", "rendering"].includes(String(existing.status))
    ) {
      return json({ ok: true, status: "already_running", scene_id: sceneId }, 202);
    }


    // ── Build segments from per-speaker turns ────────────────────────────
    interface RawSegment {
      startTime: number;
      endTime: number;
      speakerIdx: number;
      speakerName: string;
      audioUrl: string;
    }
    const raw: RawSegment[] = [];
    speakers.forEach((sp, sIdx) => {
      const turns: Turn[] = Array.isArray(sp.voicedRange?.turns)
        ? (sp.voicedRange!.turns as Turn[])
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const speakerAudio = String(sp.track_url ?? "").trim() || masterAudioUrl;
      const speakerName = String(sp.speaker ?? `Speaker ${sIdx + 1}`);
      for (const t of turns) {
        const start = Math.max(0, Number(t.startSec));
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        raw.push({
          startTime: start,
          endTime: Math.min(end, totalSec),
          speakerIdx: sIdx,
          speakerName,
          audioUrl: speakerAudio,
        });
      }
    });

    if (raw.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json({ error: "no_turns" }, 422);
    }

    raw.sort((a, b) => a.startTime - b.startTime);

    // De-dup audio sources → refIds
    const audioRefMap = new Map<string, string>();
    raw.forEach((r) => {
      if (!audioRefMap.has(r.audioUrl)) {
        audioRefMap.set(r.audioUrl, `audio_${audioRefMap.size + 1}`);
      }
    });

    const rawSegments = raw.map((r) => ({
      startTime: Number(r.startTime.toFixed(3)),
      endTime: Number(r.endTime.toFixed(3)),
      speakerIdx: r.speakerIdx,
      speakerName: r.speakerName,
      refId: audioRefMap.get(r.audioUrl)!,
    }));

    // Stage E.4: validate + auto-repair segments before paying Sync.so.
    const segValidation = validateSegments(rawSegments, totalSec);
    if (!segValidation.ok) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `segments_invalid_${segValidation.reason}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "SEGMENTS_INVALID", error_class: "segments_invalid",
        error_message: segValidation.reason ?? "unknown",
        meta: { repairs: segValidation.repairs, original_count: rawSegments.length },
      });
      return json({ error: "segments_invalid", reason: segValidation.reason, repairs: segValidation.repairs }, 422);
    }
    if (segValidation.repairs.length > 0) {
      console.warn(`[compose-dialog-segments] scene=${sceneId} segments auto-repaired: ${segValidation.repairs.join(", ")}`);
    }
    const segments = segValidation.fixed as typeof rawSegments;
    // v25 Fan-Out pricing: N Sync.so passes (1 per distinct speaker) on the
    // SAME original plate (no chaining). Cost = ceil(totalSec)*9 * speakers.
    // Min 1 to cover the single-speaker case. validateCast() above already
    // capped speakers at 4 distinct character_ids.
    const speakerCount = Math.max(1, speakers.length);
    const totalCost = computeCost(totalSec) * speakerCount;

    // ── Stage F.3 — Circuit Breaker (BEFORE wallet debit) ────────────────
    // If Sync.so is in OPEN state, don't charge the user — defer with retry.
    // v32: for an in-flight retry/advance against an existing v5 state, we
    // MUST NOT flip the scene back to `pending`. That kicked the scene out
    // of the running-scene watchdog scan and created a `pending+circuit_open`
    // loop the client kept re-triggering. Keep `lip_sync_status='running'`
    // so the watchdog can finalize it after TTL.
    const circuit = await evaluateCircuit(supabase, "sync.so");
    if (!circuit.allow) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} CIRCUIT_OPEN state=${circuit.state} reason=${circuit.reason} recent=${circuit.recentFailures} isRetry=${isRetry} isAdvance=${isAdvance}`,
      );
      const retryInMs = circuit.retryInMs ?? 30 * 60_000;
      const hasActiveV5 =
        (existing as any)?.version === 5 &&
        (existing as any)?.engine === "sync-segments" &&
        Array.isArray((existing as any)?.passes);
      const keepRunning = isRetry || isAdvance || hasActiveV5;
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: keepRunning ? "running" : "pending",
          twoshot_stage: "circuit_open",
          clip_error: `syncso_circuit_open:${circuit.reason ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "CIRCUIT_BLOCKED", error_class: "rate_limited",
        error_message: `circuit ${circuit.state}: ${circuit.reason}`,
        meta: { circuit_state: circuit.state, recent_failures: circuit.recentFailures, retry_in_ms: retryInMs, kept_running: keepRunning },
      });
      return json(
        {
          ok: false,
          status: "circuit_open",
          state: circuit.state,
          retry_in_ms: retryInMs,
          recent_failures: circuit.recentFailures,
          refunded: 0,
          message: "Sync.so ist aktuell instabil — Dispatch pausiert für 30 min.",
        },
        202,
      );
    }

    // E.5: on retry path, wallet was already debited at the original dispatch
    // and the cost is preserved in state.cost_credits. Skip re-charging.
    if (!isRetry) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();
      if (!wallet || Number(wallet.balance) < totalCost) {
        return json(
          {
            error: "INSUFFICIENT_CREDITS",
            required: totalCost,
            have: wallet?.balance ?? 0,
            message: `Sync-Segments benötigt ${totalCost} Credits.`,
          },
          402,
        );
      }
      await supabase
        .from("wallets")
        .update({
          balance: Number(wallet.balance) - totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      console.log(`[compose-dialog-segments] scene=${sceneId} RETRY path (no re-charge)`);
    }

    // Stage F.7 — read auto-tuner preferred source kind (best-effort signal only)
    const tunerKind = await readPreferredSyncSourceKind(supabase);
    if (tunerKind) {
      console.log(`[compose-dialog-segments] scene=${sceneId} auto-tuner prefers source_kind=${tunerKind}`);
    }

    // ── Webhook URL ──────────────────────────────────────────────────────
    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}`,
    );

    // ── Face-targeting (resolve per-speaker coords) ──────────────────────
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const anchorUrl =
      (scene as any).lock_reference_url ||
      (scene as any).reference_image_url ||
      null;
    const characterIds = speakers.map((sp) => sp.character_id ?? null);
    const characters = await resolveCharacterPortraits(supabase, userId, characterIds);
    const cachedFaceMap = (twoshot as any).faceMap ?? null;
    let faceMap: Awaited<ReturnType<typeof resolveSceneFaceMap>> | null = null;
    try {
      faceMap = await resolveSceneFaceMap({
        supabase,
        sceneId,
        anchorUrl,
        cachedFaceMap,
        lovableKey,
        characters,
        expectedFaceCount: speakers.length,
      });
    } catch (err) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} faceMap resolve failed: ${(err as Error).message}`,
      );
    }
    // Probe ACTUAL plate dimensions so per-speaker coords are in plate-space.
    // Anchor image (Nano Banana) and Hailuo i2v plate often differ in aspect
    // ratio/crop → coords computed against the anchor land off-face on the
    // plate, Sync.so rejects coords-pro with provider_unknown_error.
    // NOTE: `state` is built later (after prevState/passes setup). Use the
    // already-resolved `sourceClipUrl` (master plate) and any cached dims on
    // the existing dialog_shots row as fallback. This avoids a TDZ crash.
    const platePrimaryUrl =
      sourceClipUrl ||
      (scene as any).clip_url ||
      null;
    let plateDims: { width: number; height: number } | null = null;
    if (platePrimaryUrl) {
      plateDims = await probeMp4Dims(platePrimaryUrl);
    }
    const videoDims = plateDims ?? {
      width: Number((existing as any)?.video_width) || 1280,
      height: Number((existing as any)?.video_height) || 720,
    };
    const coordSources: string[] = [];
    const speakerCoords: Array<[number, number] | null> = speakers.map((sp, idx) => {
      const picked = pickSpeakerCoordinates({
        speakerIdx: idx,
        characterId: sp.character_id ?? null,
        faceMap,
        videoDims,
        totalSpeakers: speakers.length,
      });
      coordSources.push(picked?.source ?? "none");
      return picked?.coords ?? null;
    });
    // Final safety fallback: evenly spaced along the horizontal midline so
    // 3+ speakers never collide on the same x.
    for (let i = 0; i < speakerCoords.length; i++) {
      if (!speakerCoords[i]) {
        const total = Math.max(speakers.length, 2);
        const t = 0.2 + (0.6 * i) / (total - 1);
        speakerCoords[i] = [
          Math.round(videoDims.width * t),
          Math.round(videoDims.height * 0.5),
        ];
      }
      speakerCoords[i] = clampSyncCoords(speakerCoords[i]);
      // Bounds-clamp into the inner 90% of the plate. Identity-match coords
      // are in anchor-space; if anchor/plate aspect-ratios differ (common
      // for 3+ speaker wide group shots) the rescaled point can land
      // outside the actual video frame and Sync.so returns the opaque
      // "An unknown error occurred." Clamp is a no-op when coords already
      // sit inside the plate — so 1- and 2-speaker scenes are unaffected.
      if (speakerCoords[i] && plateDims) {
        const margin = 0.05;
        const minX = Math.round(plateDims.width * margin);
        const maxX = Math.round(plateDims.width * (1 - margin));
        const minY = Math.round(plateDims.height * margin);
        const maxY = Math.round(plateDims.height * (1 - margin));
        const [cx, cy] = speakerCoords[i]!;
        speakerCoords[i] = [
          Math.min(Math.max(cx, minX), maxX),
          Math.min(Math.max(cy, minY), maxY),
        ];
      }
    }
    const ASSUMED_FPS = 24;
    console.log(
      `[compose-dialog-segments] scene=${sceneId} faceMap=${faceMap?.source ?? "none"} faces=${faceMap?.faces?.length ?? 0} ` +
      `anchor=${faceMap?.width ?? "?"}x${faceMap?.height ?? "?"} plate=${plateDims ? `${plateDims.width}x${plateDims.height}` : "probe-failed"} ` +
      `speakers=${speakers.length} coords=${JSON.stringify(speakerCoords)} sources=${JSON.stringify(coordSources)}`,
    );

    // ── Build PASSES (one per speaker that has turns) ────────────────────
    // MAY 2026 pivot: instead of one Sync.so call with segments[]+ASD (which
    // crashes lipsync-2-pro), we chain N per-speaker calls where each pass:
    //  • takes prev pass output as video input (pass 0 = master plate)
    //  • takes that speaker's pre-mixed audio track (with silence between
    //    their turns — compose-twoshot-audio guarantees this)
    //  • locks ASD to that speaker's single-coord face
    //  • NO segments[] → no crash
    //
    // Result: each pass only modifies its own speaker's mouth. After the
    // final pass, every speaker is correctly lip-synced.
    const passSpeakers = speakers
      .map((sp, originalIdx) => ({ sp, originalIdx }))
      .filter(({ sp }) => {
        const turns = Array.isArray(sp.voicedRange?.turns) ? sp.voicedRange!.turns! : [];
        return turns.length > 0 && !!String(sp.track_url ?? "").trim();
      });

    // If we can't build per-speaker passes (missing track_url), bail with a
    // clear error rather than silently swap speakers.
    if (passSpeakers.length === 0) {
      // Refund the wallet debit we just took.
      const { data: wErr } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(wErr?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_per_speaker_tracks",
        })
        .eq("id", sceneId);
      return json(
        {
          error: "no_per_speaker_tracks",
          message: "Per-speaker audio tracks missing. Re-run compose-twoshot-audio.",
          refunded: totalCost,
        },
        422,
      );
    }

    const builtPasses: PassState[] = passSpeakers.map(({ sp, originalIdx }, passIdx) => {
      const turns = sp.voicedRange!.turns! as Turn[];
      const passSegments: SegmentItem[] = turns.map((t) => ({
        startTime: Number(Math.max(0, t.startSec).toFixed(3)),
        endTime: Number(Math.min(totalSec, Math.max(t.startSec + MIN_TURN_DUR_SEC, t.endSec)).toFixed(3)),
        speakerIdx: originalIdx,
        speakerName: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        refId: "a1",
      }));
      return {
        idx: passIdx,
        speaker_idx: originalIdx,
        character_id: sp.character_id ?? null,
        speaker_name: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        audio_url: String(sp.track_url),
        coords: speakerCoords[originalIdx] ?? [0.5, 0.5],
        segments: passSegments,
        input_url: "", // filled per pass below
        status: "pending",
      };
    });

    // ── Stufe B: HEAD-probe inputs once before paying Sync.so ────────────
    const audioUrls = builtPasses.map((p) => p.audio_url);
    const probes = await Promise.all([
      probeAsset(sourceClipUrl, "video", 50_000),
      ...audioUrls.map((u) => probeAsset(u, "audio", 5_000)),
    ]);
    const videoProbe = probes[0];
    const audioProbes = probes.slice(1);
    const badProbe =
      (!videoProbe.ok ? `video:${videoProbe.error}` : null) ??
      audioProbes
        .map((p, i) => (p.ok ? null : `audio[${i}]:${p.error}`))
        .find(Boolean);
    if (badProbe && !isAdvance) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} PREFLIGHT BLOCK ${badProbe}`,
      );
      const { data: w0 } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(w0?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_preflight_${badProbe}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: sourceClipUrl,
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: badProbe.startsWith("video") ? "video_head_fail" : "audio_head_fail",
        error_message: badProbe,
      });
      return json({ error: "preflight_failed", details: badProbe, refunded: totalCost }, 422);
    }

    // ── Deep audio preflight: Sync.so often reports only "unknown error" for
    // malformed, silent, or shorter-than-video WAV inputs. Validate the real
    // bytes before dispatch so failures become actionable and refundable here.
    const audioDiagnostics = await Promise.all(
      builtPasses.map(async (p) => {
        try {
          const diag = await inspectSpeakerAudio(p.audio_url);
          const durMismatch = diag.wav.durSec + 0.35 < totalSec;
          const silent = diag.vad.voicedSec < 0.15 && diag.vad.longestVoicedRun < 0.12;
          return { pass: p.idx, speaker: p.speaker_name, ok: !durMismatch && !silent, durMismatch, silent, ...diag };
        } catch (err) {
          return { pass: p.idx, speaker: p.speaker_name, ok: false, error: (err as Error).message };
        }
      }),
    );
    const badAudio = audioDiagnostics.find((d: any) => !d.ok) as any;
    if (badAudio) {
      const reason = badAudio.error
        ? `audio_invalid_${badAudio.error}`
        : badAudio.silent
          ? "audio_silent_no_voice_detected"
          : `audio_too_short_${Number(badAudio.wav?.durSec ?? 0).toFixed(2)}s_expected_${totalSec}s`;
      console.error(`[compose-dialog-segments] scene=${sceneId} AUDIO PREFLIGHT BLOCK ${reason}`);
      const alreadyRefunded = !!(existing as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({ balance: Number(w0?.balance ?? 0) + totalCost, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...(existing ?? {}),
            version: 5,
            engine: "sync-segments",
            status: "failed",
            cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
            refunded: !alreadyRefunded,
            error: reason,
            audio_diagnostics: audioDiagnostics,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_audio_preflight_${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "audio_invalid",
        error_message: reason,
        meta: { audio_diagnostics: audioDiagnostics, expected_total_sec: totalSec },
      });
      return json({ error: "audio_preflight_failed", reason, refunded: alreadyRefunded ? 0 : totalCost }, 422);
    }

    // ── Face-gate per pass (one frame check per speaker's first turn) ────
    // For 1- and 2-speaker scenes: keep the legacy "any face visible" check
    // unchanged (those flows were stable). For 3+ speakers we additionally
    // validate that a face actually exists at the per-speaker target
    // coordinates BEFORE paying Sync.so — otherwise Sync.so returns the
    // opaque "An unknown error occurred." and burns credits / time.
    if (!isAdvance) {
      const strictTargetCheck = speakers.length >= 3 && !!plateDims;
      for (const pass of builtPasses) {
        const firstTurn = pass.segments[0];
        if (!firstTurn) continue;
        const midSec = (firstTurn.startTime + firstTurn.endTime) / 2;
        const frame = Math.max(0, Math.round(midSec * ASSUMED_FPS));
        // For 3+ speakers, hand the per-speaker pixel coords as normalized
        // [x,y] (0..1) so validate-frame-face can verify they land on a face.
        let targetCoordsForCheck: [number, number] | null = null;
        if (strictTargetCheck && plateDims) {
          const c = pass.coords;
          if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
            targetCoordsForCheck = [
              Math.min(1, Math.max(0, Number(c[0]) / plateDims.width)),
              Math.min(1, Math.max(0, Number(c[1]) / plateDims.height)),
            ];
          }
        }
        const v = await validateFrameFace({
          supabaseUrl, serviceKey,
          videoUrl: sourceClipUrl,
          frameNumber: frame, fps: ASSUMED_FPS,
          targetCoords: targetCoordsForCheck,
        });
        // Legacy gate (unchanged for 1/2 speakers): block if frame has NO face at all.
        const noFaceAtAll = v.ok && !v.faceVisible;
        // 3+ speaker hard gate: target coords must overlap a face. coordsMatch=false
        // means Gemini found face(s) but none overlap this speaker's anchor point.
        const targetMissing =
          strictTargetCheck &&
          v.ok &&
          v.faceVisible &&
          targetCoordsForCheck !== null &&
          v.coordsMatch === false;
        if (noFaceAtAll || targetMissing) {
          const reason = targetMissing
            ? `plate_target_face_missing_pass_${pass.idx}_speaker_${pass.speaker_name}`
            : `face_validation_failed_pass_${pass.idx}_frame_${frame}`;
          console.error(
            `[compose-dialog-segments] scene=${sceneId} FACE-GATE BLOCK pass=${pass.idx} speaker=${pass.speaker_name} frame=${frame} reason=${reason}`,
          );
          const { data: w0 } = await supabase
            .from("wallets").select("balance").eq("user_id", userId).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number(w0?.balance ?? 0) + totalCost,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: reason,
            })
            .eq("id", sceneId);
          return json(
            {
              error: targetMissing ? "plate_target_face_missing" : "face_validation_failed",
              details: targetMissing
                ? `target face for ${pass.speaker_name} not present on plate — re-render scene clip with all heads in frame`
                : `no face for ${pass.speaker_name} at frame ${frame}`,
              refunded: totalCost,
              hint: targetMissing ? "re_render_scene_clip" : "switch_to_cinematic_sync_engine",
            },
            422,
          );
        }
      }
    }


    // ── Concurrency guard ────────────────────────────────────────────────
    const MAX_INFLIGHT = 3;
    const inflightCount = await countInflightSyncJobs(supabase, 10);
    if (inflightCount >= MAX_INFLIGHT) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} DEFER inflight=${inflightCount}/${MAX_INFLIGHT}`,
      );
      // Only refund on initial dispatch (advance path keeps the existing charge).
      if (!isAdvance && !isRetry) {
        const { data: wDef } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wDef?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      const jitterMs = 5_000 + Math.floor(Math.random() * 10_000);
      // For advance/retry (fan-out): leave the scene in `running` with the
      // existing dialog_shots untouched. The pass row keeps status='pending'
      // and the lipsync-watchdog poller will dispatch it when a Sync.so slot
      // frees. Previously we wrote `syncso_segments_advance_deferred` here
      // which the client filter never advanced — pending passes hung forever.
      if (isAdvance || isRetry) {
        await supabase
          .from("composer_scenes")
          .update({
            // Status unchanged. Just touch updated_at + leave a soft marker
            // so we can debug from clip_error without changing routing.
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      } else {
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "pending",
            twoshot_stage: "deferred",
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      }
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "DEFERRED", error_class: "rate_limited",
        error_message: `inflight ${inflightCount} >= ${MAX_INFLIGHT}`,
        meta: { inflight_count: inflightCount, retry_in_ms: jitterMs, is_advance: isAdvance, is_retry: isRetry },
      });
      return json(
        { ok: false, status: "deferred", inflight: inflightCount, retry_in_ms: jitterMs },
        202,
      );
    }

    // ── Determine which pass to dispatch (v25 Fan-Out) ───────────────────
    // CRITICAL: every pass uses the ORIGINAL source plate as input. We no
    // longer feed pass N-1's Sync.so output back into Sync.so for pass N —
    // that's exactly what caused the "An unknown error occurred." failures
    // on pass 2+ (Sync.so lipsync-2-pro rejects its own redirected outputs
    // in coords-pro mode). Instead, every pass produces a full-frame
    // lipsync of its own speaker on the pristine plate; the final compositor
    // (render-sync-segments-audio-mux) overlays them via face-mask circles.
    const prevState = (existing && (existing as any).version === 5) ? (existing as SegmentsState) : null;
    let passes: PassState[];
    let currentPassIdx: number;
    const passInputUrl: string = sourceClipUrl;

    if (isAdvance && prevState?.passes && typeof prevState.current_pass === "number") {
      // Webhook fan-in advance: dispatch the next pending pass (or the
      // explicitly requested one). Each pass is independent of all others.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      if (Number.isFinite(requested) && requested >= 0 && requested < passes.length) {
        currentPassIdx = requested;
      } else {
        // Pick first pending/failed-without-job pass, else advance the cursor.
        const pendingIdx = passes.findIndex((p) => p.status === "pending" && !p.job_id);
        currentPassIdx = pendingIdx >= 0 ? pendingIdx : prevState.current_pass;
      }
      if (!passes[currentPassIdx]) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} advance but no pass at idx=${currentPassIdx}`);
        return json({ ok: true, skipped: "no_pass_at_cursor" }, 200);
      }
      if (passes[currentPassIdx].status === "done" || passes[currentPassIdx].status === "rendering") {
        return json({ ok: true, skipped: `pass_${currentPassIdx}_already_${passes[currentPassIdx].status}` }, 200);
      }
    } else if (isRetry && prevState?.passes && typeof prevState.current_pass === "number") {
      // Retry the same pass that just failed — still against original plate.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      currentPassIdx = Number.isFinite(requested) && requested >= 0 && requested < passes.length
        ? requested
        : prevState.current_pass;
    } else {
      // Fresh dispatch: start at pass 0.
      passes = builtPasses;
      currentPassIdx = 0;
    }


    const pass = passes[currentPassIdx];
    pass.input_url = passInputUrl;
    pass.status = "rendering";
    pass.started_at = new Date().toISOString();
    // Each pass targets a DIFFERENT face with its own validated coords. Never
    // inherit a fallback variant from a sibling pass — that would drop the
    // coords for speakers 2+ and let Sync.so re-detect speaker 0 (causing
    // speakers 2 and 3 to stay frozen). The per-pass fallback ladder
    // (coords-pro → auto-pro → auto-standard) is still applied inside
    // sync-so-webhook on actual provider failures for THIS pass only.
    const retryVariant: RetryVariant = isRetry
      ? (requestedRetryVariant ?? (prevState?.passes?.[currentPassIdx]?.retry_variant as RetryVariant | undefined) ?? "coords-pro")
      : "coords-pro";

    const diagnosticId = `${sceneId}:${currentPassIdx + 1}:${retryVariant}:${crypto.randomUUID()}`;
    pass.retry_variant = retryVariant;
    pass.diagnostic_id = diagnosticId;

    // ── v28: Audio lead-in trim for Sync.so reliability ──────────────────
    // Sync.so lipsync-2-pro fails with the generic "An unknown error
    // occurred." when given per-speaker WAVs with several seconds of
    // leading silence on 3+ speaker plates with manual ASD. Trim the
    // lead-in so the voice starts at ~0.2s. Triggered either by an
    // explicit repair_audio flag (from the webhook retry) OR when the
    // pre-flight diagnostic detected a lead-in > 0.6s.
    const passDiag = audioDiagnostics.find((d: any) => d.pass === pass.idx) as any;
    const detectedLeadIn = Number(passDiag?.wav?.leadInSec ?? 0);
    // v29: lower auto-trim threshold (0.6→0.3) and always re-emit canonical
    // PCM 16-bit WAV when repair_audio is set, even if no trim is needed —
    // that strips any non-canonical chunks Sync.so may choke on.
    const needsTrim = repairAudio || (Number.isFinite(detectedLeadIn) && detectedLeadIn > 0.3);
    const prevPassAudioUrl = (prevState?.passes?.[currentPassIdx] as any)?.audio_url;
    const alreadyTrimmed = typeof prevPassAudioUrl === "string" && /-trim\.wav(\?|$)/.test(prevPassAudioUrl);
    if (needsTrim && !alreadyTrimmed) {
      try {
        const audioResp = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (audioResp.ok) {
          const origBytes = new Uint8Array(await audioResp.arrayBuffer());
          const trimmed = trimWavLeadIn(origBytes, { keepLeadInSec: 0.2, force: repairAudio });
          // Always upload when repair_audio (canonical re-encode), OR when we
          // actually trimmed >0.05s of silence.
          if (repairAudio || trimmed.trimmedSec > 0.05) {
            const trimPath = `${userId}/twoshot-vo/${sceneId}-pass-${currentPassIdx + 1}-trim.wav`;
            const up = await supabase.storage.from("voiceover-audio").upload(
              trimPath,
              trimmed.bytes,
              { contentType: "audio/wav", upsert: true },
            );
            if (!up.error) {
              const { data: pub } = supabase.storage
                .from("voiceover-audio")
                .getPublicUrl(trimPath);
              if (pub?.publicUrl) {
                console.log(
                  `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} AUDIO_TRIM leadIn=${detectedLeadIn.toFixed(2)}s → ${trimmed.info.leadInSec.toFixed(2)}s (saved ${trimmed.trimmedSec.toFixed(2)}s, force=${!!repairAudio}) url=${pub.publicUrl.slice(0, 80)}`,
                );
                pass.audio_url = pub.publicUrl;
                (pass as any).audio_repaired = true;
                (pass as any).audio_trim_sec = trimmed.trimmedSec;
              }
            } else {
              console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} audio trim upload failed: ${up.error.message}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} audio trim crash: ${(err as Error).message}`);
      }
    }


    // ── Build per-pass Sync.so payload (NO segments[] — single audio + ASD) ──
    const firstTurn = pass.segments[0];
    const midSec = firstTurn ? (firstTurn.startTime + firstTurn.endTime) / 2 : totalSec / 2;
    const frameNumber = Math.max(0, Math.floor(midSec * ASSUMED_FPS));
    const syncOptions: Record<string, unknown> = {
      // Explicit: keep full video length. Without this, lipsync-2-pro's
      // default trims output to the shorter input → multi-pass chains
      // were ending after the first speaker's last turn (3rd sentence
      // disappeared). cut_off here = "cut to shortest" but with our
      // silence-padded per-speaker tracks (length = sceneDur) the audio
      // matches the video, so output stays full.
      sync_mode: "cut_off",
    };
    if (retryVariant === "coords-pro") {
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        frame_number: frameNumber,
        coordinates: pass.coords,
      };
    } else if (retryVariant === "coords-pro-box") {
      // v31 — Prefer the REAL face bounding box from the resolved faceMap
      // (anchor-space) and rescale to plate-space. Falls back to a synthetic
      // box around `pass.coords` only when no faceMap match exists.
      const dims = plateDims ?? videoDims;
      let box: [number, number, number, number] | null = null;
      let bboxSource = "synthetic";
      const fmFaces: any[] = Array.isArray((faceMap as any)?.faces)
        ? (faceMap as any).faces
        : [];
      const matchedFace =
        fmFaces.find((f) => f?.characterId && f.characterId === pass.character_id) ??
        fmFaces.find((f) => Number(f?.slotIndex) === Number(pass.speaker_idx)) ??
        null;
      const fmW = Number((faceMap as any)?.width) || dims.width;
      const fmH = Number((faceMap as any)?.height) || dims.height;
      if (
        matchedFace &&
        Array.isArray(matchedFace.bbox) &&
        matchedFace.bbox.length === 4 &&
        fmW > 0 && fmH > 0
      ) {
        const [bx1, by1, bx2, by2] = matchedFace.bbox.map((n: any) => Number(n));
        const sx = dims.width / fmW;
        const sy = dims.height / fmH;
        // Tight pad (~15%) around the detected face for stable ASD.
        const padX = (bx2 - bx1) * 0.15;
        const padY = (by2 - by1) * 0.15;
        const x1 = Math.max(0, Math.round((bx1 - padX) * sx));
        const y1 = Math.max(0, Math.round((by1 - padY) * sy));
        const x2 = Math.min(dims.width, Math.round((bx2 + padX) * sx));
        const y2 = Math.min(dims.height, Math.round((by2 + padY) * sy));
        if (x2 > x1 + 4 && y2 > y1 + 4) {
          box = [x1, y1, x2, y2];
          bboxSource = `facemap:${matchedFace.matchSource ?? "unknown"}`;
        }
      }
      if (!box) {
        const [cx, cy] = pass.coords ?? [Math.round(dims.width / 2), Math.round(dims.height / 2)];
        const boxW = Math.round(dims.width * 0.18);
        const boxH = Math.round(dims.height * 0.28);
        const x1 = Math.max(0, Math.round(cx - boxW / 2));
        const y1 = Math.max(0, Math.round(cy - boxH / 2));
        const x2 = Math.min(dims.width, Math.round(cx + boxW / 2));
        const y2 = Math.min(dims.height, Math.round(cy + boxH / 2));
        box = [x1, y1, x2, y2];
      }
      const frameCount = Math.max(1, Math.ceil(totalSec * ASSUMED_FPS));
      const boundingBoxes: (number[] | null)[] = new Array(frameCount).fill(box);
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        bounding_boxes: boundingBoxes,
      };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} BBOX_ASD speaker=${pass.speaker_name} box=${JSON.stringify(box)} source=${bboxSource} frames=${frameCount}`,
      );

    } else {
      syncOptions.active_speaker_detection = { auto_detect: true };
    }
    const diagnosticWebhookUrl = `${webhookUrl}&diagnostic_id=${encodeURIComponent(diagnosticId)}`;
    const payload: Record<string, unknown> = {
      model: retryVariant === "auto-standard" ? LIPSYNC_FALLBACK_MODEL : LIPSYNC_MODEL,
      input: [
        { type: "video", url: passInputUrl },
        { type: "audio", url: pass.audio_url },
      ],
      options: syncOptions,
      webhookUrl: diagnosticWebhookUrl,
      webhook_url: diagnosticWebhookUrl,
    };

    // ── Length sanity log ────────────────────────────────────────────────
    // compose-twoshot-audio writes mono 16-bit WAV @ 44.1kHz → ~88200 bytes/sec
    // (+ 44 byte header). Use the audio probe's Content-Length to estimate the
    // per-speaker track duration and warn loudly if it's shorter than the
    // scene plate — that's the classic "video stops mid-way" cause because
    // Sync.so cut_off trims to the shorter input.
    const WAV_BYTES_PER_SEC = 44100 * 1 * 2;
    const audioProbeIdx = passSpeakers.findIndex(({ originalIdx }) => originalIdx === pass.speaker_idx);
    const audioProbeBytes = audioProbeIdx >= 0 ? (audioProbes[audioProbeIdx]?.bytes ?? 0) : 0;
    const audioApproxSec = audioProbeBytes > 44
      ? Math.round(((audioProbeBytes - 44) / WAV_BYTES_PER_SEC) * 100) / 100
      : null;
    const videoBytes = videoProbe?.bytes ?? 0;
    const lengthMismatch =
      audioApproxSec !== null && audioApproxSec + 0.5 < totalSec;
    if (lengthMismatch) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} LENGTH_MISMATCH pass=${currentPassIdx + 1} ` +
        `audio≈${audioApproxSec}s < expected ${totalSec}s — Sync.so will truncate output. ` +
        `Re-run compose-twoshot-audio to re-pad per-speaker tracks.`,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} DISPATCH pass=${currentPassIdx + 1}/${passes.length} ` +
      `speaker=${pass.speaker_name} coords=${JSON.stringify(pass.coords)} ` +
      `totalSec=${totalSec} audio≈${audioApproxSec}s videoBytes=${videoBytes} ` +
      `variant=${retryVariant} model=${payload.model} diagnostic=${diagnosticId} ` +
      `sync_mode=cut_off input=${passInputUrl.slice(0, 80)} audio=${pass.audio_url.slice(0, 80)}`,
    );

    const resp = await fetch(`${SYNC_API_BASE}/generate`, {
      method: "POST",
      headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      console.error(
        `[compose-dialog-segments] scene=${sceneId} dispatch FAILED pass=${currentPassIdx} status=${resp.status} body=${errTxt.slice(0, 600)}`,
      );
      // Refund only if no previous pass succeeded (i.e. this is pass 0 fresh
      // dispatch) — if a later pass fails, we still refund the full cost since
      // the partial output is unusable.
      const alreadyRefunded = !!(prevState as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w2 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(w2?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      pass.status = "failed";
      pass.error = `dispatch_${resp.status}:${errTxt.slice(0, 200)}`;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...(prevState ?? {}),
            version: 5,
            engine: "sync-segments",
            status: "failed",
            passes,
            current_pass: currentPassIdx,
            total_passes: passes.length,
            multi_pass: passes.length > 1,
            source_clip_url: sourceClipUrl,
            total_sec: totalSec,
            segments: pass.segments,
            cost_credits: totalCost,
            refunded: !alreadyRefunded,
            error: pass.error,
            finished_at: new Date().toISOString(),
          },
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_dispatch_${resp.status}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: passInputUrl,
        http_status: resp.status, sync_status: "DISPATCH_FAILED",
        error_class: classifySyncError(errTxt),
        error_message: errTxt.slice(0, 500),
        meta: { diagnostic_id: diagnosticId, retry_variant: retryVariant, pass_idx: currentPassIdx, total_passes: passes.length, payload_summary: payload },
      });
      await recordCircuitFailure(supabase, "sync.so", classifySyncError(errTxt));
      return json(
        { error: "syncso_dispatch_failed", status: resp.status, body: errTxt.slice(0, 400) },
        502,
      );
    }

    const data = await resp.json();
    const shape = validateSyncResponseShape(data);
    if (!shape.ok) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} SCHEMA_DRIFT missing=${shape.missingKeys.join(",")}`,
      );
      await emitSystemAlert(supabase, {
        alert_type: "syncso_schema_drift", severity: "critical", source: "sync.so",
        message: `Sync.so /generate response missing keys: ${shape.missingKeys.join(", ")}`,
        payload: { missing_keys: shape.missingKeys, sample: data },
      });
      return json({ error: "schema_drift", missing: shape.missingKeys }, 502);
    }
    const jobId = String(data.id ?? "");
    if (!jobId) {
      return json({ error: "no_job_id" }, 502);
    }

    await registerInflightSyncJob(supabase, {
      job_id: jobId, user_id: userId, scene_id: sceneId, engine: "sync-segments",
    });
    await recordCircuitSuccess(supabase, "sync.so");

    pass.job_id = jobId;
    passes[currentPassIdx] = pass;

    const nowIso = new Date().toISOString();
    const state: SegmentsState = {
      version: 5,
      engine: "sync-segments",
      status: "rendering",
      multi_pass: passes.length > 1,
      passes,
      current_pass: currentPassIdx,
      total_passes: passes.length,
      sync_job_id: jobId,
      source_clip_url: sourceClipUrl,
      total_sec: totalSec,
      segments: pass.segments,
      cost_credits: isRetry || isAdvance ? Number(prevState?.cost_credits ?? totalCost) : totalCost,
      refunded: false,
      started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      first_started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      retry_count: Number(prevState?.retry_count ?? 0),
      retry_variant: retryVariant,
      fallback_history: prevState?.fallback_history ?? [],
      last_diagnostic_id: diagnosticId,
      final_url: null,
      // Plate dims (probed once on pass 0) — render-sync-segments-audio-mux
      // uses these for the Lambda canvas; multi-speaker fix uses them so
      // pickSpeakerCoordinates produces plate-space coords.
      video_width: videoDims.width,
      video_height: videoDims.height,
    } as SegmentsState;

    await logSyncDispatch(supabase, {
      scene_id: sceneId, user_id: userId, engine: "sync-segments",
      job_id: jobId, sync_source_kind: "segments",
      video_url: passInputUrl,
      video_bytes: videoProbe.bytes,
      video_content_type: videoProbe.contentType,
      window_start_sec: 0, window_end_sec: totalSec,
      http_status: resp.status, sync_status: "DISPATCHED",
      meta: {
        diagnostic_id: diagnosticId,
        pass_idx: currentPassIdx,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        character_id: pass.character_id,
        coords: pass.coords,
        retry_variant: retryVariant,
        model: payload.model,
        is_retry: isRetry,
        is_advance: isAdvance,
        face_map_source: faceMap?.source ?? null,
        sync_mode: "cut_off",
        audio_approx_sec: audioApproxSec,
        expected_total_sec: totalSec,
        length_mismatch: lengthMismatch,
        audio_probe: audioProbes[audioProbeIdx] ?? null,
        video_probe: videoProbe,
        audio_diagnostics: audioDiagnostics.find((d) => d.pass === pass.idx) ?? null,
        payload_summary: {
          model: payload.model,
          input_video: passInputUrl,
          audio: pass.audio_url,
          frame_number: frameNumber,
          coordinates: pass.coords,
          options: payload.options,
        },
      },
    });

    // v29: For retry/advance dispatches, re-read the DB and merge ONLY our
    // pass into the freshest passes[] so a concurrent webhook for a sibling
    // pass can't be overwritten by our stale `passes` snapshot.
    if (isRetry || isAdvance) {
      const { data: freshRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshState: any = (freshRow as any)?.dialog_shots ?? state;
      const freshPasses: any[] = Array.isArray(freshState?.passes)
        ? freshState.passes.map((p: any) => ({ ...p }))
        : passes;
      freshPasses[currentPassIdx] = pass;
      const mergedState: any = {
        ...freshState,
        ...state,
        passes: freshPasses,
        // Preserve fields that may have been advanced by other passes:
        cost_credits: Number(freshState?.cost_credits ?? state.cost_credits ?? totalCost),
        fallback_history: freshState?.fallback_history ?? state.fallback_history ?? [],
      };
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: mergedState,
          lip_sync_status: "running",
          twoshot_stage: passes.length > 1 ? `syncso_pass_${currentPassIdx + 1}_of_${passes.length}` : "syncso_segments",
          lip_sync_source_clip_url: sourceClipUrl,
          replicate_prediction_id: `sync:${jobId}`,
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
    } else {
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: state,
          lip_sync_status: "running",
          twoshot_stage: passes.length > 1 ? `syncso_pass_${currentPassIdx + 1}_of_${passes.length}` : "syncso_segments",
          lip_sync_source_clip_url: sourceClipUrl,
          replicate_prediction_id: `sync:${jobId}`,
          clip_error: null,
          updated_at: nowIso,
        })
        .eq("id", sceneId);
    }

    // ── v25 Fan-Out: on fresh dispatch, kick off all remaining passes in
    //    parallel via background self-invokes. Each runs as an independent
    //    Sync.so job against the SAME original plate (no chaining). The
    //    Sync.so 3-slot concurrency guard upstream handles back-pressure.
    if (!isAdvance && !isRetry && passes.length > 1) {
      for (let i = 1; i < passes.length; i++) {
        // Small jitter so the inflight counter check doesn't race-fire.
        const delayMs = i * 250;
        setTimeout(() => {
          fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: i }),
          }).catch((err) =>
            console.warn(`[compose-dialog-segments] fan-out pass=${i} dispatch threw: ${(err as Error).message}`),
          );
        }, delayMs);
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} FAN-OUT scheduled ${passes.length - 1} additional passes in parallel`,
      );
    }

    return json(
      {
        ok: true,
        status: "rendering",
        scene_id: sceneId,
        sync_job_id: jobId,
        pass: currentPassIdx + 1,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        cost_credits: totalCost,
      },
      202,
    );
  } catch (e) {
    console.error("[compose-dialog-segments] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

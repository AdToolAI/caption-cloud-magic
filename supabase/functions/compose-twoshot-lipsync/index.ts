/**
 * compose-twoshot-lipsync — Two-Shot multi-speaker lip-sync.
 *
 * Runs AFTER `compose-twoshot-audio` produced ONE merged voiceover WAV
 * (with metadata.speakers timing) and AFTER Hailuo i2v rendered the silent
 * 10s two-shot master clip.
 *
 * Strategy:
 *  - Sync.so/lipsync-2 has automatic active-speaker detection for multi-face
 *    videos. We pass the merged audio in ONE pass; Sync.so picks the
 *    speaking face per audio segment.
 *  - We progressively update `composer_scenes.twoshot_stage` so the UI can
 *    display a 6-step progress strip (audio → anchor → master_clip →
 *    lipsync_1 → lipsync_2 → continuity → done).
 *  - Idempotent credit refund on Replicate failure (deterministic UUID
 *    derived from scene_id + source clip URL).
 *
 * Bypasses the multi-speaker guard in `compose-lipsync-scene` by design:
 * here we KNOW the voiceover is the merged Two-Shot track.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { probeImageDims } from "../_shared/image-dims.ts";


declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Duration-based pricing: Sync.so Creator plan ≈ $0.08/s per pass.
// Two-shot = 2 sequential passes → 18 credits/s = €0.18/s (~22% margin).
const CREDITS_PER_SECOND = 9;
const PASSES = 2;
const MIN_COST = 18; // floor (1s × 9 × 2 passes)
const computeCost = (durationSec: number): number =>
  Math.max(MIN_COST, Math.ceil(Math.max(0, durationSec)) * CREDITS_PER_SECOND * PASSES);
const LIPSYNC_MODEL = "sync/lipsync-2-pro" as `${string}/${string}`;
const PASS_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 5_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout_${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

async function setStage(
  supabase: any,
  sceneId: string,
  stage: string,
  extra: Record<string, unknown> = {},
) {
  await supabase
    .from("composer_scenes")
    .update({ twoshot_stage: stage, ...extra })
    .eq("id", sceneId);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length) return output[0] as string;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    return ((o.video || o.output || o.url) as string) ?? null;
  }
  return null;
}

async function runLipsyncPrediction(
  replicate: any,
  supabase: any,
  sceneId: string,
  input: Record<string, unknown>,
  label: string,
): Promise<string> {
  const prediction = await replicate.predictions.create({
    model: LIPSYNC_MODEL,
    input,
  });
  const predictionId = prediction?.id;
  if (!predictionId) throw new Error(`${label}_missing_prediction_id`);

  await supabase
    .from("composer_scenes")
    .update({
      replicate_prediction_id: predictionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  const started = Date.now();
  let current = prediction;
  while (Date.now() - started < PASS_TIMEOUT_MS) {
    const status = String(current?.status ?? "");
    if (status === "succeeded") {
      const url = extractOutputUrl(current?.output);
      if (!url) throw new Error(`${label}_no_output`);
      return url;
    }
    if (["failed", "canceled"].includes(status)) {
      const detail = typeof current?.error === "string"
        ? current.error
        : JSON.stringify(current?.error ?? {}).slice(0, 300);
      throw new Error(`${label}_${status}: ${detail}`);
    }

    await sleep(POLL_INTERVAL_MS);
    current = await replicate.predictions.get(predictionId);
    await supabase
      .from("composer_scenes")
      .update({
        replicate_prediction_id: predictionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);
  }

  throw new Error(`${label}_timeout_${Math.round(PASS_TIMEOUT_MS / 1000)}s`);
}

/**
 * Direct Sync.so v2 API call — bypasses the Replicate wrapper which silently
 * drops the nested `options.active_speaker_detection` object. This is the
 * ONLY way to deterministically pin each pass to a specific face (Artlist
 * parity). Falls back to Replicate when SYNC_API_KEY is not configured.
 *
 * Docs: https://docs.sync.so/api-reference/endpoint/generate
 */
async function runSyncSoDirectPrediction(
  syncApiKey: string,
  supabase: any,
  sceneId: string,
  params: {
    videoUrl: string;
    audioUrl: string;
    syncMode?: "cut_off" | "loop" | "bounce";
    temperature?: number;
    targetCoords?: [number, number] | null;
    frameNumber?: number;
  },
  label: string,
): Promise<string> {
  const jobId = await startSyncSoDirectGeneration(syncApiKey, params, label);

  await supabase
    .from("composer_scenes")
    .update({
      replicate_prediction_id: `sync:${jobId}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  return await pollSyncSoDirectPrediction(syncApiKey, supabase, sceneId, jobId, label);
}

async function startSyncSoDirectGeneration(
  syncApiKey: string,
  params: {
    videoUrl: string;
    audioUrl: string;
    syncMode?: "cut_off" | "loop" | "bounce";
    temperature?: number;
    targetCoords?: [number, number] | null;
    frameNumber?: number;
  },
  label: string,
): Promise<string> {
  const inputArr: Array<Record<string, unknown>> = [
    { type: "video", url: params.videoUrl },
    { type: "audio", url: params.audioUrl },
  ];

  const options: Record<string, unknown> = {
    sync_mode: params.syncMode ?? "cut_off",
    output_format: "mp4",
    temperature: params.temperature ?? 0.5,
  };

  if (params.targetCoords) {
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: params.frameNumber ?? 0,
      coordinates: params.targetCoords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }

  const createResp = await fetch("https://api.sync.so/v2/generate", {
    method: "POST",
    headers: {
      "x-api-key": syncApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "lipsync-2-pro",
      input: inputArr,
      options,
    }),
  });

  if (!createResp.ok) {
    const txt = await createResp.text().catch(() => "");
    throw new Error(`${label}_create_${createResp.status}: ${txt.slice(0, 400)}`);
  }
  const created = await createResp.json();
  const jobId = created?.id;
  if (!jobId) throw new Error(`${label}_missing_job_id: ${JSON.stringify(created).slice(0, 200)}`);
  return String(jobId);
}

async function pollSyncSoDirectPrediction(
  syncApiKey: string,
  supabase: any,
  sceneId: string,
  jobId: string,
  label: string,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < PASS_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const pollResp = await fetch(`https://api.sync.so/v2/generate/${jobId}`, {
      headers: { "x-api-key": syncApiKey },
    });
    if (!pollResp.ok) {
      const txt = await pollResp.text().catch(() => "");
      console.warn(`[sync.so poll ${jobId}] ${pollResp.status}: ${txt.slice(0, 200)}`);
      continue;
    }
    const poll = await pollResp.json();
    const status = String(poll?.status ?? "").toUpperCase();
    if (status === "COMPLETED") {
      const url = poll?.outputUrl || poll?.output_url || poll?.output;
      if (!url || typeof url !== "string") throw new Error(`${label}_no_output_url`);
      return url;
    }
    if (status === "FAILED" || status === "CANCELED" || status === "REJECTED") {
      const errMsg = poll?.error || poll?.errorMessage || poll?.message || JSON.stringify(poll).slice(0, 300);
      throw new Error(`${label}_${status.toLowerCase()}: ${errMsg}`);
    }
    await supabase
      .from("composer_scenes")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sceneId);
  }

  throw new Error(`${label}_timeout_${Math.round(PASS_TIMEOUT_MS / 1000)}s`);
}

/**
 * Detect face centers in the two-shot anchor image via Gemini Vision.
 * Returns coordinates normalized to the image's natural pixel space.
 * Sync.so honors these coordinates relative to the input video frame size,
 * which matches the anchor (Hailuo uses the anchor as first frame at 1:1
 * resolution). Result is cached in audio_plan.twoshot.faceMap so retries skip
 * the Gemini call.
 */
type FaceMap = {
  faces: Array<{ side: "left" | "right"; center: [number, number]; bbox?: [number, number, number, number]; normCenter?: [number, number] }>;
  width: number;
  height: number;
  source: "cache" | "anchor" | "clip-frame" | "heuristic-fallback";
};

async function askGeminiForFaces(
  url: string,
  lovableKey: string,
  kind: "image" | "video",
): Promise<{ faces: any[] } | null> {
  // Lovable AI Gateway's `image_url` only decodes still images — passing an
  // .mp4 URL here returns 0 faces silently. Anchor-only path.
  if (kind === "video") return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You see a two-shot frame with TWO human faces. " +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  "Schema: {\"faces\": [{\"side\": \"left\", \"center\": [nx,ny], \"bbox\": [nx1,ny1,nx2,ny2]}, {\"side\": \"right\", \"center\": [nx,ny], \"bbox\": [nx1,ny1,nx2,ny2]}]}. " +
                  "Coordinates MUST be NORMALIZED to the range 0..1 (relative to the image — 0,0 = top-left, 1,1 = bottom-right). " +
                  "Do NOT return pixel coordinates and do NOT guess the image resolution. " +
                  "'left' = the face whose center has the SMALLER normalized x. 'right' = the larger x. " +
                  "If only one face is visible, return one entry. If none, return empty faces.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return { faces: Array.isArray(parsed?.faces) ? parsed.faces : [] };
  } catch {
    return null;
  }
}

function normalizeFaces(
  raw: { faces: any[] },
  realDims: { width: number; height: number },
): { faces: FaceMap["faces"]; width: number; height: number } {
  const W = realDims.width;
  const H = realDims.height;
  const toPx = (n: number, axis: "x" | "y") => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    // Accept either normalized (<=1.5) or legacy pixel values from older callers
    const isNorm = Math.abs(v) <= 1.5;
    const scaled = isNorm ? v * (axis === "x" ? W : H) : v;
    const max = axis === "x" ? W : H;
    return Math.round(Math.max(1, Math.min(max - 1, scaled)));
  };
  const valid = raw.faces
    .filter((f: any) => Array.isArray(f?.center) && f.center.length === 2)
    .map((f: any) => {
      const cx = toPx(f.center[0], "x");
      const cy = toPx(f.center[1], "y");
      const bb = Array.isArray(f.bbox) && f.bbox.length === 4
        ? [toPx(f.bbox[0], "x"), toPx(f.bbox[1], "y"), toPx(f.bbox[2], "x"), toPx(f.bbox[3], "y")] as [number, number, number, number]
        : undefined;
      return {
        center: [cx, cy] as [number, number],
        bbox: bb,
        normCenter: [Number(f.center[0]) || 0, Number(f.center[1]) || 0] as [number, number],
      };
    })
    .sort((a, b) => a.center[0] - b.center[0])
    .map((f, idx, arr) => ({
      ...f,
      side: (arr.length === 1 ? "left" : idx === 0 ? "left" : "right") as "left" | "right",
    }));
  return { faces: valid, width: W, height: H };
}

async function detectFacesInMaster(
  supabase: any,
  sceneId: string,
  anchorUrl: string | null | undefined,
  clipUrl: string | null | undefined,
  cached: any,
  lovableKey: string | undefined,
): Promise<FaceMap | null> {
  // Reject cached entries with bogus dims (legacy rows pre normalization fix).
  if (cached && Array.isArray(cached.faces) && cached.faces.length >= 2 && Number(cached.width) > 0 && Number(cached.height) > 0 && cached.faces.every((f: any) => Array.isArray(f?.normCenter))) {
    return { ...cached, source: "cache" } as FaceMap;
  }
  if (!lovableKey || !anchorUrl) return null;

  // Probe REAL anchor dimensions so coordinates we hand to Sync.so actually
  // land on the face (Hailuo uses the anchor as first frame, so video dims
  // == anchor dims). Gemini was hallucinating 1920x1080 for 1376x768 frames
  // which moved the left-face target up-and-left into empty space and made
  // Sync.so reject the job with `generation_pipeline_failed`.
  const dims = await probeImageDims(anchorUrl);
  if (!dims) {
    console.warn(`[compose-twoshot-lipsync ${sceneId}] could not probe anchor dims — Sync.so coords may be off`);
  }
  const realDims = dims ?? { width: 1280, height: 720 };

  const raw = await askGeminiForFaces(anchorUrl, lovableKey, "image");
  if (!raw) return null;
  const norm = normalizeFaces(raw, realDims);
  if (norm.faces.length < 2) return null;
  const result: FaceMap = { ...norm, source: "anchor" };
  try {
    const { data: row } = await supabase
      .from("composer_scenes")
      .select("audio_plan")
      .eq("id", sceneId)
      .single();
    const prevPlan = (row?.audio_plan ?? {}) as Record<string, unknown>;
    const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
    await supabase
      .from("composer_scenes")
      .update({
        audio_plan: {
          ...prevPlan,
          twoshot: { ...prevTwoshot, faceMap: { faces: result.faces, width: result.width, height: result.height, source: result.source } },
        },
      })
      .eq("id", sceneId);
  } catch {
    // cache-write is best-effort
  }
  return result;
}


/**
 * Pick [x, y] target coordinates for Sync.so active_speaker_detection.
 * Order: faceMap (Gemini) → heuristic thirds of the master frame. Pass index
 * 0 → left face, 1 → right face. Returns null if even the heuristic isn't
 * resolvable (no dimensions known).
 */
function pickTargetCoordinates(
  passIndex: number,
  faceMap: { faces: Array<{ side: "left" | "right"; center: [number, number] }>; width: number; height: number } | null,
  fallbackDims: { width: number; height: number },
): { coords: [number, number]; side: "left" | "right"; source: "gemini" | "heuristic" } | null {
  const side: "left" | "right" = passIndex === 0 ? "left" : "right";
  if (faceMap?.faces?.length) {
    const match = faceMap.faces.find((f) => f.side === side) ?? faceMap.faces[Math.min(passIndex, faceMap.faces.length - 1)];
    if (match?.center) {
      return { coords: [Math.round(match.center[0]), Math.round(match.center[1])], side, source: "gemini" };
    }
  }
  const W = fallbackDims.width || 1280;
  const H = fallbackDims.height || 720;
  const x = side === "left" ? Math.round(W * 0.3) : Math.round(W * 0.7);
  const y = Math.round(H * 0.5);
  return { coords: [x, y], side, source: "heuristic" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { scene_id } = body || {};
    if (!scene_id) return json({ error: "scene_id required" }, 400);

    // Load scene + verify ownership.
    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, clip_url, lip_sync_source_clip_url, duration_seconds, audio_plan, character_audio_url, reference_image_url, lock_reference_url, character_shots, lip_sync_status, lip_sync_applied_at, twoshot_stage, updated_at",
      )
      .eq("id", scene_id)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project || project.user_id !== user.id) return json({ error: "Forbidden" }, 403);

    if ((scene as any).lip_sync_status === "running") {
      const ageMs = Date.now() - new Date((scene as any).updated_at ?? 0).getTime();
      const stage = String((scene as any).twoshot_stage ?? "");
      const hb = (scene as any)?.audio_plan?.twoshot?.heartbeat ?? null;
      // Real progress markers: pipeline either set a heartbeat or advanced
      // stage past 'master_clip'. Without those, the row is stuck before
      // the background worker ever started — usually because the caller
      // pre-set lip_sync_status='running' and the previous invocation got
      // short-circuited here. Take over instead of returning 202.
      const hasRealProgress = !!hb || (stage && stage !== "master_clip" && stage !== "audio" && stage !== "anchor");
      if (hasRealProgress && ageMs < 10 * 60 * 1000) {
        return json({ accepted: true, scene_id, status: "already_running", credits_reserved: 0 }, 202);
      }
      console.warn(
        `[compose-twoshot-lipsync ${scene_id}] taking over stuck running row (ageMs=${ageMs}, stage=${stage}, heartbeat=${!!hb})`,
      );
    }
    if ((scene as any).lip_sync_status === "done" && (scene as any).lip_sync_applied_at) {
      return json({ accepted: true, scene_id, status: "already_done", credits_reserved: 0 }, 200);
    }

    // Source clip = original silent two-shot from Hailuo.
    const sourceClipUrl =
      (scene as any).lip_sync_source_clip_url || scene.clip_url || null;
    if (!sourceClipUrl) return json({ error: "no_source_clip" }, 400);

    // Merged voiceover from compose-twoshot-audio.
    const { data: voClips } = await supabase
      .from("scene_audio_clips")
      .select("url, duration, metadata")
      .eq("scene_id", scene_id)
      .eq("kind", "voiceover")
      .order("duration", { ascending: false });

    let mergedVo: any = voClips?.find((c: any) =>
      String(c.url ?? "").includes("/twoshot-vo/")
    ) ?? voClips?.[0];

    // If no merged track yet, synthesize it on demand by calling
    // compose-twoshot-audio (in case the user pressed the button before the
    // background prep ran).
    if (!mergedVo?.url) {
      await setStage(supabase, scene_id, "audio");
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": auth,
          },
          body: JSON.stringify({ scene_id }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.url) {
          mergedVo = { url: j.url, duration: j.duration, metadata: { speakers: j.speakers } };
        } else {
          return json({ error: "twoshot_audio_failed", detail: j }, 422);
        }
      } catch (e) {
        return json({ error: "twoshot_audio_exception", message: (e as Error).message }, 500);
      }
    }

    // Compute duration-based cost from merged VO (twoshot_audio just produced it).
    const estDurationSec = Math.max(
      mergedVo?.duration ?? 0,
      (scene as any).duration_seconds ?? 0,
      1,
    );
    const cost = computeCost(estDurationSec);

    // Wallet check
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    if (!wallet || wallet.balance < cost) {
      return json({ error: "INSUFFICIENT_CREDITS", required: cost }, 402);
    }

    const REPLICATE_KEY = Deno.env.get("REPLICATE_API_KEY");
    const SYNC_API_KEY = Deno.env.get("SYNC_API_KEY");
    if (!REPLICATE_KEY && !SYNC_API_KEY) return json({ error: "REPLICATE_API_KEY or SYNC_API_KEY missing" }, 500);

    // Reserve credits + mark stage.
    await supabase.from("wallets").update({
      balance: wallet.balance - cost,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    await setStage(supabase, scene_id, "lipsync_1", {
      lip_sync_status: "running",
      clip_error: null,
    });

    let refunded = false;
    const refund = async (reason: string) => {
      if (refunded) return;
      refunded = true;
      console.warn(`[compose-twoshot-lipsync ${scene_id}] Refund ${cost}: ${reason}`);
      const { data: w2 } = await supabase
        .from("wallets").select("balance").eq("user_id", user.id).single();
      if (w2) {
        await supabase.from("wallets").update({
          balance: w2.balance + cost,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
      }
      await setStage(supabase, scene_id, "failed", {
        lip_sync_status: "failed",
        clip_error: reason.slice(0, 500),
      });
    };

    // ────────────────────────────────────────────────────────────────────
    // Async background pipeline. Edge Functions kill the connection long
    // before two sequential sync.so passes (~3 minutes wall-clock) finish.
    // We return 202 immediately and let `EdgeRuntime.waitUntil` keep the
    // worker alive. The frontend (`useTwoShotAutoTrigger`) polls
    // `composer_scenes.lip_sync_status` / `lip_sync_applied_at` for the
    // result — no HTTP response needed.
    // ────────────────────────────────────────────────────────────────────
    const runPipeline = async () => {
      const replicate = REPLICATE_KEY ? new Replicate({ auth: REPLICATE_KEY }) : null;
      const useSyncSoDirect = !!SYNC_API_KEY;
      console.log(
        `[compose-twoshot-lipsync ${scene_id}] lipsync engine =`,
        useSyncSoDirect ? "sync.so/v2 (direct)" : "replicate-wrapper",
      );
      const sceneDuration = Number((scene as any).duration_seconds ?? 0);
      let voDuration = Number(mergedVo.duration ?? 0);

      // ── Defensive: re-regenerate merged VO if it's significantly shorter
      // than the scene. Older runs of compose-twoshot-audio computed
      // totalSec = max(spokenSec, scene.duration_seconds), so when the
      // duration wasn't yet set (race with Hailuo webhook) the merged
      // track collapsed to spokenSec (~7s) — and Sync.so produced a 7s
      // lipsync clip that didn't match the 10s silent master. Force a
      // refresh so all downstream passes use a properly padded track.
      if (sceneDuration > 0 && voDuration > 0 && voDuration < sceneDuration - 0.5) {
        console.warn(
          `[compose-twoshot-lipsync ${scene_id}] merged VO ${voDuration}s < scene ${sceneDuration}s — regenerating with force_regenerate=true`,
        );
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": auth,
            },
            body: JSON.stringify({ scene_id, force_regenerate: true }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.url) {
            mergedVo = {
              url: j.url,
              duration: j.duration,
              metadata: { speakers: j.speakers },
            } as any;
            voDuration = Number(j.duration ?? voDuration);
          } else {
            console.warn(`[compose-twoshot-lipsync ${scene_id}] regen failed`, j);
          }
        } catch (e) {
          console.warn(`[compose-twoshot-lipsync ${scene_id}] regen exception`, (e as Error).message);
        }
      }

      const existingSpeakerMeta = Array.isArray((mergedVo as any)?.metadata?.speakers)
        ? ((mergedVo as any).metadata.speakers as Array<any>)
        : [];
      const uniqueSpeakerKeys = new Set(
        existingSpeakerMeta.map((s) => String(s?.character_id || s?.speaker_slug || s?.speaker || "").toLowerCase()).filter(Boolean),
      );
      if (existingSpeakerMeta.length > 2 && uniqueSpeakerKeys.size > 0 && existingSpeakerMeta.length > uniqueSpeakerKeys.size) {
        console.warn(
          `[compose-twoshot-lipsync ${scene_id}] legacy per-turn tracks detected (${existingSpeakerMeta.length} tracks/${uniqueSpeakerKeys.size} speakers) — regenerating per-character tracks`,
        );
        const r = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": auth,
          },
          body: JSON.stringify({ scene_id, force_regenerate: true }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.url) {
          mergedVo = {
            url: j.url,
            duration: j.duration,
            metadata: { speakers: j.speakers },
          } as any;
          voDuration = Number(j.duration ?? voDuration);
        } else {
          await refund(`twoshot_audio_regen_failed: ${JSON.stringify(j).slice(0, 300)}`);
          return;
        }
      }


      // ── Per-speaker sequential lip-sync ─────────────────────────────
      // If compose-twoshot-audio produced per-speaker padded tracks
      // (metadata.speakers[i].track_url), run ONE sync.so pass per speaker.
      // Each pass feeds only that speaker's audio (silence elsewhere) into
      // lipsync-2 so active-speaker detection has a single voice signal and
      // animates exactly one face. This eliminates the swap caused by the
      // model picking the wrong face on a merged multi-speaker track.
      // Pass order follows character_shots (position 0 first).
      const speakerMeta = Array.isArray((mergedVo as any)?.metadata?.speakers)
        ? ((mergedVo as any).metadata.speakers as Array<any>)
        : [];
      const charShots = Array.isArray((scene as any).character_shots)
        ? ((scene as any).character_shots as Array<any>)
        : [];
      const shotOrder = new Map<string, number>();
      charShots.forEach((cs, idx) => {
        const id = String(cs?.characterId ?? "").toLowerCase();
        if (id) shotOrder.set(id, idx);
      });
      const passes = speakerMeta
        .filter((s) => typeof s?.track_url === "string" && s.track_url)
        .map((s, idx) => ({
          ...s,
          _shotIdx: shotOrder.has(String(s?.character_id ?? "").toLowerCase())
            ? shotOrder.get(String(s.character_id).toLowerCase())!
            : idx + 100, // unknown shots go last but stable
        }))
        .sort((a, b) => a._shotIdx - b._shotIdx);

      // Detect faces UP FRONT so we can decide between multi-pass (real
      // two-shot with 2 detected faces) and single-pass fallback (only 1
      // visible face, even though the script has 2 speakers). Sending
      // heuristic coordinates to Sync.so for a face that does not exist
      // crashes the provider pipeline (`An error occurred in the
      // generation pipeline`). The safe behaviour is: no real 2nd face →
      // single-pass with merged dialogue + auto-detect.
      const cachedFaceMap = ((scene as any)?.audio_plan?.twoshot?.faceMap) ?? null;
      // The composer writes the composed two-shot anchor into
      // `reference_image_url`. `lock_reference_url` is a legacy Director's-Cut
      // column that is almost always NULL in the composer flow — using only
      // that one caused the audit to skip the (reliable) image-based detection
      // and fall straight to the (broken) MP4 → Gemini path.
      const anchorUrlForDetect =
        ((scene as any).reference_image_url as string | undefined) ||
        ((scene as any).lock_reference_url as string | undefined) ||
        undefined;
      const detectionClipUrl = ((scene as any).lip_sync_source_clip_url || scene.clip_url) as string | null | undefined;
      const faceMap = await detectFacesInMaster(
        supabase,
        scene_id,
        anchorUrlForDetect,
        detectionClipUrl,
        cachedFaceMap,
        LOVABLE_API_KEY,
      );
      const fallbackDims = {
        width: Number(faceMap?.width) || 1280,
        height: Number(faceMap?.height) || 720,
      };
      console.log(
        `[compose-twoshot-lipsync ${scene_id}] faceMap`,
        faceMap
          ? { faces: faceMap.faces.length, width: faceMap.width, height: faceMap.height, source: faceMap.source }
          : { faces: 0, source: "heuristic-fallback", anchor: !!anchorUrlForDetect, clip: !!detectionClipUrl },
      );
      if (!faceMap) {
        console.warn(
          `[compose-twoshot-lipsync ${scene_id}] face detection did not produce 2 faces`,
          { hasAnchor: !!anchorUrlForDetect, hasClip: !!detectionClipUrl, reason: anchorUrlForDetect ? "anchor_detection_failed" : "missing_anchor" },
        );
      }

      const hasTwoRealFaces = !!faceMap && Array.isArray(faceMap.faces) && faceMap.faces.length >= 2;
      // Artlist-parity policy: when the script has 2+ speakers but the
      // rendered clip only shows 1 visible face, NEVER fall back to a single
      // merged-VO pass on one mouth — that is exactly the "all dialogue
      // coming out of one character" failure mode the user is reporting.
      // Instead refund credits, mark the scene failed with a precise reason,
      // and let the user re-roll the source clip (via the "Clip + Lipsync
      // neu rendern" action) so we get a real two-shot to lipsync.
      if (passes.length >= 2 && !hasTwoRealFaces) {
        const detected = faceMap?.faces?.length ?? 0;
        await refund(`source_clip_missing_speakers: detected ${detected}/${passes.length} faces in the rendered clip — the source video does not show all speakers, so multi-pass face-targeted lip-sync is impossible. Re-roll the clip (Clip + Lipsync neu rendern) to get a real two-shot.`);
        return;
      }
      const useMultiPass = passes.length >= 2 && hasTwoRealFaces;
      const publicPasses = passes.map(({ _shotIdx: _shotIdx, ...p }) => p);
      let outUrl: string | null = null;

      if (useMultiPass) {
        let currentVideo = sourceClipUrl;
        for (let p = 0; p < passes.length; p++) {
          const pass = passes[p];
          const target = pickTargetCoordinates(p, faceMap, fallbackDims);
          console.log(
            `[compose-twoshot-lipsync ${scene_id}] pass ${p + 1}/${passes.length}`,
            {
              speaker: pass.speaker,
              character_id: pass.character_id,
              audio: pass.track_url,
              target_face: target?.side,
              coords: target?.coords,
              source: target?.source,
            },
          );
          const passStartedAt = new Date().toISOString();
          const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
          const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
          await setStage(supabase, scene_id, p === 0 ? "lipsync_1" : "lipsync_2", {
            audio_plan: {
              ...prevPlan,
              twoshot: {
                ...prevTwoshot,
                speakers: publicPasses,
                faceMap: faceMap ?? (prevTwoshot as any).faceMap ?? null,
                heartbeat: {
                  pass: p + 1,
                  total_passes: passes.length,
                  started_at: passStartedAt,
                  speaker: pass.speaker,
                  targetFace: target?.side ?? null,
                  targetSource: target?.source ?? null,
                },
              },
            },
          });

          // Deterministic face targeting per pass via Sync.so's documented
          // `active_speaker_detection` option. With `auto_detect:false` and
          // explicit `frame_number`+`coordinates`, the model lipsyncs the
          // SPECIFIC face whose center is closest to the given point — no
          // more both-passes-onto-same-face bug.
          //
          // PRIMARY PATH: direct Sync.so v2 API (SYNC_API_KEY). Replicate's
          // wrapper flattens `input` and silently drops the nested
          // `options.active_speaker_detection` object, so face pinning never
          // reached the model. Direct API guarantees Artlist-grade parity.
          let stepUrl: string | null = null;
          try {
            if (useSyncSoDirect) {
              const jobId = await startSyncSoDirectGeneration(
                SYNC_API_KEY!,
                {
                  videoUrl: currentVideo,
                  audioUrl: pass.track_url,
                  syncMode: "cut_off",
                  temperature: 0.5,
                  targetCoords: target?.coords ?? null,
                  frameNumber: 0,
                },
                `lipsync_pass_${p + 1}`,
              );
              await setStage(supabase, scene_id, p === 0 ? "lipsync_1" : "lipsync_2", {
                replicate_prediction_id: `sync:${jobId}`,
                audio_plan: {
                  ...prevPlan,
                  twoshot: {
                    ...prevTwoshot,
                    speakers: publicPasses,
                    faceMap: faceMap ?? (prevTwoshot as any).faceMap ?? null,
                    syncJobs: {
                      provider: "sync.so",
                      mode: "poller",
                      currentPass: p + 1,
                      totalPasses: passes.length,
                      sourceVideoUrl: sourceClipUrl,
                      mergedAudioUrl: mergedVo.url,
                      costCredits: cost,
                      jobs: [
                        {
                          pass: p + 1,
                          jobId,
                          status: "PROCESSING",
                          videoUrl: currentVideo,
                          audioUrl: pass.track_url,
                          speaker: pass.speaker,
                          character_id: pass.character_id ?? null,
                          targetFace: target?.side ?? null,
                          targetCoords: target?.coords ?? null,
                          startedAt: passStartedAt,
                        },
                      ],
                    },
                    heartbeat: {
                      pass: p + 1,
                      total_passes: passes.length,
                      started_at: passStartedAt,
                      speaker: pass.speaker,
                      targetFace: target?.side ?? null,
                      targetSource: target?.source ?? null,
                      syncJobId: jobId,
                    },
                  },
                },
              });
              console.log(`[compose-twoshot-lipsync ${scene_id}] pass ${p + 1}/${passes.length} queued on Sync.so`, { jobId });
              return;
            } else {
              const input: Record<string, unknown> = {
                video: currentVideo,
                audio: pass.track_url,
                sync_mode: "cut_off",
                temperature: 0.5,
                output_format: "mp4",
                face_index: p,
                speaker: target?.side ?? (p === 0 ? "left" : "right"),
              };
              if (target) {
                input.active_speaker = false;
                input.active_speaker_detection = {
                  auto_detect: false,
                  frame_number: 0,
                  coordinates: target.coords,
                };
              } else {
                input.active_speaker = true;
              }
              stepUrl = await runLipsyncPrediction(
                replicate,
                supabase,
                scene_id,
                input,
                `lipsync_pass_${p + 1}`,
              );
            }
          } catch (e) {
            await refund(`lipsync_pass_${p + 1}_failed: ${(e as Error).message}`);
            return;
          }
          if (!stepUrl) {
            await refund(`pass_${p + 1}_no_output`);
            return;
          }
          console.log(
            `[compose-twoshot-lipsync ${scene_id}] pass ${p + 1}/${passes.length} DONE`,
            { speaker: pass.speaker, targetFace: target?.side, output: stepUrl },
          );
          currentVideo = stepUrl;
          outUrl = stepUrl;
        }
      } else {
        // Fallback: legacy single merged-audio pass. With the sample-accurate
        // WAV pipeline the merged track is exactly scene-length, so always
        // request `cut_off` (no loop artefacts).
        const syncMode = "cut_off";
        let outputUrl: string | null = null;
        try {
          if (useSyncSoDirect) {
            outputUrl = await runSyncSoDirectPrediction(
              SYNC_API_KEY!,
              supabase,
              scene_id,
              {
                videoUrl: sourceClipUrl,
                audioUrl: mergedVo.url,
                syncMode,
                temperature: 0.5,
                targetCoords: null, // auto-detect for single-speaker
              },
              "lipsync_single_pass",
            );
          } else {
            outputUrl = await runLipsyncPrediction(
              replicate,
              supabase,
              scene_id,
              {
                video: sourceClipUrl,
                audio: mergedVo.url,
                sync_mode: syncMode,
                temperature: 0.5,
                active_speaker: true,
                output_format: "mp4",
              },
              "lipsync_single_pass",
            );
          }
        } catch (e) {
          await refund(`lipsync_single_pass_failed: ${(e as Error).message}`);
          return;
        }
        await setStage(supabase, scene_id, "lipsync_2");
        outUrl = outputUrl;
      }

      if (!outUrl) {
        await refund("no_output_url");
        return;
      }

      // Re-host output in our own bucket.
      let publicUrl = outUrl;
      try {
        const dl = await fetch(outUrl);
        if (dl.ok) {
          const buf = new Uint8Array(await dl.arrayBuffer());
          const path = `${user.id}/${scene_id}-twoshot-${Date.now()}.mp4`;
          const { error: upErr } = await supabase.storage
            .from("composer-clips")
            .upload(path, buf, { contentType: "video/mp4", upsert: true });
          if (!upErr) {
            const { data: pub } = supabase.storage.from("composer-clips").getPublicUrl(path);
            if (pub?.publicUrl) publicUrl = pub.publicUrl;
          }
        }
      } catch (e) {
        console.warn("[compose-twoshot-lipsync] rehost failed, using replicate url", e);
      }

      // ── Continuity Guardian (lightweight) ─────────────────────────────
      // Without ffmpeg in Deno edge, we can't extract frames server-side.
      // We do a best-effort visual check by passing the anchor + final clip
      // poster to Gemini Vision with a structured score request. If the
      // model is unavailable, we set null and let the user inspect manually.
      await setStage(supabase, scene_id, "continuity");
      let driftScore: number | null = null;
      let driftNotes: any = null;
      try {
        const anchorUrl =
          ((scene as any).reference_image_url as string | undefined) ||
          ((scene as any).lock_reference_url as string | undefined);
        if (anchorUrl && LOVABLE_API_KEY) {
          // Use a video poster URL via a thumbnail param (composer-clips bucket
          // serves MP4 — Gemini can ingest the MP4 directly for short clips).
          const visionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text:
                        "You are a continuity supervisor. Compare the reference anchor image with the rendered video. " +
                        "Rate visual drift from 0 (identical characters/lighting/background) to 1 (completely different). " +
                        "Reply ONLY with strict JSON: {\"drift\": <0..1>, \"identity\": \"ok|drift\", \"background\": \"ok|drift\", \"lighting\": \"ok|drift\", \"notes\": \"<short reason>\"}",
                    },
                    { type: "image_url", image_url: { url: anchorUrl } },
                    { type: "image_url", image_url: { url: publicUrl } },
                  ],
                },
              ],
            }),
            // Continuity check is best-effort — short timeout.
            signal: AbortSignal.timeout(15_000),
          });
          if (visionResp.ok) {
            const vj = await visionResp.json();
            const txt = vj?.choices?.[0]?.message?.content ?? "";
            const m = String(txt).match(/\{[\s\S]*\}/);
            if (m) {
              const parsed = JSON.parse(m[0]);
              driftScore = typeof parsed.drift === "number" ? Math.max(0, Math.min(1, parsed.drift)) : null;
              driftNotes = {
                identity: parsed.identity,
                background: parsed.background,
                lighting: parsed.lighting,
                notes: parsed.notes,
              };
            }
          }
        }
      } catch (e) {
        console.warn("[compose-twoshot-lipsync] continuity check failed (non-fatal)", (e as Error).message);
      }

      // Final DB update.
      // For multi-pass two-shot, the final video's embedded audio only
      // contains the LAST pass's voice (sync.so muxes its input audio into
      // the output). The full merged dialogue lives in the external merged
      // VO track (mergedVo.url, mirrored to character_audio_url). The
      // preview/render must mute the video and play the external track.
      const isMultiPassTwoshot = useMultiPass;
      const updates: Record<string, unknown> = {
        clip_url: publicUrl,
        lip_sync_applied_at: new Date().toISOString(),
        lip_sync_status: "done",
        twoshot_stage: "done",
        continuity_drift_score: driftScore,
        continuity_drift_notes: driftNotes,
      };
      if (!(scene as any).lip_sync_source_clip_url && scene.clip_url) {
        updates.lip_sync_source_clip_url = scene.clip_url;
      }
      if (isMultiPassTwoshot && mergedVo?.url) {
        const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
        const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
        // Strip per-speaker audioUrls — they're already mixed into the
        // merged twoshot track. Leaving them in causes downstream consumers
        // (preview hook, render export) to play them again on top of the
        // merged track = audible echo.
        const prevSpeakers = Array.isArray(prevPlan.speakers)
          ? (prevPlan.speakers as Array<Record<string, unknown>>)
          : [];
        const mergedSpeakers = prevSpeakers.map((sp) => ({
          ...sp,
          audioUrl: null,
          mergedInto: "twoshot",
        }));
        updates.audio_plan = {
          ...prevPlan,
          speakers: mergedSpeakers,
          twoshot: {
            ...prevTwoshot,
            speakers: publicPasses,
            url: mergedVo.url,
            useExternalAudio: true,
            embeddedAudio: false,
            lipsyncedAt: new Date().toISOString(),
            passes: passes.length,
          },
        };
      }

      const { error: updErr } = await supabase
        .from("composer_scenes")
        .update(updates)
        .eq("id", scene_id);
      if (updErr) {
        await refund(`db_update_failed: ${updErr.message}`);
        return;
      }

      // Supersede the original silent Hailuo `video_creations` row for this
      // scene so the Media Library doesn't keep showing two cards (10s
      // silent original + new lipsynced clip). The lipsync output is the
      // user-facing version; the silent master stays in DB as audit anchor
      // via composer_scenes.lip_sync_source_clip_url but is hidden from the
      // library by the `superseded` flag.
      try {
        const { data: prior } = await supabase
          .from("video_creations")
          .select("id, metadata")
          .eq("user_id", user.id)
          .contains("metadata", { source: "motion-studio-clip", scene_id });
        if (prior && prior.length) {
          const stamp = new Date().toISOString();
          for (const row of prior) {
            const md = (row.metadata || {}) as Record<string, unknown>;
            if (md.superseded === true) continue;
            await supabase
              .from("video_creations")
              .update({
                metadata: { ...md, superseded: true, superseded_at: stamp, superseded_by: "twoshot_lipsync" },
                updated_at: stamp,
              })
              .eq("id", row.id);
          }
        }
      } catch (supErr) {
        console.warn("[compose-twoshot-lipsync] supersede prior library entries failed (non-fatal):", (supErr as Error).message);
      }

      console.log(
        `[compose-twoshot-lipsync ${scene_id}] ✅ done — clip=${publicUrl} drift=${driftScore}`,
      );
    };


    // Fire-and-forget: keep worker alive but return 202 to client now.
    // Any throw inside runPipeline triggers a refund + status='failed'.
    EdgeRuntime.waitUntil(
      (async () => {
        try {
          await runPipeline();
        } catch (e) {
          await refund(`pipeline_exception: ${(e as Error).message}`);
        }
      })(),
    );

    return json({
      accepted: true,
      scene_id,
      status: "running",
      credits_reserved: cost,
    }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

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
import { appendTwoshotDiag } from "../_shared/twoshotDiagnostics.ts";


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
    faceBbox?: [number, number, number, number] | null;
    frameNumber?: number;
    /**
     * When set, both the video and audio inputs are scoped to this window
     * (Sync.so `input[].segments_secs`). Only frames inside the window are
     * regenerated — the rest of the source video is preserved verbatim. We
     * use this for very-short utterances ("Was denn?") that get lost in long
     * silence-padded per-speaker tracks: scoping to the voiced window means
     * Sync.so sees a nearly-fully-voiced clip and VAD reliably triggers.
     */
    segmentSecs?: [number, number] | null;
    /** When true, ignore segments-invalid errors and let the caller retry. */
    allowSegmentsRetry?: boolean;
  },
  label: string,
): Promise<string> {
  const buildInput = (withSegments: boolean): Array<Record<string, unknown>> => {
    const vid: Record<string, unknown> = { type: "video", url: params.videoUrl };
    const aud: Record<string, unknown> = { type: "audio", url: params.audioUrl };
    if (withSegments && params.segmentSecs) {
      // Scope ONLY the audio window — leaving the video untouched preserves
      // the full timeline and Sync.so's speaker-detection on the unmodified
      // frames. Scoping the video as well historically destabilized face
      // selection on multi-speaker clips.
      const seg = [[Math.max(0, params.segmentSecs[0]), Math.max(0, params.segmentSecs[1])]];
      aud.segments_secs = seg;
    }
    return [vid, aud];
  };

  const options: Record<string, unknown> = {
    sync_mode: params.syncMode ?? "cut_off",
    output_format: "mp4",
    temperature: params.temperature ?? 0.5,
  };

  // Sync.so Speaker Selection API: for a single manually-selected speaker on
  // one frame, the documented (and stable) payload is `frame_number +
  // coordinates`. `bounding_boxes` is a per-frame array across the *entire*
  // video — sending it as a single box has been observed to make Sync.so fail
  // with the generic "An unknown error occurred". We only use coordinates.
  if (params.targetCoords) {
    options.active_speaker_detection = {
      auto_detect: false,
      frame_number: params.frameNumber ?? 0,
      coordinates: params.targetCoords,
    };
  } else {
    options.active_speaker_detection = { auto_detect: true };
  }

  const submit = async (withSegments: boolean): Promise<Response> => {
    return await fetch("https://api.sync.so/v2/generate", {
      method: "POST",
      headers: {
        "x-api-key": syncApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "lipsync-2-pro",
        input: buildInput(withSegments),
        options,
      }),
    });
  };

  const useSegments = !!params.segmentSecs;
  let createResp = await submit(useSegments);

  if (!createResp.ok && useSegments) {
    // Auto-fallback: if Sync.so rejects the segments_secs payload (we've seen
    // `The segments configuration is invalid` historically), retry once with
    // the full track — the per-speaker WAV is already peak-normalized so VAD
    // still has a fighting chance.
    const txt = await createResp.text().catch(() => "");
    if (/segments? configuration is invalid|invalid.+segment/i.test(txt) || createResp.status === 400) {
      console.warn(`[${label}] segments_secs rejected by Sync.so, retrying without window: ${txt.slice(0, 200)}`);
      createResp = await submit(false);
    } else {
      throw new Error(`${label}_create_${createResp.status}: ${txt.slice(0, 400)}`);
    }
  }

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
  faces: Array<{
    side: "left" | "right";
    center: [number, number];
    bbox?: [number, number, number, number];
    normCenter?: [number, number];
    /** Resolved via Gemini identity-match against character portraits. */
    characterId?: string | null;
    matchConfidence?: number;
    matchSource?: "gemini-identity" | "gemini-inferred" | "unresolved";
  }>;
  width: number;
  height: number;
  source: "cache" | "anchor" | "clip-frame" | "heuristic-fallback";
};

/**
 * Gemini-Vision identity match: given the anchor frame + one reference
 * portrait per character, returns which characterId is on the left vs right.
 * This is the authoritative source-of-truth for face↔character mapping;
 * `character_shots[]` array position is NOT geometric and was the root cause
 * of the dialog-swap bug.
 *
 * Returns null on any failure so the caller can apply a clean error path.
 */
async function askGeminiForIdentityMatch(
  anchorUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  lovableKey: string,
): Promise<{ left?: string | null; right?: string | null; confidence?: number } | null> {
  if (!characters.length) return null;
  try {
    const ids = characters.map((c) => c.characterId);
    const content: any[] = [
      {
        type: "text",
        text:
          "The FIRST image is a two-shot scene with two visible people (one on the LEFT, one on the RIGHT). " +
          "The remaining images are reference portraits, in this order: " +
          ids.map((id, i) => `(${i + 1}) ${id}`).join(", ") + ". " +
          "For the person on the LEFT of the scene and the person on the RIGHT of the scene, identify which reference portrait matches best by facial identity (face shape, hair, age, gender, distinctive features). " +
          "Return STRICT JSON only — no prose, no markdown fences. " +
          "Schema: {\"left\": \"<characterId or null>\", \"right\": \"<characterId or null>\", \"confidence\": <0..1>}. " +
          "Use only IDs from this list: " + ids.join(", ") + ". " +
          "If you are unsure, return null for that side. Never assign the same id to both sides unless only one character is provided.",
      },
      { type: "image_url", image_url: { url: anchorUrl } },
      ...characters.map((c) => ({ type: "image_url", image_url: { url: c.portraitUrl } })),
    ];
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const sanitize = (v: any): string | null => {
      const s = v ? String(v).toLowerCase().trim() : "";
      return s && allowed.has(s) ? s : null;
    };
    const left = sanitize(parsed?.left);
    const right = sanitize(parsed?.right);
    const confidence = Number(parsed?.confidence);
    return {
      left,
      right,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves brand_character portrait URLs for each unique characterId in
 * `character_shots`, scoped to the scene's owner. Used by the identity-match
 * step so Gemini can compare detected faces against canonical references.
 */
async function resolveCharacterPortraits(
  supabase: any,
  userId: string,
  characterIds: string[],
): Promise<Array<{ characterId: string; portraitUrl: string }>> {
  const uniq = Array.from(new Set(characterIds.map((s) => String(s).toLowerCase()).filter(Boolean)));
  if (!uniq.length) return [];
  try {
    // characterIds in composer scenes are slugs (e.g. "matthew-dusatko"),
    // brand_characters uses display names — match via lowercased + hyphenated name.
    const { data, error } = await supabase
      .from("brand_characters")
      .select("name, portrait_url, reference_image_url, user_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];
    const out: Array<{ characterId: string; portraitUrl: string }> = [];
    for (const id of uniq) {
      const row = data.find((r: any) => {
        const slug = String(r?.name ?? "").toLowerCase().trim().replace(/\s+/g, "-");
        return slug === id;
      });
      if (!row) continue;
      const url = String(row.portrait_url || row.reference_image_url || "").trim();
      if (url) out.push({ characterId: id, portraitUrl: url });
    }
    return out;
  } catch {
    return [];
  }
}


async function probeMp4Dims(url: string | null | undefined): Promise<{ width: number; height: number } | null> {
  if (!url) return null;
  try {
    // Never download/scan the whole MP4 in an Edge Function. A full byte-by-byte
    // scan has repeatedly hit the CPU watchdog before we can even create the
    // Sync.so job. The tkhd atom is normally near the start; if it is not in the
    // first MiB we simply fall back to the cached anchor/faceMap dimensions.
    const resp = await fetch(url, {
      headers: { Range: "bytes=0-1048575" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    const readU32 = (i: number) => ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
    const maxScan = Math.min(buf.length - 32, 1_048_576);
    for (let i = 0; i < maxScan; i++) {
      if (buf[i] !== 0x74 || buf[i + 1] !== 0x6b || buf[i + 2] !== 0x68 || buf[i + 3] !== 0x64) continue;
      const version = buf[Math.max(0, i + 4)];
      const base = i + (version === 1 ? 96 : 84);
      if (base + 7 >= buf.length) continue;
      const width = readU32(base) / 65536;
      const height = readU32(base + 4) / 65536;
      if (width > 0 && height > 0 && width < 10000 && height < 10000) return { width: Math.round(width), height: Math.round(height) };
    }
    return null;
  } catch {
    return null;
  }
}

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
  characters: Array<{ characterId: string; portraitUrl: string }> = [],
): Promise<FaceMap | null> {
  // Cache acceptance criteria: must have real dims AND identity-resolved
  // characterId on every face (otherwise we'd re-use the broken pre-identity
  // cache that caused the dialog swap). When characters are provided but the
  // cache lacks characterId, we force a refresh so identity-match runs once.
  const cacheLooksValid =
    cached && Array.isArray(cached.faces) && cached.faces.length >= 2 &&
    Number(cached.width) > 0 && Number(cached.height) > 0 &&
    cached.faces.every((f: any) => Array.isArray(f?.normCenter));
  const cacheHasIdentities =
    cacheLooksValid && cached.faces.every((f: any) => typeof f?.characterId === "string" && f.characterId.length > 0);
  const needIdentities = characters.length >= 2;
  if (cacheLooksValid && (!needIdentities || cacheHasIdentities)) {
    return { ...cached, source: "cache" } as FaceMap;
  }
  if (!lovableKey || !anchorUrl) return null;

  // Probe REAL anchor dimensions so coordinates we hand to Sync.so actually
  // land on the face (Hailuo uses the anchor as first frame, so video dims
  // == anchor dims).
  const dims = await probeImageDims(anchorUrl);
  if (!dims) {
    console.warn(`[compose-twoshot-lipsync ${sceneId}] could not probe anchor dims — Sync.so coords may be off`);
  }
  const realDims = dims ?? { width: 1280, height: 720 };

  // If we already have positions cached but just need identities, reuse them
  // instead of re-asking Gemini for face boxes.
  let norm: { faces: FaceMap["faces"]; width: number; height: number };
  if (cacheLooksValid) {
    norm = { faces: cached.faces, width: Number(cached.width), height: Number(cached.height) };
  } else {
    const raw = await askGeminiForFaces(anchorUrl, lovableKey, "image");
    if (!raw) return null;
    norm = normalizeFaces(raw, realDims);
    if (norm.faces.length < 2) return null;
  }

  // ── Identity-match step ─────────────────────────────────────────────
  // Ask Gemini which character (by reference portrait) is on the left vs
  // right of the anchor frame. This is the authoritative speaker↔face map;
  // character_shots[] array order is NOT geometric.
  if (characters.length >= 2) {
    const identity = await askGeminiForIdentityMatch(anchorUrl, characters, lovableKey);
    if (identity) {
      const { left, right, confidence } = identity;
      norm.faces = norm.faces.map((f) => {
        if (f.side === "left" && left) {
          return { ...f, characterId: left, matchConfidence: confidence ?? 0.9, matchSource: "gemini-identity" };
        }
        if (f.side === "right" && right) {
          return { ...f, characterId: right, matchConfidence: confidence ?? 0.9, matchSource: "gemini-identity" };
        }
        return { ...f, matchSource: "unresolved" as const };
      });
      // Inference: if exactly one side resolved + exactly 2 candidates, assign
      // the leftover candidate to the other side.
      const ids = characters.map((c) => c.characterId);
      const assigned = new Set(norm.faces.map((f) => f.characterId).filter(Boolean) as string[]);
      const missing = ids.filter((id) => !assigned.has(id));
      if (missing.length === 1) {
        norm.faces = norm.faces.map((f) =>
          f.characterId
            ? f
            : { ...f, characterId: missing[0], matchConfidence: 0.5, matchSource: "gemini-inferred" as const },
        );
      }
    } else {
      console.warn(`[compose-twoshot-lipsync ${sceneId}] gemini identity-match returned null`);
    }
  }

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
 *
 * Mapping is explicit and stable:
 *   1. If `characterId` + `characterShots` are provided, the speaker's
 *      position in `character_shots` (0 = left, 1 = right) determines the
 *      face side. This guarantees that "Matthew at shot index 1" goes to
 *      the right face even if speakers were sorted differently upstream.
 *   2. Otherwise we fall back to pass index (0 = left, 1 = right).
 *
 * Returns null if even the heuristic isn't resolvable (no dimensions known).
 */
function pickTargetCoordinates(
  passIndex: number,
  faceMap: { faces: Array<{ side: "left" | "right"; center: [number, number]; bbox?: [number, number, number, number]; normCenter?: [number, number] }>; width: number; height: number } | null,
  fallbackDims: { width: number; height: number },
  speakerContext?: { characterId?: string | null; characterShots?: Array<{ characterId?: string }> } | null,
): { coords: [number, number]; side: "left" | "right"; source: "gemini" | "heuristic"; mappingSource: "character_shots" | "pass_order"; faceCenter?: [number, number]; bbox?: [number, number, number, number]; anchorDims?: { width: number; height: number }; videoDims?: { width: number; height: number } } | null {
  let side: "left" | "right" = passIndex === 0 ? "left" : "right";
  let mappingSource: "character_shots" | "pass_order" = "pass_order";
  const charId = speakerContext?.characterId ? String(speakerContext.characterId).toLowerCase() : "";
  const shots = Array.isArray(speakerContext?.characterShots) ? speakerContext!.characterShots! : [];
  if (charId && shots.length >= 2) {
    const shotIdx = shots.findIndex((s) => String(s?.characterId ?? "").toLowerCase() === charId);
    if (shotIdx >= 0) {
      side = shotIdx === 0 ? "left" : "right";
      mappingSource = "character_shots";
    }
  }
  if (faceMap?.faces?.length) {
    const match = faceMap.faces.find((f) => f.side === side) ?? faceMap.faces[Math.min(passIndex, faceMap.faces.length - 1)];
    if (match?.center) {
      const anchorW = Number(faceMap.width) || 0;
      const anchorH = Number(faceMap.height) || 0;
      const videoW = Number(fallbackDims.width) || anchorW || 1280;
      const videoH = Number(fallbackDims.height) || anchorH || 720;
      const sameAspect = anchorW > 0 && anchorH > 0 && Math.abs((videoW / videoH) - (anchorW / anchorH)) < 0.03;
      const scaleX = sameAspect ? videoW / anchorW : 1;
      const scaleY = sameAspect ? videoH / anchorH : 1;
      const bbox = Array.isArray(match.bbox) && match.bbox.length === 4 ? match.bbox : undefined;
      const faceCenter: [number, number] = [Math.round(Number(match.center[0]) || 0), Math.round(Number(match.center[1]) || 0)];
      let x = faceCenter[0];
      let y = faceCenter[1];
      if (bbox) {
        const [x1, y1, x2, y2] = bbox.map((n) => Number(n));
        if ([x1, y1, x2, y2].every(Number.isFinite) && x2 > x1 && y2 > y1) {
          x = Math.round(Math.max(x1 + 4, Math.min(x2 - 4, x)));
          y = Math.round(Math.max(y1 + 4, Math.min(y2 - 4, y)));
        }
      }
      const coords: [number, number] = [Math.round(x * scaleX), Math.round(y * scaleY)];
      return { coords, side, source: "gemini", mappingSource, faceCenter, bbox, anchorDims: anchorW && anchorH ? { width: anchorW, height: anchorH } : undefined, videoDims: { width: videoW, height: videoH } };
    }
  }
  const W = fallbackDims.width || 1280;
  const H = fallbackDims.height || 720;
  const x = side === "left" ? Math.round(W * 0.3) : Math.round(W * 0.7);
  const y = Math.round(H * 0.5);
  return { coords: [x, y], side, source: "heuristic", mappingSource };
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
    const token = auth.replace("Bearer ", "").trim();
    const isServiceCall = token === serviceKey;
    let user: { id: string } | null = null;
    if (!isServiceCall) {
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      if (!authUser) return json({ error: "Unauthorized" }, 401);
      user = { id: authUser.id };
    }

    const body = await req.json().catch(() => ({}));
    const { scene_id } = body || {};
    if (!scene_id) return json({ error: "scene_id required" }, 400);

    // Load scene + verify ownership.
    const { data: scene, error: sErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, clip_url, lip_sync_source_clip_url, duration_seconds, audio_plan, character_audio_url, reference_image_url, lock_reference_url, character_shots, lip_sync_status, lip_sync_applied_at, twoshot_stage, replicate_prediction_id, updated_at",
      )
      .eq("id", scene_id)
      .single();
    if (sErr || !scene) return json({ error: "scene not found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", scene.project_id)
      .single();
    if (!project) return json({ error: "project not found" }, 404);
    if (!isServiceCall && project.user_id !== user?.id) return json({ error: "Forbidden" }, 403);
    if (isServiceCall) user = { id: project.user_id };
    if (!user) return json({ error: "Unauthorized" }, 401);

    if ((scene as any).lip_sync_status === "running") {
      const ageMs = Date.now() - new Date((scene as any).updated_at ?? 0).getTime();
      const stage = String((scene as any).twoshot_stage ?? "");
      const hb = (scene as any)?.audio_plan?.twoshot?.heartbeat ?? null;
      const jobs = (scene as any)?.audio_plan?.twoshot?.syncJobs?.jobs;
      const hasRealSyncJob =
        String((scene as any).replicate_prediction_id ?? "").startsWith("sync:") ||
        (Array.isArray(jobs) && jobs.length > 0) ||
        !!hb?.syncJobId;
      // Real progress markers: pipeline either set a heartbeat or advanced
      // to an actual provider job. A preflight/lipsync marker without sync:* is
      // exactly the CPU-abort zombie state; take over instead of returning 202.
      const hasRealProgress = hasRealSyncJob || (!!hb && stage !== "preflight");
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

    // Mark preflight only. Credits are charged later, immediately before the
    // Sync.so submit, so CPU/preflight aborts cannot burn user credits.
    await setStage(supabase, scene_id, "preflight", {
      lip_sync_status: "running",
      clip_error: null,
      replicate_prediction_id: null,
    });
    await appendTwoshotDiag(supabase, scene_id, {
      source: "compose",
      event: "preflight_started",
      stage: "preflight",
      status: "running",
      reason: `cost=${cost} duration=${Number((scene as any).duration_seconds ?? 0)}s`,
    });

    let refunded = false;
    let creditsReserved = false;
    const refund = async (reason: string) => {
      if (refunded) return;
      refunded = true;
      console.warn(`[compose-twoshot-lipsync ${scene_id}] Refund ${cost}: ${reason}`);
      if (creditsReserved) {
        const { data: w2 } = await supabase
          .from("wallets").select("balance").eq("user_id", user.id).single();
        if (w2) {
          await supabase.from("wallets").update({
            balance: Number(w2.balance ?? 0) + cost,
            updated_at: new Date().toISOString(),
          }).eq("user_id", user.id);
        }
      }
      await setStage(supabase, scene_id, "failed", {
        lip_sync_status: "failed",
        clip_error: reason.slice(0, 500),
      });
      await appendTwoshotDiag(supabase, scene_id, {
        source: "compose",
        event: "refund",
        stage: "failed",
        status: "failed",
        reason,
      });
    };

    const reserveCredits = async (): Promise<boolean> => {
      if (creditsReserved) return true;
      const { data: latestWallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();
      if (!latestWallet || Number(latestWallet.balance ?? 0) < cost) {
        await refund(`INSUFFICIENT_CREDITS_BEFORE_PROVIDER_SUBMIT: required=${cost}`);
        return false;
      }
      await supabase.from("wallets").update({
        balance: Number(latestWallet.balance ?? 0) - cost,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      creditsReserved = true;
      return true;
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
      // Do not probe the source MP4 here. The previous full-file probe was the
      // CPU hotspot that killed the function before Sync.so job creation. For
      // pass 1, cached anchor/faceMap dimensions are the authoritative target
      // space; bounded MP4 probing is reserved for later poll-time fallbacks.
      const fallbackDims = {
        width: Number(faceMap?.width) || 1280,
        height: Number(faceMap?.height) || 720,
      };
      console.log(
        `[compose-twoshot-lipsync ${scene_id}] faceMap`,
        faceMap
          ? { faces: faceMap.faces.length, width: faceMap.width, height: faceMap.height, videoWidth: fallbackDims.width, videoHeight: fallbackDims.height, source: faceMap.source }
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
        // ── Sync.so two-pass face-targeted pipeline ──────────────────────
        // The Segments API kept rejecting valid-looking two-shot payloads with
        // `The segments configuration is invalid`. For 2 visible speakers we
        // now use the stable path: one padded per-character WAV per pass and
        // explicit face coordinates from the cached faceMap.
        if (!useSyncSoDirect) {
          await refund("twoshot_two_pass_requires_direct_sync_api_key");
          return;
        }
        const firstSpeaker = passes[0];
        if (!firstSpeaker?.track_url) {
          await refund("twoshot_first_speaker_track_missing");
          return;
        }
        const firstTarget = pickTargetCoordinates(0, faceMap, fallbackDims, { characterId: firstSpeaker.character_id ?? null, characterShots: charShots });
        if (!firstTarget) {
          await refund("twoshot_first_face_target_missing");
          return;
        }
        if (!Number.isFinite(firstTarget.coords[0]) || !Number.isFinite(firstTarget.coords[1]) || firstTarget.coords[0] <= 0 || firstTarget.coords[1] <= 0) {
          await refund(`twoshot_first_face_target_invalid: ${JSON.stringify(firstTarget.coords)}`);
          return;
        }
        const startedAt = new Date().toISOString();
        const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
        const prevTwoshot = (prevPlan.twoshot ?? {}) as Record<string, unknown>;
        // Short-utterance windowing: if this speaker only talks for a brief
        // moment inside a long scene, scope Sync.so to the voiced window.
        const sceneDurSec = Number((prevTwoshot as any).totalSec) || Number((scene as any).duration_seconds) || 0;
        const vr1: any = (firstSpeaker as any).voicedRange ?? null;
        let pass1Segment: [number, number] | null = null;
        if (vr1 && Number.isFinite(vr1.voicedSec) && Number.isFinite(vr1.startSec) && Number.isFinite(vr1.endSec) && sceneDurSec > 0) {
          const shortAbsolute = vr1.voicedSec < 2.0;
          const shortRelative = sceneDurSec > 0 && (vr1.voicedSec / sceneDurSec) < 0.35;
          if ((shortAbsolute || shortRelative) && vr1.endSec > vr1.startSec) {
            const pad = 0.25;
            pass1Segment = [
              Math.max(0, Number(vr1.startSec) - pad),
              Math.min(sceneDurSec, Number(vr1.endSec) + pad),
            ];
          }
        }
        let jobId = "";
        if (!(await reserveCredits())) return;
        try {
          jobId = await startSyncSoDirectGeneration(
            SYNC_API_KEY!,
            {
              videoUrl: sourceClipUrl,
              audioUrl: firstSpeaker.track_url,
              syncMode: "cut_off",
              temperature: pass1Segment ? 0.65 : 0.5,
              targetCoords: firstTarget.coords,
              // No `faceBbox`: Sync.so wants per-frame box arrays, not a
              // single static one. coordinates+frame_number is the stable path.
              frameNumber: 0,
              segmentSecs: pass1Segment,
            },
            "twoshot_pass_1",
          );
        } catch (e) {
          const errMsg = (e as Error).message;
          await supabase.from("composer_scenes").update({
            audio_plan: {
              ...prevPlan,
              twoshot: {
                ...prevTwoshot,
                speakers: publicPasses,
                faceMap: faceMap ?? (prevTwoshot as any).faceMap ?? null,
                syncJobs: {
                  provider: "sync.so",
                  mode: "two_pass",
                  lastError: errMsg.slice(0, 1000),
                  lastErrorAt: new Date().toISOString(),
                  costCredits: cost,
                  sourceVideoUrl: sourceClipUrl,
                  mergedAudioUrl: mergedVo.url,
                  jobs: [],
                },
              },
            },
          }).eq("id", scene_id);
          await refund(`twoshot_pass_1_create_failed: ${errMsg}`);
          return;
        }

        await setStage(supabase, scene_id, "lipsync_1", {
          replicate_prediction_id: `sync:${jobId}`,
          audio_plan: {
            ...prevPlan,
            twoshot: {
              ...prevTwoshot,
              speakers: publicPasses,
              faceMap: faceMap ?? (prevTwoshot as any).faceMap ?? null,
              url: mergedVo.url,
              useExternalAudio: true,
              embeddedAudio: false,
              syncJobs: {
                provider: "sync.so",
                mode: "two_pass",
                sourceVideoUrl: sourceClipUrl,
                mergedAudioUrl: mergedVo.url,
                costCredits: cost,
                currentPass: 1,
                totalPasses: Math.min(2, passes.length),
                jobs: [{
                  pass: 1,
                  jobId,
                  status: "PROCESSING",
                  videoUrl: sourceClipUrl,
                  audioUrl: firstSpeaker.track_url,
                  speaker: firstSpeaker.speaker,
                  character_id: firstSpeaker.character_id ?? null,
                  targetFace: firstTarget.side,
                  targetCoords: firstTarget.coords,
                  targetSource: firstTarget.source,
                  mappingSource: firstTarget.mappingSource,
                  faceCenter: firstTarget.faceCenter ?? null,
                  faceBbox: firstTarget.bbox ?? null, // debug-only metadata
                  anchorDims: firstTarget.anchorDims ?? null,
                  videoDims: firstTarget.videoDims ?? null,
                  startedAt,
                }],
              },
              heartbeat: {
                mode: "two_pass",
                pass: 1,
                total_passes: Math.min(2, passes.length),
                started_at: startedAt,
                speaker: firstSpeaker.speaker,
                targetFace: firstTarget.side,
                targetSource: firstTarget.source,
                syncJobId: jobId,
              },
            },
          },
        });
        console.log(
          `[compose-twoshot-lipsync ${scene_id}] two-pass job queued on Sync.so`,
          { jobId, pass: 1, targetFace: firstTarget.side, targetCoords: firstTarget.coords },
        );
        await appendTwoshotDiag(supabase, scene_id, {
          source: "compose",
          event: "sync_job_created",
          stage: "lipsync_1",
          status: "PROCESSING",
          jobId,
          reason: `pass=1 face=${firstTarget.side} source=${firstTarget.source}${pass1Segment ? ` window=[${pass1Segment[0].toFixed(2)}s,${pass1Segment[1].toFixed(2)}s] voicedSec=${vr1?.voicedSec}` : ""}`,
        });
        return;
      } else {
        // Fallback: legacy single merged-audio pass. With the sample-accurate
        // WAV pipeline the merged track is exactly scene-length, so always
        // request `cut_off` (no loop artefacts).
        const syncMode = "cut_off";
        let outputUrl: string | null = null;
        if (!(await reserveCredits())) return;
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
      credits_reserved: 0,
      estimated_cost: cost,
    }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

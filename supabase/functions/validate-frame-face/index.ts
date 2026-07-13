/**
 * validate-frame-face (Sync.so Stufe D — Face Validation)
 *
 * Inspects one specific frame of a video URL and reports whether a face
 * is visible at the expected coordinates BEFORE we pay Sync.so for a
 * lipsync job that would otherwise return "unknown error" or animate the
 * wrong mouth.
 *
 * Strategy (cost-optimised hybrid):
 *   (A) Default: Gemini 2.5 Flash Vision with the video URL + timestamp
 *       hint. ~€0.0005/check. Returns face count + bounding boxes (0..1
 *       normalized).
 *   (B) Cached per (video_url, frame_number) for 24h in
 *       public.frame_face_cache to keep cost trivial across retries.
 *
 * Request body (POST JSON):
 *   {
 *     video_url: string,                  // required
 *     frame_number: number,               // required (0-indexed)
 *     fps?: number,                       // default 24
 *     target_coords?: [x, y, w, h] | null // normalized 0..1, optional
 *   }
 *
 * Response 200 JSON:
 *   {
 *     ok: true,
 *     cached: boolean,
 *     faceVisible: boolean,
 *     faceCount: number,
 *     faceBoxes: [{ x, y, w, h, confidence }],
 *     coordsMatch: boolean | null,         // null when target_coords omitted
 *     suggestedFrameOffset: number | null, // frames to try if !faceVisible
 *     model: string,
 *   }
 *
 * Never throws on validator failure — returns `ok: false` with an `error`
 * field so callers can degrade gracefully (skip face-gate, log warning,
 * dispatch anyway).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { detectFacesMediaPipe } from "../_shared/face-detect-mediapipe.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

interface FaceQuality {
  /** absolute degrees from frontal: 0 = perfect, ≥45 = profile shot */
  yawDegrees: number | null;
  /** absolute degrees from level: 0 = level, ≥30 = looking up/down hard */
  pitchDegrees: number | null;
  /** 0..1, 1 = both eyes wide open, 0 = closed/occluded */
  eyeOpenScore: number | null;
  /** 0..1, 1 = tack-sharp, 0 = motion-blurred */
  sharpnessScore: number | null;
  /** Composite 0..1 score, ≥0.6 = safe for Sync.so, <0.6 = shift frame. */
  faceScore: number | null;
}

interface ValidationResult {
  faceVisible: boolean;
  faceCount: number;
  faceBoxes: FaceBox[];
  coordsMatch: boolean | null;
  suggestedFrameOffset: number | null;
  model: string;
  quality?: FaceQuality;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Cache ────────────────────────────────────────────────────────────────

async function readCache(
  videoUrl: string,
  frameNumber: number,
): Promise<ValidationResult | null> {
  try {
    const { data, error } = await supabase
      .from("frame_face_cache")
      .select("result, expires_at")
      .eq("video_url", videoUrl)
      .eq("frame_number", frameNumber)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.result as ValidationResult;
  } catch {
    return null;
  }
}

async function writeCache(
  videoUrl: string,
  frameNumber: number,
  fps: number,
  result: ValidationResult,
): Promise<void> {
  try {
    await supabase
      .from("frame_face_cache")
      .upsert(
        {
          video_url: videoUrl,
          frame_number: frameNumber,
          fps,
          result,
          validator: result.model,
          face_score: result.quality?.faceScore ?? null,
          yaw_degrees: result.quality?.yawDegrees ?? null,
          pitch_degrees: result.quality?.pitchDegrees ?? null,
          eye_open_score: result.quality?.eyeOpenScore ?? null,
          sharpness_score: result.quality?.sharpnessScore ?? null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: "video_url,frame_number" },
      );
  } catch (e) {
    console.warn(`[validate-frame-face] cache write failed: ${(e as Error)?.message}`);
  }
}

// ── Coords overlap check ────────────────────────────────────────────────

/** Returns true if any detected face box overlaps the target by ≥40% of target area. */
function coordsOverlap(
  target: [number, number, number, number],
  boxes: FaceBox[],
): boolean {
  if (!target || boxes.length === 0) return false;
  const [tx, ty, tw, th] = target;
  const targetArea = Math.max(0.0001, tw * th);
  for (const b of boxes) {
    const ix = Math.max(tx, b.x);
    const iy = Math.max(ty, b.y);
    const iw = Math.max(0, Math.min(tx + tw, b.x + b.w) - ix);
    const ih = Math.max(0, Math.min(ty + th, b.y + b.h) - iy);
    const inter = iw * ih;
    if (inter / targetArea >= 0.4) return true;
  }
  return false;
}

// ── Gemini Vision call ──────────────────────────────────────────────────

async function callGeminiVision(
  videoUrl: string,
  frameNumber: number,
  fps: number,
): Promise<ValidationResult> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY missing");
  }
  const timestampSec = frameNumber / Math.max(1, fps);

  const prompt = `You are analyzing one specific frame of a video.

The frame is at timestamp ${timestampSec.toFixed(3)}s (frame ${frameNumber} @ ${fps}fps).

Look at THAT EXACT MOMENT and tell me:
1. How many human faces are clearly visible?
2. For each face, its bounding box in normalized 0..1 coordinates [x, y, width, height] where (0,0) is top-left.
3. For the LARGEST face, estimate quality signals critical for lip-sync:
   - yawDegrees: absolute head rotation from frontal in degrees (0 = looking at camera, 45 = 3/4 profile, 90 = full profile)
   - pitchDegrees: absolute head tilt from level in degrees (0 = level, 30 = clearly looking up or down)
   - eyeOpenScore: 0..1 (1 = both eyes wide open, 0.5 = squinting, 0 = closed/occluded)
   - sharpnessScore: 0..1 (1 = tack-sharp face, 0.5 = mild motion blur, 0 = heavy blur)

Reply ONLY with strict JSON, no markdown:
{
  "faceCount": <number>,
  "faces": [
    { "x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1>, "confidence": <0..1> }
  ],
  "quality": {
    "yawDegrees": <number or null>,
    "pitchDegrees": <number or null>,
    "eyeOpenScore": <0..1 or null>,
    "sharpnessScore": <0..1 or null>
  }
}

If no face is clearly visible (back of head, blurred, hidden), return faceCount=0, empty faces array, and all quality fields null.`;

  // v99: empirisch verifiziert (qa-gemini-mp4-url-probe):
  //   PRIMARY  `type=input_video` mit mp4 URL → 200.
  //   FALLBACK `type=image_url` mit data:video/mp4;base64,... → 200 (≤18 MB).
  //   400-Pfade: image_url(raw), image_url(signed), video_url, file_data.
  async function postGateway(content: unknown[]): Promise<Response> {
    return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        temperature: 0,
      }),
    });
  }

  let resp = await postGateway([
    { type: "text", text: prompt },
    { type: "input_video", input_video: { url: videoUrl } } as unknown,
  ]);

  if (!resp.ok) {
    const primaryStatus = resp.status;
    const primaryBody = await resp.text().catch(() => "");
    console.warn(
      `[validate-frame-face] input_video HTTP ${primaryStatus} body=${primaryBody.slice(0, 200)} — falling back to base64`,
    );
    // Base64 fallback
    let dataUrl: string | null = null;
    try {
      const r = await fetch(videoUrl);
      if (r.ok) {
        const ab = await r.arrayBuffer();
        if (ab.byteLength <= 18 * 1024 * 1024) {
          const bytes = new Uint8Array(ab);
          let bin = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          const mime = r.headers.get("content-type") ?? "video/mp4";
          dataUrl = `data:${mime};base64,${btoa(bin)}`;
        } else {
          console.warn(`[validate-frame-face] base64 skip: ${ab.byteLength} bytes > 18MB`);
        }
      }
    } catch (e) {
      console.warn(`[validate-frame-face] base64 fetch failed: ${(e as Error)?.message}`);
    }
    if (!dataUrl) {
      throw new Error(`gemini_http_${primaryStatus}: ${primaryBody.slice(0, 240)}`);
    }
    resp = await postGateway([
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ]);
  }

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`gemini_http_${resp.status}: ${t.slice(0, 240)}`);
  }
  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content?.trim() ?? "";
  // strip code fences if any
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: { faceCount: number; faces: FaceBox[]; quality?: any };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Sometimes the model returns prose before the JSON — grab the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`gemini_unparseable: ${cleaned.slice(0, 160)}`);
    parsed = JSON.parse(m[0]);
  }

  const faces: FaceBox[] = (Array.isArray(parsed.faces) ? parsed.faces : [])
    .map((b: any) => ({
      x: Number(b?.x) || 0,
      y: Number(b?.y) || 0,
      w: Number(b?.w) || 0,
      h: Number(b?.h) || 0,
      confidence: Number(b?.confidence ?? 0.8),
    }))
    .filter((b) => b.w > 0.02 && b.h > 0.02); // sanity: ignore noise <2% of frame

  // ── F.4 Face quality scoring ──────────────────────────────────────
  const q = parsed.quality ?? {};
  const yaw = Number.isFinite(q.yawDegrees) ? Math.abs(Number(q.yawDegrees)) : null;
  const pitch = Number.isFinite(q.pitchDegrees) ? Math.abs(Number(q.pitchDegrees)) : null;
  const eye = Number.isFinite(q.eyeOpenScore)
    ? Math.max(0, Math.min(1, Number(q.eyeOpenScore)))
    : null;
  const sharp = Number.isFinite(q.sharpnessScore)
    ? Math.max(0, Math.min(1, Number(q.sharpnessScore)))
    : null;

  // Composite: each axis maps to a 0..1 contribution, then weighted.
  // Yaw: 0°=1.0, 30°=0.5, ≥60°=0.0
  // Pitch: 0°=1.0, 20°=0.5, ≥45°=0.0
  // Eye-open and sharpness pass through 0..1.
  // Weights: yaw 0.4, pitch 0.2, eye 0.2, sharp 0.2
  function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
  const yawScore = yaw === null ? 0.8 : clamp01(1 - yaw / 60);
  const pitchScore = pitch === null ? 0.8 : clamp01(1 - pitch / 45);
  const eyeScore = eye === null ? 0.8 : eye;
  const sharpScore = sharp === null ? 0.8 : sharp;
  const faceScore = faces.length === 0
    ? 0
    : clamp01(
        yawScore * 0.4 + pitchScore * 0.2 + eyeScore * 0.2 + sharpScore * 0.2,
      );

  // Suggest a frame offset when the face is sideways/closed: try ±24 frames
  // (≈1s @ 24fps). Direction is heuristic — caller will try both signs.
  let suggestedFrameOffset: number | null = null;
  if (faces.length > 0 && faceScore < 0.6) {
    suggestedFrameOffset = 24;
  }

  return {
    faceVisible: faces.length > 0,
    faceCount: faces.length,
    faceBoxes: faces,
    coordsMatch: null, // filled by caller after overlap check
    suggestedFrameOffset,
    model: "google/gemini-2.5-flash",
    quality: {
      yawDegrees: yaw,
      pitchDegrees: pitch,
      eyeOpenScore: eye,
      sharpnessScore: sharp,
      faceScore,
    },
  };
}

// ── Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "validate-frame-face" });

  try {
    const body = await req.json().catch(() => ({}));
    const videoUrl: string | undefined = body.video_url;
    const frameNumber: number | undefined = Number.isFinite(body.frame_number)
      ? Math.max(0, Math.round(body.frame_number))
      : undefined;
    const fps: number = Number.isFinite(body.fps) ? Math.max(1, Math.round(body.fps)) : 24;
    const targetCoords: [number, number, number, number] | null =
      Array.isArray(body.target_coords) && body.target_coords.length === 4
        ? (body.target_coords.map(Number) as [number, number, number, number])
        : null;

    if (!videoUrl || frameNumber === undefined) {
      return new Response(
        JSON.stringify({ ok: false, error: "video_url and frame_number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Cache lookup ─────────────────────────────────────────────────
    const cached = await readCache(videoUrl, frameNumber);
    let result: ValidationResult;
    let cacheHit = false;
    if (cached) {
      result = cached;
      cacheHit = true;
    } else {
      // v129.21 — MediaPipe PRIMARY (dedicated face detector). Fast,
      // deterministic, pixel-accurate. Gemini falls in as fallback only.
      let mpHit: ValidationResult | null = null;
      try {
        // We don't know the exact plate dims here; use 1024×1024 nominal
        // → all bboxes are returned NORMALIZED so the caller can scale.
        const mp = await detectFacesMediaPipe({
          videoUrl,
          plateWidth: 1024,
          plateHeight: 1024,
          durationSec: Math.max(0.5, (frameNumber / Math.max(1, fps)) * 2 + 0.5),
          frameTimestamps: [Math.max(0.05, frameNumber / Math.max(1, fps))],
        });
        if (mp.ok && mp.faces.length > 0) {
          // Convert pixel bboxes (in nominal 1024×1024) back to normalized.
          const faces: FaceBox[] = mp.faces.map((f) => ({
            x: Math.max(0, Math.min(1, f.bbox[0] / 1024)),
            y: Math.max(0, Math.min(1, f.bbox[1] / 1024)),
            w: Math.max(0, Math.min(1, (f.bbox[2] - f.bbox[0]) / 1024)),
            h: Math.max(0, Math.min(1, (f.bbox[3] - f.bbox[1]) / 1024)),
            confidence: f.confidence,
          }));
          mpHit = {
            faceVisible: true,
            faceCount: faces.length,
            faceBoxes: faces,
            coordsMatch: null,
            suggestedFrameOffset: null,
            model: "mediapipe-replicate",
            quality: {
              yawDegrees: null,
              pitchDegrees: null,
              eyeOpenScore: null,
              sharpnessScore: null,
              // Pass-through: assume MediaPipe-detected face is usable.
              // Sync.so accepts ~0.5+ — we mark 0.75 (better than typical
              // Gemini composite when sharpness/eye unscored).
              faceScore: 0.75,
            },
          };
        }
      } catch (e) {
        console.warn(`[validate-frame-face] mediapipe primary failed: ${(e as Error)?.message}`);
      }
      if (mpHit) {
        result = mpHit;
      } else {
        try {
          result = await callGeminiVision(videoUrl, frameNumber, fps);
        } catch (e) {
          console.warn(`[validate-frame-face] gemini failed: ${(e as Error)?.message}`);
          return new Response(
            JSON.stringify({
              ok: false,
              cached: false,
              error: `validator_failed: ${(e as Error)?.message}`,
              // Graceful degrade hint: caller should NOT block dispatch on this
              faceVisible: true,
              faceCount: 0,
              faceBoxes: [],
              coordsMatch: null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      // Write to cache (fire and forget within response window)
      await writeCache(videoUrl, frameNumber, fps, result);
    }

    // ── Coords overlap check (always, even on cache hit) ─────────────
    const coordsMatch = targetCoords ? coordsOverlap(targetCoords, result.faceBoxes) : null;

    return new Response(
      JSON.stringify({
        ok: true,
        cached: cacheHit,
        faceVisible: result.faceVisible,
        faceCount: result.faceCount,
        faceBoxes: result.faceBoxes,
        coordsMatch,
        suggestedFrameOffset: result.suggestedFrameOffset,
        model: result.model,
        quality: result.quality ?? null,
        // Convenience top-level shortcut for callers that only care about pass/fail
        faceScore: result.quality?.faceScore ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[validate-frame-face] crash: ${(e as Error)?.message}`);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error)?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

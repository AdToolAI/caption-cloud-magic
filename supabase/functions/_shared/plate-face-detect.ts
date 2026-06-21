/**
 * plate-face-detect (v51) — Real plate-side face detection.
 *
 * Why this exists
 * ────────────────────────────────────────────────────────────────────────
 * v41–v50 derived per-speaker `bounding_boxes` for Sync.so from the
 * ANCHOR image face-map (the still composition Nano Banana 2 generated
 * before Hailuo rendered the video). The anchor and the rendered Hailuo
 * plate share the same composition logic but NOT pixel-identical faces:
 * Hailuo's framing drifts 5–15 % vs the anchor, heads can be cropped, and
 * for shoulder-to-shoulder 3+ speaker shots the rescaled boxes routinely
 * land on EMPTY background pixels.
 *
 * When Sync.so receives a `bounding_boxes` ASD pointing at an area where
 * it cannot find a face, it silently no-ops that segment — the user sees
 * a finished video with motionless lips (the exact bug reported June 5).
 *
 * v51 fixes this by detecting faces directly on the RENDERED PLATE:
 *   1. Extract a mid-duration frame via Replicate `lucataco/ffmpeg-extract-frame`
 *   2. Cache it in storage (composer-frames bucket)
 *   3. Ask Gemini 2.5 Flash Vision for normalized face bboxes on that
 *      real frame
 *   4. Convert to absolute plate pixels
 *   5. Cache the whole thing in `plate_face_cache` (30-day TTL) so
 *      retries / regenerations are free.
 *
 * The caller (compose-dialog-segments v51) decides how to map speakers
 * to detected boxes (characterId via reference portrait → left-to-right
 * ordering of plate boxes is the safest deterministic mapping).
 *
 * v129.21 — MediaPipe is now the PRIMARY detector via
 * `_shared/face-detect-mediapipe.ts`. Gemini Vision on mp4 URL stays as
 * fallback when Replicate is down / model errors. MediaPipe is what
 * Sync.so / HeyGen / Hedra use internally; Gemini was the dominant cause
 * of "no face / wrong face" coordinate drift in production.
 */
import { detectFacesMediaPipe } from "./face-detect-mediapipe.ts";

// v98 — Frame extraction via Gemini Vision directly on the video URL.
// `validate-frame-face` proves Gemini 2.5 Flash accepts an mp4 URL as
// `image_url` and returns face bboxes for the referenced timestamp.

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_TIMEOUT_MS = 30_000;

export interface PlateFaceBox {
  /** Plate pixel-space [x1, y1, x2, y2]. */
  bbox: [number, number, number, number];
  /** Plate pixel-space center [cx, cy]. */
  center: [number, number];
  /** Slot index after left-to-right sorting (0 = left-most). */
  slot: number;
  /** Optional confidence 0..1. */
  confidence?: number;
  /**
   * v155 — Plate-pixel mouth landmark. Populated only when the detector
   * is AWS Rekognition (which returns MouthLeft/Right/Down landmarks).
   * The dialog dispatch path uses this instead of bbox-center so Sync.so's
   * faceMask sits exactly on the mouth instead of the nose/forehead.
   */
  mouth?: [number, number];
}

export interface PlateFaceMap {
  faces: PlateFaceBox[];
  width: number;
  height: number;
  detector: string;
  frame_url?: string;
  cached: boolean;
}

/** sha256 hex of plate URL → primary key for the cache. */
async function hashUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * v98: no longer extracts a PNG via Replicate (those models 404).
 * Gemini Vision accepts the mp4 URL directly with a timestamp hint in
 * the prompt — see `validate-frame-face`. We simply return the plate URL
 * itself; `frame_url` in the cache row is now the plate URL.
 */
function resolveFrameUrl(plateUrl: string): string {
  return plateUrl;
}

interface GeminiFace {
  slot?: number;
  center?: [number, number];
  bbox?: [number, number, number, number];
  confidence?: number;
}

// v99 — Empirisch via qa-gemini-mp4-url-probe verifizierte Payloads:
//   PRIMARY  : `type=input_video` mit der mp4-URL → 200, faces (4.2s).
//   FALLBACK : `type=image_url` mit data:video/mp4;base64,... → 200, faces (3.4s, ≤18 MB).
// 400-Pfade (zur Doku, NICHT verwenden): image_url(raw mp4), image_url(signed mp4),
//   video_url, file/file_data — alle "Unsupported image format" oder upstream_error.

const PLATE_PROMPT = (want: number, ts: number) =>
  `Look at the frame at timestamp ${ts.toFixed(2)}s of this video. ` +
  `That frame should contain ${want} human face(s). ` +
  "Detect EVERY clearly visible human face and return a TIGHT bounding box around each face " +
  "(forehead → chin, ear → ear — exclude shoulders & background). " +
  "Return STRICT JSON only — no prose, no markdown fences. " +
  "Schema: {\"faces\":[{\"slot\":<int>,\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2],\"confidence\":<0..1>}]}. " +
  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
  "'slot' is the index after sorting all visible faces by ascending normalized x (left-most face = slot 0). " +
  "If a face is partially cropped, still return its visible portion's bbox. " +
  "If no faces, return empty faces array.";

// v154 — Strict re-prompt for Gemini Pro after a geometry sanity-gate failure.
const PLATE_PROMPT_STRICT = (want: number, ts: number) =>
  `CRITICAL: Look at the frame at timestamp ${ts.toFixed(2)}s. ` +
  `That frame contains ${want} human face(s). ` +
  "Return ONLY the HEAD bounding box for each visible person. " +
  "The bbox MUST start at the TOP of the HAIR/FOREHEAD and END at the CHIN. " +
  "Width is ear-to-ear. " +
  "DO NOT include shoulders, neck, chest, torso, arms, or any body parts below the chin. " +
  "DO NOT include the background. " +
  "The face bbox HEIGHT should be roughly 8–25 % of the image height for a typical wide group shot. " +
  "If you would include anything below the chin, your answer is WRONG — clip it at the chin. " +
  "Return STRICT JSON only — no prose, no markdown fences. " +
  "Schema: {\"faces\":[{\"slot\":<int>,\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2],\"confidence\":<0..1>}]}. " +
  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
  "'slot' = index after sorting visible faces by ascending normalized x (left-most = slot 0).";

/**
 * v154 — Geometry sanity gate. Returns ok=false when detected boxes
 * smell like torso/body boxes instead of head/face boxes.
 *   - any face center_y > 0.65 * plateHeight        → "center_far_below_midline"
 *   - mean face center_y > 0.45 * plateHeight       → "cluster_below_upper_third"
 *   - mean bbox height > 30 % of plateHeight        → "bbox_too_tall"
 *   - any single bbox height > 40 % of plateHeight  → "bbox_oversized"
 *   - any bbox h/w aspect > 1.8 (tall torso)        → "bbox_aspect_torso_like"
 */
export function validatePlateFacesGeometry(
  faces: PlateFaceBox[],
  _plateWidth: number,
  plateHeight: number,
): { ok: boolean; reason?: string; detail?: string } {
  if (!faces.length) return { ok: false, reason: "empty" };
  const H = Math.max(1, plateHeight);
  const centers = faces.map((f) => f.center?.[1] ?? 0);
  const farBelow = centers.filter((cy) => cy / H > 0.65);
  if (farBelow.length > 0) {
    return {
      ok: false,
      reason: "center_far_below_midline",
      detail: farBelow.map((cy) => `cy=${cy}`).join(","),
    };
  }
  const meanCy = centers.reduce((a, b) => a + b, 0) / centers.length;
  if (meanCy / H > 0.45) {
    return {
      ok: false,
      reason: "cluster_below_upper_third",
      detail: `meanCy=${meanCy.toFixed(0)} H=${H} ratio=${(meanCy / H).toFixed(3)}`,
    };
  }
  const heights = faces.map((f) => Math.max(0, f.bbox[3] - f.bbox[1]));
  const widths = faces.map((f) => Math.max(0, f.bbox[2] - f.bbox[0]));
  const meanHRatio = heights.reduce((a, b) => a + b, 0) / (heights.length * H);
  if (meanHRatio > 0.30) {
    return { ok: false, reason: "bbox_too_tall", detail: `meanHRatio=${meanHRatio.toFixed(3)}` };
  }
  const maxHRatio = Math.max(...heights) / H;
  if (maxHRatio > 0.40) {
    return { ok: false, reason: "bbox_oversized", detail: `maxHRatio=${maxHRatio.toFixed(3)}` };
  }
  const aspects = heights.map((h, i) => h / Math.max(1, widths[i]));
  const tallTorsoCount = aspects.filter((a) => a > 1.8).length;
  if (tallTorsoCount > 0) {
    return {
      ok: false,
      reason: "bbox_aspect_torso_like",
      detail: aspects.map((a) => a.toFixed(2)).join(","),
    };
  }
  return { ok: true };
}

function parseFaces(content: string): GeminiFace[] {
  const m = String(content ?? "").match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed?.faces) ? parsed.faces : [];
  } catch {
    return [];
  }
}

async function callGeminiGateway(
  lovableKey: string,
  content: unknown[],
  tag: string,
  model: string = "google/gemini-2.5-flash",
): Promise<{ ok: boolean; faces: GeminiFace[]; status: number | string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.warn(`${tag} gemini(${model}) HTTP ${resp.status} body=${errBody.slice(0, 240)}`);
      return { ok: false, faces: [], status: resp.status };
    }
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    return { ok: true, faces: parseFaces(String(txt)), status: 200 };
  } catch (e) {
    clearTimeout(t);
    console.warn(`${tag} gemini(${model}) exception: ${(e as Error)?.message}`);
    return { ok: false, faces: [], status: "EXCEPTION" };
  }
}

async function fetchMp4AsBase64DataUrl(url: string, maxBytes = 18 * 1024 * 1024): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[plate-face-detect] base64-fetch ${r.status} for ${url.slice(0, 80)}`);
      return null;
    }
    const ab = await r.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      console.warn(`[plate-face-detect] base64 skip: ${ab.byteLength} > ${maxBytes} bytes`);
      return null;
    }
    const bytes = new Uint8Array(ab);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const mime = r.headers.get("content-type") ?? "video/mp4";
    return `data:${mime};base64,${btoa(bin)}`;
  } catch (e) {
    console.warn(`[plate-face-detect] base64-fetch exception: ${(e as Error)?.message}`);
    return null;
  }
}

/** Ask Gemini Vision for normalized face bboxes — input_video primary, base64 fallback. */
async function askGeminiForPlateFaces(
  frameUrl: string,
  expectedCount: number,
  timestampSec: number,
  opts?: { strict?: boolean; model?: string },
): Promise<GeminiFace[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    console.warn("[plate-face-detect] LOVABLE_API_KEY missing");
    return [];
  }
  const want = Math.max(1, Math.min(8, expectedCount || 2));
  const prompt = opts?.strict
    ? PLATE_PROMPT_STRICT(want, timestampSec)
    : PLATE_PROMPT(want, timestampSec);
  const model = opts?.model ?? "google/gemini-2.5-flash";
  const tagSuffix = opts?.strict ? "strict" : "default";

  // PRIMARY: type=input_video with the mp4 URL (verified 200 via probe).
  const primary = await callGeminiGateway(
    lovableKey,
    [
      { type: "text", text: prompt },
      { type: "input_video", input_video: { url: frameUrl } } as unknown,
    ],
    `[plate-face-detect:input_video:${tagSuffix}]`,
    model,
  );
  if (primary.ok && primary.faces.length >= want) {
    return primary.faces;
  }

  // FALLBACK: data:video/mp4;base64,... via image_url (verified 200 via probe).
  const dataUrl = await fetchMp4AsBase64DataUrl(frameUrl);
  if (!dataUrl) {
    return primary.faces;
  }
  const fallback = await callGeminiGateway(
    lovableKey,
    [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    `[plate-face-detect:base64:${tagSuffix}]`,
    model,
  );
  if (fallback.ok && fallback.faces.length > primary.faces.length) {
    console.log(
      `[plate-face-detect] base64 fallback wins (${tagSuffix}): primary=${primary.faces.length} fallback=${fallback.faces.length}`,
    );
    return fallback.faces;
  }
  return primary.faces.length >= fallback.faces.length ? primary.faces : fallback.faces;
}

/** v154 — Convert raw Gemini faces (normalized 0..1) → plate-pixel PlateFaceBox[]. */
function normalizedFacesToPlateBoxes(
  rawFaces: GeminiFace[],
  plateWidth: number,
  plateHeight: number,
): PlateFaceBox[] {
  const W = Math.max(1, plateWidth);
  const H = Math.max(1, plateHeight);
  return rawFaces
    .filter((f) => Array.isArray(f?.bbox) && f.bbox.length === 4)
    .map((f) => {
      const [nx1, ny1, nx2, ny2] = (f.bbox as number[]).map((n) => Math.max(0, Math.min(1, Number(n))));
      const x1 = Math.round(nx1 * W);
      const y1 = Math.round(ny1 * H);
      const x2 = Math.round(nx2 * W);
      const y2 = Math.round(ny2 * H);
      return {
        bbox: [x1, y1, x2, y2] as [number, number, number, number],
        center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)] as [number, number],
        slot: 0,
        confidence: typeof f.confidence === "number" ? f.confidence : undefined,
      };
    })
    .filter((f) => f.bbox[2] > f.bbox[0] + 4 && f.bbox[3] > f.bbox[1] + 4)
    .sort((a, b) => a.center[0] - b.center[0])
    .map((f, idx) => ({ ...f, slot: idx }));
}

/**
 * Main entry. Returns plate-pixel-space face boxes for the given clip.
 *
 * @param params.plateUrl     Rendered video URL (e.g. Hailuo / cinematic-sync plate)
 * @param params.plateWidth   Plate width in pixels (from mp4 probe)
 * @param params.plateHeight  Plate height in pixels (from mp4 probe)
 * @param params.expectedCount Number of speakers we expect to detect
 * @param params.sceneId      For logging + cache key
 * @param params.projectId    For storage path
 * @param params.midDurationSec Approx mid-duration of the clip (for frame extraction)
 * @returns null when detection failed (caller should fall back to anchor-rescale or auto_detect)
 */
export async function detectPlateFaces(params: {
  supabase: any;
  plateUrl: string;
  plateWidth: number;
  plateHeight: number;
  expectedCount: number;
  sceneId: string;
  projectId: string;
  midDurationSec: number;
}): Promise<PlateFaceMap | null> {
  const tag = `[plate-face-detect] scene=${params.sceneId}`;
  const cacheKey = await hashUrl(params.plateUrl);

  // 1. Cache hit? v154 — validate against geometry sanity gate so stale
  // torso-bbox rows from pre-v154 dispatches don't poison new dispatches.
  try {
    const { data: cached } = await params.supabase
      .from("plate_face_cache")
      .select("plate_url, width, height, faces, detector, frame_url, expires_at")
      .eq("plate_url_hash", cacheKey)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached && Array.isArray(cached.faces) && cached.faces.length > 0) {
      const gate = validatePlateFacesGeometry(
        cached.faces as PlateFaceBox[],
        cached.width ?? params.plateWidth,
        cached.height ?? params.plateHeight,
      );
      if (gate.ok) {
        console.log(`${tag} cache HIT faces=${cached.faces.length} detector=${cached.detector}`);
        return {
          faces: cached.faces as PlateFaceBox[],
          width: cached.width,
          height: cached.height,
          detector: cached.detector,
          frame_url: cached.frame_url ?? undefined,
          cached: true,
        };
      }
      console.warn(
        `${tag} v154_cache_evict stale detector=${cached.detector} reason=${gate.reason} detail=${gate.detail ?? "-"} — re-detecting`,
      );
      try {
        await params.supabase
          .from("plate_face_cache")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("plate_url_hash", cacheKey);
      } catch (e) {
        console.warn(`${tag} v154_cache_evict update failed: ${(e as Error)?.message}`);
      }
    }
  } catch (e) {
    console.warn(`${tag} cache read failed: ${(e as Error)?.message}`);
  }



  // 2. v129.21 — Try MediaPipe FIRST (dedicated face detector, pixel-bbox,
  //    multi-frame union). Falls back to Gemini direct-mp4 on any failure.
  let detectorUsed = "gemini-2.5-flash";
  let mpFaces: PlateFaceBox[] | null = null;
  try {
    const mp = await detectFacesMediaPipe({
      videoUrl: params.plateUrl,
      plateWidth: params.plateWidth,
      plateHeight: params.plateHeight,
      durationSec: Math.max(0.5, params.midDurationSec * 2),
    });
    if (mp.ok && mp.faces.length > 0) {
      mpFaces = mp.faces
        .map((f, idx) => ({
          bbox: f.bbox,
          center: f.center,
          slot: idx,
          confidence: f.confidence,
        }))
        .sort((a, b) => a.center[0] - b.center[0])
        .map((f, idx) => ({ ...f, slot: idx }));
      detectorUsed = `mediapipe-${mp.framesScanned}f`;
      console.log(
        `${tag} mediapipe PRIMARY ok faces=${mpFaces.length} frames=${mp.framesScanned} ms=${mp.ms}`,
      );
    } else {
      console.warn(
        `${tag} mediapipe PRIMARY miss (${mp.error ?? "0 faces"}) — falling back to gemini`,
      );
    }
  } catch (e) {
    console.warn(`${tag} mediapipe PRIMARY threw: ${(e as Error)?.message} — falling back to gemini`);
  }

  // Gemini path — fallback OR when MediaPipe returned 0 faces.
  let faces: PlateFaceBox[];
  if (mpFaces && mpFaces.length > 0) {
    faces = mpFaces;
  } else {
    const frameUrl = resolveFrameUrl(params.plateUrl);
    const tsHint = Math.max(0.2, params.midDurationSec * 0.5);
    console.log(`${tag} gemini-direct-mp4 ts≈${tsHint.toFixed(2)}s url=${frameUrl.slice(0, 100)}`);

    const rawFaces = await askGeminiForPlateFaces(frameUrl, params.expectedCount, tsHint);
    if (rawFaces.length === 0) {
      console.warn(`${tag} gemini also returned 0 faces — caller should fall back`);
      return null;
    }
    faces = normalizedFacesToPlateBoxes(rawFaces, params.plateWidth, params.plateHeight);

    // v154 — Geometry sanity gate. Flash routinely returns torso/upper-body
    // bboxes when the scene has multiple closely-spaced figures (the v153.x
    // 4-speaker bug). If gate fails, retry with Gemini Pro + strict prompt.
    const gate1 = validatePlateFacesGeometry(faces, params.plateWidth, params.plateHeight);
    if (!gate1.ok) {
      console.warn(
        `${tag} v154_sanity_gate FAIL detector=flash reason=${gate1.reason} detail=${gate1.detail ?? "-"} ` +
        `— retrying with gemini-2.5-pro + strict prompt`,
      );
      const rawPro = await askGeminiForPlateFaces(
        frameUrl,
        params.expectedCount,
        tsHint,
        { strict: true, model: "google/gemini-2.5-pro" },
      );
      if (rawPro.length > 0) {
        const proFaces = normalizedFacesToPlateBoxes(rawPro, params.plateWidth, params.plateHeight);
        const gate2 = validatePlateFacesGeometry(proFaces, params.plateWidth, params.plateHeight);
        if (gate2.ok) {
          faces = proFaces;
          detectorUsed = "gemini-2.5-pro-strict";
          console.log(
            `${tag} v154_sanity_gate PRO_RECOVERY ok faces=${faces.length} ` +
            `boxes=${JSON.stringify(faces.map((f) => f.bbox))}`,
          );
        } else {
          console.warn(
            `${tag} v154_sanity_gate FAIL detector=pro reason=${gate2.reason} detail=${gate2.detail ?? "-"} ` +
            `— refusing to cache; caller falls back / blocks`,
          );
          return null;
        }
      } else {
        console.warn(`${tag} v154_sanity_gate Pro returned 0 faces — refusing to cache`);
        return null;
      }
    } else {
      detectorUsed = "gemini-2.5-flash";
    }
  }


  const W = Math.max(1, params.plateWidth);
  const H = Math.max(1, params.plateHeight);

  if (faces.length === 0) {
    console.warn(`${tag} all detector boxes degenerate — caller should fall back`);
    return null;
  }

  console.log(
    `${tag} detected ${faces.length} face(s) via ${detectorUsed} plate=${W}x${H} ` +
    `boxes=${JSON.stringify(faces.map((f) => f.bbox))}`,
  );

  // 5. Persist cache (idempotent upsert).
  try {
    await params.supabase
      .from("plate_face_cache")
      .upsert({
        plate_url_hash: cacheKey,
        plate_url: params.plateUrl,
        width: W,
        height: H,
        faces,
        detector: detectorUsed,
        frame_url: params.plateUrl,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "plate_url_hash" });
  } catch (e) {
    console.warn(`${tag} cache write failed: ${(e as Error)?.message}`);
  }

  return { faces, width: W, height: H, detector: detectorUsed, frame_url: params.plateUrl, cached: false };
}

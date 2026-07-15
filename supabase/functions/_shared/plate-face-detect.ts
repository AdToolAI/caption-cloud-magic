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

/**
 * v156 — Anchor-First Detection.
 *
 * Frame-Extract is gone entirely. AWS Rekognition runs directly on the
 * already-existing anchor frame (lock_reference_url / reference_image_url)
 * that was used as i2v input. The anchor is artifact-free, already in our
 * storage, and geometrically identical to the plate (i2v drift <50 px vs.
 * ~200 px Sync.so mask), so mouth landmarks map exactly to plate pixels.
 *
 * Legacy fallback for scenes without anchor: we still run Rekognition on
 * the plate mp4 url directly. Rekognition rejects video bytes, so this
 * fallback returns 0 faces — by design — and the caller hard-fails with a
 * clear UI message rather than letting Gemini hallucinate (the v153/v154
 * 4-speaker bug).
 */

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

/**
 * v242 — Row-major slot sorting for grid layouts.
 *
 * The legacy code sorted faces by center-X only. In a 2×2 (or 2×N) grid
 * that produces column-major order: the two left faces come first (BL vs
 * TL by ~sub-pixel X difference), then the two right faces. When the
 * script order is row-major (TL, TR, BL, BR — the natural reading order
 * users expect for "Speaker 1..4"), the slot indexes are misaligned
 * against the script and the wrong voice gets wired to the wrong face.
 *
 * Row-major sort:
 *   1. Cluster faces into rows by center-Y (rows separated by more than
 *      half the median face height).
 *   2. Within each row sort by center-X (left → right).
 *   3. Concatenate rows top → bottom.
 *
 * For single-row layouts (all speakers on the same y-band) this collapses
 * to the same X-only sort we had before, so it is safe to use everywhere.
 */
export function sortFacesRowMajor<T extends { center: [number, number]; bbox: [number, number, number, number] }>(
  faces: T[],
): T[] {
  if (faces.length <= 1) return [...faces];
  const withH = faces.map((f) => ({
    f,
    h: Math.max(1, f.bbox[3] - f.bbox[1]),
    cx: f.center[0],
    cy: f.center[1],
  }));
  const sortedH = [...withH].map((r) => r.h).sort((a, b) => a - b);
  const medianH = sortedH[Math.floor(sortedH.length / 2)] ?? 1;
  const rowThreshold = Math.max(24, medianH * 0.5);
  const byY = [...withH].sort((a, b) => a.cy - b.cy);
  const rows: Array<typeof withH> = [];
  for (const r of byY) {
    const last = rows[rows.length - 1];
    if (!last) {
      rows.push([r]);
      continue;
    }
    const lastCy = last[last.length - 1].cy;
    if (Math.abs(r.cy - lastCy) <= rowThreshold) {
      last.push(r);
    } else {
      rows.push([r]);
    }
  }
  const flat: T[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.cx - b.cx);
    for (const r of row) flat.push(r.f);
  }
  return flat;
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
  const built = rawFaces
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
    .filter((f) => f.bbox[2] > f.bbox[0] + 4 && f.bbox[3] > f.bbox[1] + 4);
  // v242 — Row-major slot sort so 2×2 / 2×N grid layouts get natural
  // TL, TR, BL, BR order (single-row layouts collapse to X-only).
  return sortFacesRowMajor(built).map((f, idx) => ({ ...f, slot: idx }));
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
  /** v156 — Anchor frame (PNG/JPG) used as i2v input. AWS runs on this. */
  anchorUrl?: string | null;
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



  // 2. v156 — Anchor-First. Run AWS Rekognition directly on the anchor
  //    frame (same composition as the plate, but artifact-free and already
  //    in storage). Zero frame-extract latency, no Replicate dependency.
  const anchorUrl = (params.anchorUrl ?? "").trim() || null;
  const expectedN = Math.max(1, params.expectedCount);
  let detectorUsed = "aws_rekognition_anchor";
  let mpFaces: PlateFaceBox[] | null = null;
  let awsError: string | null = null;

  if (anchorUrl) {
    try {
      const mp = await detectFacesMediaPipe({
        videoUrl: params.plateUrl,
        plateWidth: params.plateWidth,
        plateHeight: params.plateHeight,
        durationSec: Math.max(0.5, params.midDurationSec * 2),
        prebuiltFrameUrls: [anchorUrl],
      });
      if (mp.ok && mp.faces.length > 0) {
        mpFaces = sortFacesRowMajor(
          mp.faces.map((f, idx) => ({
            bbox: f.bbox,
            center: f.center,
            slot: idx,
            confidence: f.confidence,
            mouth: f.landmarks?.mouth,
          })),
        ).map((f, idx) => ({ ...f, slot: idx }));
        const mouthCount = mpFaces.filter((f) => Array.isArray(f.mouth)).length;
        const confList = mpFaces.map((f) => (f.confidence ?? 0).toFixed(2)).join(",");
        console.log(
          `${tag} v156_anchor_detect_ok faces=${mpFaces.length} conf=[${confList}] ` +
          `mouth=${mouthCount}/${mpFaces.length} anchor=${anchorUrl.slice(0, 100)} ms=${mp.ms}`,
        );
      } else {
        awsError = mp.error ?? "zero_faces";
        console.warn(`${tag} v156_anchor_detect_empty reason=${awsError}`);
      }
    } catch (e) {
      awsError = `exception:${(e as Error)?.message}`;
      console.warn(`${tag} v156_anchor_detect_threw ${awsError}`);
    }
  } else {
    console.warn(`${tag} v156_anchor_missing → aws_on_mp4_fallback (legacy scene)`);
    try {
      const mp = await detectFacesMediaPipe({
        videoUrl: params.plateUrl,
        plateWidth: params.plateWidth,
        plateHeight: params.plateHeight,
        durationSec: Math.max(0.5, params.midDurationSec * 2),
        prebuiltFrameUrls: [params.plateUrl],
      });
      if (mp.ok && mp.faces.length > 0) {
        mpFaces = sortFacesRowMajor(
          mp.faces.map((f, idx) => ({
            bbox: f.bbox,
            center: f.center,
            slot: idx,
            confidence: f.confidence,
            mouth: f.landmarks?.mouth,
          })),
        ).map((f, idx) => ({ ...f, slot: idx }));
        detectorUsed = "aws_rekognition_mp4_fallback";
        console.log(`${tag} v156_mp4_fallback_ok faces=${mpFaces.length}`);
      } else {
        awsError = mp.error ?? "zero_faces_on_mp4";
      }
    } catch (e) {
      awsError = `exception:${(e as Error)?.message}`;
    }
  }

  // 3. v156 Decision Tree.
  //    - exact match + high confidence → ✅ use AWS result
  //    - 0 < N < expected → HARD FAIL (no Gemini guess; was v153/v154 bug)
  //    - 0 faces → Cartoon-Rescue via Gemini-Pro strict + geometry gate
  let faces: PlateFaceBox[] | null = null;

  if (mpFaces && mpFaces.length === expectedN) {
    faces = mpFaces;
  } else if (mpFaces && mpFaces.length > 0 && mpFaces.length < expectedN) {
    console.warn(
      `${tag} v156_aws_partial faces=${mpFaces.length} expected=${expectedN} → HARD_FAIL ` +
      `(no gemini rescue — would hallucinate missing speakers)`,
    );
    return null;
  } else if (mpFaces && mpFaces.length > expectedN) {
    // More faces detected than expected (e.g. background extra). Take the
    // expectedN largest by bbox area, then re-slot left-to-right.
    const topByArea = [...mpFaces].sort((a, b) => {
      const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
      const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
      return areaB - areaA;
    }).slice(0, expectedN);
    const ranked = sortFacesRowMajor(topByArea).map((f, idx) => ({ ...f, slot: idx }));
    faces = ranked;
    console.log(`${tag} v156_aws_over_detect raw=${mpFaces.length} kept=${expectedN}`);
  } else {
    // 0 AWS faces → Cartoon-Rescue. Gemini-Pro strict on the anchor (or
    // mp4 fallback) + hard geometry gate. Mismatch = hard fail, no flash.
    const rescueUrl = anchorUrl ?? params.plateUrl;
    const tsHint = anchorUrl ? 0 : Math.max(0.2, params.midDurationSec * 0.5);
    console.warn(
      `${tag} v156_aws_zero_faces (reason=${awsError ?? "unknown"}) → cartoon_rescue_attempt ` +
      `via gemini-2.5-pro strict on ${anchorUrl ? "anchor" : "mp4"}`,
    );
    const rawPro = await askGeminiForPlateFaces(
      rescueUrl,
      expectedN,
      tsHint,
      { strict: true, model: "google/gemini-2.5-pro" },
    );
    if (rawPro.length === 0) {
      console.warn(`${tag} v156_cartoon_rescue_fail reason=gemini_zero_faces`);
      return null;
    }
    const proFaces = normalizedFacesToPlateBoxes(rawPro, params.plateWidth, params.plateHeight);
    const gate = validatePlateFacesGeometry(proFaces, params.plateWidth, params.plateHeight);
    if (!gate.ok) {
      console.warn(
        `${tag} v156_cartoon_rescue_fail reason=geometry_gate:${gate.reason} detail=${gate.detail ?? "-"}`,
      );
      return null;
    }
    if (proFaces.length !== expectedN) {
      console.warn(
        `${tag} v156_cartoon_rescue_fail reason=count_mismatch got=${proFaces.length} expected=${expectedN}`,
      );
      return null;
    }
    faces = proFaces;
    detectorUsed = "gemini-2.5-pro-cartoon";
    console.log(`${tag} v156_cartoon_rescue_ok faces=${faces.length}`);
  }



  const W = Math.max(1, params.plateWidth);
  const H = Math.max(1, params.plateHeight);

  if (!faces || faces.length === 0) {
    console.warn(`${tag} v156_no_faces — caller hard-fails`);
    return null;
  }

  // ── v157 — AWS-Geometry-Gate + Auto-Tighten ──────────────────────────
  // AWS Rekognition liefert bei eng gepackten Multi-Speaker-Plates oft
  // Boxen die Hals + Schultern mit einschließen (aspect H/W > 1.4, oder
  // bbox.h > 22 % der Plate-Höhe). Sync.so faceMask trifft dann Brust/
  // Hintergrund-Pixel und morphed sie ("Animorph"-Artefakt bei Sprecher
  // 2–4 in 4-Personen-Szenen).
  //
  // Fix: jede zu hohe/zu schulterlastige Box wird auf ein realistisches
  // Stirn→Kinn-Verhältnis (h ≈ w * 1.15) zentriert auf das Mund-Landmark
  // (bzw. obere ⅓ der alten Box) heruntergerechnet. Bleibt sie über 25 %
  // Höhe, ist die Detection korrupt → hard fail.
  // v170 — Single-speaker closeups (MCU/CU) sind legitime Komposition und
  // dürfen ein großes Face-Bbox haben. Nur Multi-Speaker-Plates oder
  // eindeutige Torso-Fehlmasken werden hart abgelehnt.
  const isSingleSpeaker = faces.length === 1 && expectedN === 1;
  const tightened: PlateFaceBox[] = [];
  for (const f of faces) {
    const [bx1, by1, bx2, by2] = f.bbox;
    const w = Math.max(1, bx2 - bx1);
    const h = Math.max(1, by2 - by1);
    const aspectIn = h / w;
    const hRatioIn = h / H;
    // Trigger nur bei wirklich verdächtiger Geometrie. Für Single-Speaker
    // Closeups (mit Mund-Landmark) tolerieren wir große Boxen bis 60%.
    const triggerAspect = isSingleSpeaker ? 1.6 : 1.35;
    const triggerHRatio = isSingleSpeaker ? 0.45 : 0.22;
    if (aspectIn > triggerAspect || hRatioIn > triggerHRatio) {
      const anchorY = Array.isArray(f.mouth) && Number.isFinite(f.mouth[1])
        ? f.mouth[1]
        : Math.round(by1 + h / 3);
      const cx = Math.round((bx1 + bx2) / 2);
      const newW = w;
      const newH = Math.round(w * 1.15);
      const nx1 = Math.max(0, Math.round(cx - newW / 2));
      const nx2 = Math.min(W, Math.round(cx + newW / 2));
      const ny1 = Math.max(0, Math.round(anchorY - newH / 2));
      const ny2 = Math.min(H, Math.round(anchorY + newH / 2));
      const tightH = ny2 - ny1;
      const tightHRatio = tightH / H;
      // Hard-Fail-Schwelle: Single-Speaker = 0.60, Multi = 0.25 (alt).
      const hardFailRatio = isSingleSpeaker ? 0.60 : 0.25;
      if (tightHRatio > hardFailRatio) {
        // Letzter Rettungsversuch: wenn ein Mund-Landmark vorhanden ist,
        // bauen wir die Box direkt um den Mund mit konservativer Größe.
        if (Array.isArray(f.mouth) && Number.isFinite(f.mouth[0]) && Number.isFinite(f.mouth[1])) {
          const mx = f.mouth[0];
          const my = f.mouth[1];
          const faceH = Math.min(H, Math.round(Math.min(w, H * 0.55)));
          const faceW = Math.round(faceH / 1.15);
          const rx1 = Math.max(0, Math.round(mx - faceW / 2));
          const rx2 = Math.min(W, Math.round(mx + faceW / 2));
          // Mund liegt typischerweise im unteren Drittel des Gesichts
          const ry1 = Math.max(0, Math.round(my - faceH * 0.66));
          const ry2 = Math.min(H, Math.round(my + faceH * 0.34));
          const rebuiltBbox: [number, number, number, number] = [rx1, ry1, rx2, ry2];
          const rebuiltCenter: [number, number] = [
            Math.round((rx1 + rx2) / 2),
            Math.round((ry1 + ry2) / 2),
          ];
          console.log(
            `${tag} v170_geometry_mouth_rebuild slot=${f.slot} ` +
            `hRatio_in=${hRatioIn.toFixed(3)} hRatio_out=${((ry2 - ry1) / H).toFixed(3)} ` +
            `single=${isSingleSpeaker}`,
          );
          tightened.push({ ...f, bbox: rebuiltBbox, center: rebuiltCenter });
          continue;
        }
        console.warn(
          `${tag} v170_geometry_tighten_failed aspect_in=${aspectIn.toFixed(2)} ` +
          `hRatio_in=${hRatioIn.toFixed(3)} tightHRatio=${tightHRatio.toFixed(3)} ` +
          `single=${isSingleSpeaker} mouth=false — HARD_FAIL`,
        );
        return null;
      }
      const newBbox: [number, number, number, number] = [nx1, ny1, nx2, ny2];
      const newCenter: [number, number] = [
        Math.round((nx1 + nx2) / 2),
        Math.round((ny1 + ny2) / 2),
      ];
      console.log(
        `${tag} v170_geometry_tighten slot=${f.slot} aspect_in=${aspectIn.toFixed(2)} ` +
        `aspect_out=${(tightH / newW).toFixed(2)} hRatio_in=${hRatioIn.toFixed(3)} ` +
        `hRatio_out=${tightHRatio.toFixed(3)} mouth_used=${!!f.mouth} single=${isSingleSpeaker}`,
      );
      tightened.push({ ...f, bbox: newBbox, center: newCenter });
    } else {
      tightened.push(f);
    }
  }
  faces = tightened;

  console.log(
    `${tag} detected ${faces.length} face(s) via ${detectorUsed} plate=${W}x${H} ` +
    `boxes=${JSON.stringify(faces.map((f) => f.bbox))}`,
  );

  // 5. Persist cache (idempotent upsert). v155: also persists mouth
  //    landmarks when Rekognition produced them, so cache HITs preserve
  //    the precise mouth coords without re-detecting.
  try {
    const mouthLandmarks = faces
      .filter((f) => Array.isArray(f.mouth))
      .map((f) => ({ slot: f.slot, mouth: f.mouth }));
    await params.supabase
      .from("plate_face_cache")
      .upsert({
        plate_url_hash: cacheKey,
        plate_url: params.plateUrl,
        width: W,
        height: H,
        faces,
        detector: detectorUsed,
        detection_provider: detectorUsed,
        mouth_landmarks: mouthLandmarks.length ? mouthLandmarks : null,
        frame_url: params.plateUrl,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "plate_url_hash" });
  } catch (e) {
    console.warn(`${tag} cache write failed: ${(e as Error)?.message}`);
  }

  return { faces, width: W, height: H, detector: detectorUsed, frame_url: params.plateUrl, cached: false };
}

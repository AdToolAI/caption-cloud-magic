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
 */

// v98 — Frame extraction via Gemini Vision directly on the video URL.
// Replicate's `lucataco/ffmpeg-extract-frame` and `lucataco/frame-extractor`
// both 404 (models removed). `validate-frame-face` proves Gemini 2.5 Flash
// accepts an mp4 URL as `image_url` and returns face bboxes for the
// referenced timestamp — no Replicate call, no PNG rehost needed.

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

/** Extract one frame from the plate via Replicate's ffmpeg model, upload to composer-frames. */
async function extractPlateFrame(params: {
  supabase: any;
  plateUrl: string;
  midDurationSec: number;
  sceneId: string;
  projectId: string;
}): Promise<string | null> {
  // v51.1 — Replicate SDK + dual env var support.
  // The previous direct POST to
  // `https://api.replicate.com/v1/models/lucataco/ffmpeg-extract-frame/predictions`
  // returns 404 (Replicate's model-by-name predictions endpoint expects a
  // pinned version for some models). The SDK handles version resolution
  // automatically and is the path already proven stable by
  // `extract-video-frames` and `extract-video-last-frame`.
  const REPLICATE_API_TOKEN =
    Deno.env.get("REPLICATE_API_TOKEN") ?? Deno.env.get("REPLICATE_API_KEY");
  if (!REPLICATE_API_TOKEN) {
    console.warn("[plate-face-detect] REPLICATE_API_TOKEN/REPLICATE_API_KEY missing — cannot extract frame");
    return null;
  }
  const timestamp = Math.max(0.5, Math.min(params.midDurationSec, params.midDurationSec * 0.5));

  let frameUrl: string | null = null;
  try {
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FRAME_EXTRACT_TIMEOUT_MS);
    let out: any;
    try {
      out = await replicate.run(
        "lucataco/ffmpeg-extract-frame" as `${string}/${string}`,
        { input: { video: params.plateUrl, timestamp } },
      );
    } finally {
      clearTimeout(t);
    }
    if (typeof out === "string") frameUrl = out;
    else if (Array.isArray(out) && typeof out[0] === "string") frameUrl = out[0];
    else if (out && typeof (out as any)?.url === "function") frameUrl = (out as any).url();
    else if (out && typeof (out as any)?.url === "string") frameUrl = (out as any).url;
  } catch (e) {
    console.warn(`[plate-face-detect] ffmpeg-extract-frame SDK failed: ${(e as Error)?.message}`);
  }

  // Fallback: lucataco/frame-extractor (different model, returns last frame by default;
  // we ask for first frame which is close enough to mid for our face-locate purpose).
  if (!frameUrl) {
    try {
      const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
      const out: any = await replicate.run(
        "lucataco/frame-extractor" as `${string}/${string}`,
        { input: { video: params.plateUrl, return_first_frame: true } },
      );
      if (typeof out === "string") frameUrl = out;
      else if (Array.isArray(out) && typeof out[0] === "string") frameUrl = out[0];
      else if (out && typeof (out as any)?.url === "function") frameUrl = (out as any).url();
      else if (out && typeof (out as any)?.url === "string") frameUrl = (out as any).url;
    } catch (e) {
      console.warn(`[plate-face-detect] frame-extractor fallback failed: ${(e as Error)?.message}`);
    }
  }

  if (!frameUrl) {
    console.warn("[plate-face-detect] no frameUrl returned from any extractor");
    return null;
  }

  // Rehost into our own bucket so the URL is stable & Gemini can fetch it
  // (Replicate URLs expire after ~1h).
  try {
    const pngRes = await fetch(frameUrl);
    if (!pngRes.ok) {
      console.warn(`[plate-face-detect] fetch frame ${pngRes.status}`);
      return frameUrl;
    }
    const bytes = new Uint8Array(await pngRes.arrayBuffer());
    const path = `${params.projectId}/plate-frames/${params.sceneId}-${Date.now()}.png`;
    const up = await params.supabase.storage
      .from("composer-frames")
      .upload(path, bytes, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "31536000",
      });
    if (up.error) {
      console.warn(`[plate-face-detect] storage upload failed: ${up.error.message}`);
      return frameUrl;
    }
    const { data: pub } = params.supabase.storage
      .from("composer-frames")
      .getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.warn(`[plate-face-detect] rehost exception: ${(e as Error)?.message}`);
    return frameUrl;
  }
}

interface GeminiFace {
  slot?: number;
  center?: [number, number];
  bbox?: [number, number, number, number];
  confidence?: number;
}

/** Ask Gemini Vision for normalized face bboxes on the extracted frame. */
async function askGeminiForPlateFaces(
  frameUrl: string,
  expectedCount: number,
): Promise<GeminiFace[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    console.warn("[plate-face-detect] LOVABLE_API_KEY missing");
    return [];
  }
  const want = Math.max(1, Math.min(8, expectedCount || 2));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
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
                  `This is a single frame from a rendered video that should contain ${want} human face(s). ` +
                  "Detect EVERY clearly visible human face and return a TIGHT bounding box around each face " +
                  "(forehead → chin, ear → ear — exclude shoulders & background). " +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  "Schema: {\"faces\":[{\"slot\":<int>,\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2],\"confidence\":<0..1>}]}. " +
                  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
                  "'slot' is the index after sorting all visible faces by ascending normalized x (left-most face = slot 0). " +
                  "If a face is partially cropped, still return its visible portion's bbox. " +
                  "If no faces, return empty faces array.",
              },
              { type: "image_url", image_url: { url: frameUrl } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      console.warn(`[plate-face-detect] gemini HTTP ${resp.status}`);
      return [];
    }
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed?.faces) ? parsed.faces : [];
  } catch (e) {
    console.warn(`[plate-face-detect] gemini exception: ${(e as Error)?.message}`);
    return [];
  }
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

  // 1. Cache hit?
  try {
    const { data: cached } = await params.supabase
      .from("plate_face_cache")
      .select("plate_url, width, height, faces, detector, frame_url, expires_at")
      .eq("plate_url_hash", cacheKey)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached && Array.isArray(cached.faces) && cached.faces.length > 0) {
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
  } catch (e) {
    console.warn(`${tag} cache read failed: ${(e as Error)?.message}`);
  }

  // 2. Extract a real frame from the plate.
  const frameUrl = await extractPlateFrame({
    supabase: params.supabase,
    plateUrl: params.plateUrl,
    midDurationSec: params.midDurationSec,
    sceneId: params.sceneId,
    projectId: params.projectId,
  });
  if (!frameUrl) {
    console.warn(`${tag} frame extract FAILED — caller should fall back`);
    return null;
  }
  console.log(`${tag} frame extracted url=${frameUrl.slice(0, 100)}`);

  // 3. Ask Gemini Vision for face bboxes on the real plate frame.
  const rawFaces = await askGeminiForPlateFaces(frameUrl, params.expectedCount);
  if (rawFaces.length === 0) {
    console.warn(`${tag} gemini returned 0 faces — caller should fall back`);
    return null;
  }

  // 4. Normalize → plate pixel space. Sort left-to-right. Re-assign slots.
  const W = Math.max(1, params.plateWidth);
  const H = Math.max(1, params.plateHeight);
  const faces: PlateFaceBox[] = rawFaces
    .filter((f) => Array.isArray(f?.bbox) && f.bbox.length === 4)
    .map((f) => {
      const [nx1, ny1, nx2, ny2] = (f.bbox as number[]).map((n) => Math.max(0, Math.min(1, Number(n))));
      const x1 = Math.round(nx1 * W);
      const y1 = Math.round(ny1 * H);
      const x2 = Math.round(nx2 * W);
      const y2 = Math.round(ny2 * H);
      const cx = Math.round((x1 + x2) / 2);
      const cy = Math.round((y1 + y2) / 2);
      return {
        bbox: [x1, y1, x2, y2] as [number, number, number, number],
        center: [cx, cy] as [number, number],
        slot: 0, // re-computed after sorting
        confidence: typeof f.confidence === "number" ? f.confidence : undefined,
      };
    })
    .filter((f) => f.bbox[2] > f.bbox[0] + 4 && f.bbox[3] > f.bbox[1] + 4)
    .sort((a, b) => a.center[0] - b.center[0])
    .map((f, idx) => ({ ...f, slot: idx }));

  if (faces.length === 0) {
    console.warn(`${tag} all gemini boxes degenerate — caller should fall back`);
    return null;
  }

  console.log(
    `${tag} detected ${faces.length} face(s) plate=${W}x${H} ` +
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
        detector: "gemini-2.5-flash",
        frame_url: frameUrl,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "plate_url_hash" });
  } catch (e) {
    console.warn(`${tag} cache write failed: ${(e as Error)?.message}`);
  }

  return { faces, width: W, height: H, detector: "gemini-2.5-flash", frame_url: frameUrl, cached: false };
}

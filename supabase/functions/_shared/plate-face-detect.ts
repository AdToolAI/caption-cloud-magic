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

// v52: No Replicate frame extraction — Gemini accepts MP4s directly via
// `type: "video_url"`. The previous Replicate dependency (lucataco/
// ffmpeg-extract-frame) was deleted from Replicate, so this also fixes a
// hard outage.

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_TIMEOUT_MS = 45_000;


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

// v52: extractPlateFrame removed — Gemini reads the MP4 directly.


interface GeminiFace {
  slot?: number;
  center?: [number, number];
  bbox?: [number, number, number, number];
  confidence?: number;
}

/** Ask Gemini Vision for normalized face bboxes — accepts MP4 or image URL. */
async function askGeminiForPlateFaces(
  mediaUrl: string,
  expectedCount: number,
  timestampSec: number,
): Promise<GeminiFace[]> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    console.warn("[plate-face-detect] LOVABLE_API_KEY missing");
    return [];
  }
  const want = Math.max(1, Math.min(8, expectedCount || 2));
  const isVideo = /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(mediaUrl);
  const mediaPart = isVideo
    ? { type: "video_url", video_url: { url: mediaUrl } }
    : { type: "image_url", image_url: { url: mediaUrl } };
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
                  (isVideo
                    ? `Analyse the video frame at approximately t=${timestampSec.toFixed(2)}s. It should contain ${want} human face(s). `
                    : `This is a single frame that should contain ${want} human face(s). `) +
                  "Detect EVERY clearly visible human face and return a TIGHT bounding box around each face " +
                  "(forehead → chin, ear → ear — exclude shoulders & background). " +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  "Schema: {\"faces\":[{\"slot\":<int>,\"center\":[nx,ny],\"bbox\":[nx1,ny1,nx2,ny2],\"confidence\":<0..1>}]}. " +
                  "Coordinates MUST be NORMALIZED 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
                  "'slot' is the index after sorting all visible faces by ascending normalized x (left-most face = slot 0). " +
                  "If a face is partially cropped, still return its visible portion's bbox. " +
                  "If no faces, return empty faces array.",
              },
              mediaPart,
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

  // 2. Ask Gemini Vision directly on the MP4 plate URL (v52: no Replicate
  //    frame extraction — Gemini reads the video itself via `video_url`).
  const timestampSec = Math.max(0.5, params.midDurationSec * 0.5);
  const rawFaces = await askGeminiForPlateFaces(
    params.plateUrl,
    params.expectedCount,
    timestampSec,
  );
  if (rawFaces.length === 0) {
    console.warn(`${tag} gemini returned 0 faces — caller should fall back`);
    return null;
  }

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
        detector: "gemini-2.5-flash-video",
        frame_url: null,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "plate_url_hash" });
  } catch (e) {
    console.warn(`${tag} cache write failed: ${(e as Error)?.message}`);
  }

  return { faces, width: W, height: H, detector: "gemini-2.5-flash-video", frame_url: undefined, cached: false };

}

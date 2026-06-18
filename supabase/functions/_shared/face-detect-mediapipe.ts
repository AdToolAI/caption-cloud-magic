/**
 * face-detect-mediapipe.ts (v129.21) — Dedicated face detector.
 *
 * WHY: Gemini Vision is a semantic VLM, not a face detector. Its bboxes
 * drift 10-20%, recall on profile/low-light is ~70%, and it's the dominant
 * cause of "Sync.so animated the wrong face / no face" failures.
 *
 * Production face detectors (Sync.so / HeyGen / Hedra all use these
 * internally): MediaPipe / RetinaFace / InsightFace. We adopt the same
 * primary detector via Replicate (`chigozienri/mediapipe-face`, public
 * since 2022, ~$0.0005/run, ~1s p50, deterministic pixel-bboxes).
 *
 * Pipeline (per plate):
 *   1. Extract N frames (first/mid/last) via `lucataco/ffmpeg-extract-frame`
 *   2. Run MediaPipe on each PNG in parallel
 *   3. Merge: per-detection-cluster Union-bbox + median center
 *
 * Fallback chain:
 *   - Replicate timeout / 5xx / model crash → caller falls back to
 *     Gemini Vision (existing path in plate-face-detect.ts).
 *
 * Cost: 3× frame-extract ($0.0003) + 3× mediapipe ($0.0005) ≈ $0.0024
 * per plate. Cache-hit rate is high (plate URLs are stable per render).
 */
import Replicate from "npm:replicate@0.25.2";

// v129.21.1: Project secret is `REPLICATE_API_KEY` (see secrets manifest).
// Older Replicate-using functions read `REPLICATE_API_TOKEN`. Accept both so
// that an env-name mismatch never silently disables the primary detector again.
const REPLICATE_TOKEN =
  Deno.env.get("REPLICATE_API_KEY") ??
  Deno.env.get("REPLICATE_API_TOKEN") ??
  "";

const FRAME_EXTRACT_MODEL = "lucataco/ffmpeg-extract-frame";
// chigozienri/mediapipe-face returns a JSON list of detections with a
// normalized bbox `{xmin, ymin, width, height}` per face plus a landmark
// list (eye / nose / mouth). We map this into our canonical PlateFaceBox.
const MEDIAPIPE_MODEL = "chigozienri/mediapipe-face";

const FRAME_TIMEOUT_MS = 25_000;
const MP_TIMEOUT_MS = 20_000;

export interface MediaPipeFace {
  /** Pixel-space [x1, y1, x2, y2] within the source plate dimensions. */
  bbox: [number, number, number, number];
  /** Pixel-space [cx, cy]. */
  center: [number, number];
  /** 0..1 detector confidence (1.0 when MediaPipe didn't supply one). */
  confidence: number;
  /** Optional landmark dict — present only when MediaPipe returned them. */
  landmarks?: {
    leftEye?: [number, number];
    rightEye?: [number, number];
    nose?: [number, number];
    mouth?: [number, number];
  };
  /** Which frame index this detection came from (0/1/2 for first/mid/last). */
  frameSeen: number;
}

export interface MediaPipeDetectResult {
  ok: boolean;
  faces: MediaPipeFace[];
  framesScanned: number;
  /** Plate-pixel union of all face bboxes + 10% padding. null when no faces. */
  unionBbox: [number, number, number, number] | null;
  source: "mediapipe" | "error";
  ms: number;
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

/** Extract a single PNG frame at `timestampSec` via Replicate. */
async function extractFrame(
  replicate: Replicate,
  videoUrl: string,
  timestampSec: number,
): Promise<string | null> {
  try {
    const out: any = await withTimeout(
      replicate.run(FRAME_EXTRACT_MODEL as `${string}/${string}`, {
        input: { video: videoUrl, timestamp: Math.max(0.05, timestampSec) },
      }),
      FRAME_TIMEOUT_MS,
      "frame_extract",
    );
    const url = typeof out === "string"
      ? out
      : Array.isArray(out)
      ? out[0]
      : out?.url?.() ?? out?.url ?? "";
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch (e) {
    console.warn(`[mp-detect] frame extract t=${timestampSec.toFixed(2)}s failed: ${(e as Error).message}`);
    return null;
  }
}

interface MpRawFace {
  // chigozienri/mediapipe-face output shape (most common): normalized box
  xmin?: number; ymin?: number; width?: number; height?: number;
  // Some MediaPipe wrappers return absolute pixel coords instead — handle both.
  x?: number; y?: number; w?: number; h?: number;
  confidence?: number; score?: number;
  // Landmarks: array of {x,y} or keyed dict.
  landmarks?: Array<{ x: number; y: number; name?: string }>
    | Record<string, { x: number; y: number }>;
}

/** Call MediaPipe on a single frame PNG; return raw detections. */
async function callMediaPipe(
  replicate: Replicate,
  frameUrl: string,
  frameIndex: number,
  imgW: number,
  imgH: number,
): Promise<MediaPipeFace[]> {
  let raw: any;
  try {
    raw = await withTimeout(
      replicate.run(MEDIAPIPE_MODEL as `${string}/${string}`, {
        input: { image: frameUrl },
      }),
      MP_TIMEOUT_MS,
      "mediapipe",
    );
  } catch (e) {
    console.warn(`[mp-detect] mediapipe frame=${frameIndex} failed: ${(e as Error).message}`);
    return [];
  }

  // chigozienri/mediapipe-face returns either:
  //   - an array of detection objects, OR
  //   - { detections: [...] }, OR
  //   - a URL pointing to a JSON file with the detections.
  let detections: MpRawFace[] = [];
  if (Array.isArray(raw)) {
    detections = raw as MpRawFace[];
  } else if (Array.isArray((raw as any)?.detections)) {
    detections = (raw as any).detections as MpRawFace[];
  } else if (Array.isArray((raw as any)?.faces)) {
    detections = (raw as any).faces as MpRawFace[];
  } else if (typeof raw === "string" && raw.startsWith("http")) {
    try {
      const r = await fetch(raw, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      detections = Array.isArray(j) ? j : (j?.detections ?? j?.faces ?? []);
    } catch (e) {
      console.warn(`[mp-detect] follow-up JSON fetch failed: ${(e as Error).message}`);
    }
  }

  const out: MediaPipeFace[] = [];
  for (const d of detections) {
    // Resolve bbox in pixel space.
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    const xmin = Number(d.xmin ?? d.x);
    const ymin = Number(d.ymin ?? d.y);
    const w = Number(d.width ?? d.w);
    const h = Number(d.height ?? d.h);
    if (!Number.isFinite(xmin) || !Number.isFinite(ymin) || !Number.isFinite(w) || !Number.isFinite(h)) {
      continue;
    }
    // Heuristic: if all values ≤1, treat as normalized; else absolute pixels.
    const isNorm = xmin <= 1.0 && ymin <= 1.0 && w <= 1.0 && h <= 1.0;
    if (isNorm) {
      x1 = Math.round(xmin * imgW); y1 = Math.round(ymin * imgH);
      x2 = Math.round((xmin + w) * imgW); y2 = Math.round((ymin + h) * imgH);
    } else {
      x1 = Math.round(xmin); y1 = Math.round(ymin);
      x2 = Math.round(xmin + w); y2 = Math.round(ymin + h);
    }
    x1 = Math.max(0, Math.min(imgW, x1));
    y1 = Math.max(0, Math.min(imgH, y1));
    x2 = Math.max(0, Math.min(imgW, x2));
    y2 = Math.max(0, Math.min(imgH, y2));
    if (x2 - x1 < 8 || y2 - y1 < 8) continue;

    out.push({
      bbox: [x1, y1, x2, y2],
      center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
      confidence: Math.max(0, Math.min(1, Number(d.confidence ?? d.score ?? 1))),
      frameSeen: frameIndex,
    });
  }
  return out;
}

/**
 * Detect faces on a plate video using MediaPipe.
 *
 * @param opts.frameTimestamps Seconds offsets to sample (first/mid/last typical).
 *                              Default [0.1, mid, last-0.1].
 */
export async function detectFacesMediaPipe(opts: {
  videoUrl: string;
  plateWidth: number;
  plateHeight: number;
  durationSec: number;
  frameTimestamps?: number[];
}): Promise<MediaPipeDetectResult> {
  const t0 = Date.now();
  if (!REPLICATE_TOKEN) {
    console.warn("[mp-detect] no replicate token (checked REPLICATE_API_KEY + REPLICATE_API_TOKEN) — primary detector disabled");
    return { ok: false, faces: [], framesScanned: 0, unionBbox: null, source: "error", ms: 0, error: "no_replicate_token" };
  }

  const replicate = new Replicate({ auth: REPLICATE_TOKEN });
  const W = Math.max(1, opts.plateWidth);
  const H = Math.max(1, opts.plateHeight);
  const dur = Math.max(0.5, opts.durationSec);

  const stamps = opts.frameTimestamps ?? [
    0.1,
    Math.max(0.2, dur * 0.5),
    Math.max(0.3, dur - 0.1),
  ];

  // 1) Extract frames in parallel.
  const frameUrls = await Promise.all(stamps.map((ts) => extractFrame(replicate, opts.videoUrl, ts)));
  const validFrames = frameUrls
    .map((url, i) => (url ? { url, i } : null))
    .filter((v): v is { url: string; i: number } => v !== null);

  if (validFrames.length === 0) {
    return {
      ok: false, faces: [], framesScanned: 0, unionBbox: null,
      source: "error", ms: Date.now() - t0, error: "frame_extract_failed_all",
    };
  }

  // 2) Run MediaPipe on each frame in parallel.
  const perFrameResults = await Promise.all(
    validFrames.map((f) => callMediaPipe(replicate, f.url, f.i, W, H)),
  );
  const allFaces = perFrameResults.flat();

  if (allFaces.length === 0) {
    return {
      ok: false, faces: [], framesScanned: validFrames.length, unionBbox: null,
      source: "error", ms: Date.now() - t0, error: "mediapipe_zero_faces",
    };
  }

  // 3) Cluster faces across frames by center distance (simple greedy).
  //    For the same person seen in 3 frames, we take the median center and
  //    the union bbox (+ small padding) — captures subject motion.
  const PAIR_RADIUS_PX = Math.max(40, Math.min(W, H) * 0.08);
  const clusters: MediaPipeFace[][] = [];
  for (const f of allFaces) {
    let placed = false;
    for (const c of clusters) {
      const rep = c[0];
      const dx = rep.center[0] - f.center[0];
      const dy = rep.center[1] - f.center[1];
      if (Math.hypot(dx, dy) <= PAIR_RADIUS_PX) { c.push(f); placed = true; break; }
    }
    if (!placed) clusters.push([f]);
  }

  // 4) Merge each cluster → one MediaPipeFace (union bbox + median center).
  const mergedFaces: MediaPipeFace[] = clusters.map((cluster) => {
    const xs1 = cluster.map((f) => f.bbox[0]);
    const ys1 = cluster.map((f) => f.bbox[1]);
    const xs2 = cluster.map((f) => f.bbox[2]);
    const ys2 = cluster.map((f) => f.bbox[3]);
    const ux1 = Math.min(...xs1);
    const uy1 = Math.min(...ys1);
    const ux2 = Math.max(...xs2);
    const uy2 = Math.max(...ys2);
    // 10% padding inside plate bounds.
    const padX = Math.round((ux2 - ux1) * 0.10);
    const padY = Math.round((uy2 - uy1) * 0.10);
    const x1 = Math.max(0, ux1 - padX);
    const y1 = Math.max(0, uy1 - padY);
    const x2 = Math.min(W, ux2 + padX);
    const y2 = Math.min(H, uy2 + padY);
    const cxs = [...cluster].map((f) => f.center[0]).sort((a, b) => a - b);
    const cys = [...cluster].map((f) => f.center[1]).sort((a, b) => a - b);
    const medianCx = cxs[Math.floor(cxs.length / 2)];
    const medianCy = cys[Math.floor(cys.length / 2)];
    const avgConf = cluster.reduce((s, f) => s + f.confidence, 0) / cluster.length;
    return {
      bbox: [x1, y1, x2, y2] as [number, number, number, number],
      center: [medianCx, medianCy] as [number, number],
      confidence: avgConf,
      frameSeen: cluster[0].frameSeen,
    };
  });

  // 5) Sort left-to-right (matches plate-face-detect slot order convention).
  mergedFaces.sort((a, b) => a.center[0] - b.center[0]);

  // 6) Global union of all merged faces (caller may use for crop hints).
  const ux1 = Math.min(...mergedFaces.map((f) => f.bbox[0]));
  const uy1 = Math.min(...mergedFaces.map((f) => f.bbox[1]));
  const ux2 = Math.max(...mergedFaces.map((f) => f.bbox[2]));
  const uy2 = Math.max(...mergedFaces.map((f) => f.bbox[3]));

  const ms = Date.now() - t0;
  console.log(
    `[mp-detect] mediapipe ok plate=${W}x${H} frames=${validFrames.length} ` +
    `raw=${allFaces.length} merged=${mergedFaces.length} ms=${ms}`,
  );
  return {
    ok: true,
    faces: mergedFaces,
    framesScanned: validFrames.length,
    unionBbox: [ux1, uy1, ux2, uy2],
    source: "mediapipe",
    ms,
  };
}

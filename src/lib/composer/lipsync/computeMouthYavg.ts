/**
 * v248 — Client-side Mouth-Band YAVG Probe
 * ------------------------------------------------------------------
 * After a Sync.so lipsync pass completes, we sample N evenly-spaced
 * frames from the muxed output video and compute the temporal
 * luminance variance in the MOUTH BAND (a horizontal strip around
 * the speaker's mouth landmark).
 *
 * A truly silent / "no-op" Sync.so output shows near-zero variance
 * in that band because the mouth pixels never change between frames.
 * A real lipsync produces yavg ≫ threshold.
 *
 * We keep this on the CLIENT (Canvas) because:
 *   - Deno edge has no ffmpeg / DOM
 *   - Server-side frame extraction is disabled (v129.23.2)
 *   - The rendered output URL is already public and cheap to sample
 *
 * The caller uploads the result to `report-lipsync-motion-probe`
 * which persists `noop_mouth_yavg` into `syncso_dispatch_log`.
 */

export interface MouthYavgInput {
  videoUrl: string;
  /** Normalized 0..1 mouth center within the video frame (row-major). */
  mouthCx: number;
  mouthCy: number;
  /** Band width/height as fraction of frame (defaults 0.28 × 0.12). */
  bandW?: number;
  bandH?: number;
  /** Number of frames to sample (default 12). */
  samples?: number;
  /** Optional AbortSignal. */
  signal?: AbortSignal;
}

export interface MouthYavgResult {
  yavg: number;            // mean per-pixel temporal variance in mouth band
  yavgNormalized: number;  // yavg / 255^2, clamped 0..1
  frames: number;
  sampledSec: number[];
  method: "canvas-mouth-band-v248";
}

/**
 * Extracts N frames from a video URL using an off-screen <video> +
 * <canvas>, then computes temporal variance in the mouth band.
 */
export async function computeMouthYavg(input: MouthYavgInput): Promise<MouthYavgResult> {
  const {
    videoUrl,
    mouthCx,
    mouthCy,
    bandW = 0.28,
    bandH = 0.12,
    samples = 12,
    signal,
  } = input;

  if (typeof document === "undefined") {
    throw new Error("computeMouthYavg: window/document required");
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      reject(new Error("yavg: video load failed"));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onErr);
    if (signal) signal.addEventListener("abort", () => reject(new Error("yavg: aborted")));
  });

  const dur = Number.isFinite(video.duration) ? video.duration : 0;
  if (!dur || dur < 0.2) throw new Error("yavg: invalid duration");

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("yavg: invalid dimensions");

  // Mouth-band rect in absolute pixels, clamped.
  const bw = Math.max(8, Math.round(w * bandW));
  const bh = Math.max(8, Math.round(h * bandH));
  const bx = Math.max(0, Math.min(w - bw, Math.round(mouthCx * w - bw / 2)));
  const by = Math.max(0, Math.min(h - bh, Math.round(mouthCy * h - bh / 2)));

  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("yavg: canvas 2d unsupported");

  const frames: Uint8ClampedArray[] = [];
  const sampledSec: number[] = [];
  const startPad = 0.05 * dur;
  const endPad = 0.05 * dur;
  const step = (dur - startPad - endPad) / Math.max(1, samples - 1);

  for (let i = 0; i < samples; i++) {
    if (signal?.aborted) throw new Error("yavg: aborted");
    const t = startPad + step * i;
    await seekTo(video, t);
    ctx.drawImage(video, bx, by, bw, bh, 0, 0, bw, bh);
    const img = ctx.getImageData(0, 0, bw, bh);
    frames.push(img.data);
    sampledSec.push(t);
  }

  // Compute per-pixel luminance variance across frames.
  const px = bw * bh;
  const means = new Float32Array(px);
  for (const data of frames) {
    for (let p = 0; p < px; p++) {
      const off = p * 4;
      // Rec.601 luma
      means[p] += 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    }
  }
  for (let p = 0; p < px; p++) means[p] /= frames.length;

  let sumVar = 0;
  for (const data of frames) {
    for (let p = 0; p < px; p++) {
      const off = p * 4;
      const y = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
      const d = y - means[p];
      sumVar += d * d;
    }
  }
  const yavg = sumVar / (frames.length * px); // mean per-pixel variance (luma²)
  const yavgNormalized = Math.max(0, Math.min(1, yavg / (255 * 255)));

  return {
    yavg,
    yavgNormalized,
    frames: frames.length,
    sampledSec,
    method: "canvas-mouth-band-v248",
  };
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("yavg: seek failed"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onErr);
    try {
      video.currentTime = t;
    } catch (e) {
      reject(e as Error);
    }
  });
}

/** Threshold below which the pass is considered a motion NOOP. */
export const MOUTH_YAVG_NOOP_THRESHOLD = 4.0; // ≈ 0.006% of 255²

export function isMouthYavgNoop(r: MouthYavgResult): boolean {
  return r.yavg < MOUTH_YAVG_NOOP_THRESHOLD;
}

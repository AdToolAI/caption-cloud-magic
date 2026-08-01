/**
 * mouth-motion-verdict — v344 Phase 1
 * ==========================================================================
 * Server-side, evidence-based answer to the ONLY question that matters for
 * lip-sync: "did the mouth actually move in the provider's output?"
 *
 * Background
 * ----------
 * Sync.so reports `COMPLETED` even when it returns an untouched (or merely
 * re-encoded) copy of the input clip. Every byte/etag heuristic we tried
 * (v128 sizeRatio, v150 tight band, v231 single-speaker band) either missed
 * real no-ops or hard-failed good passes. The measurement below looks at the
 * actual pixels instead of at file metadata, so it cannot be fooled by a
 * re-encode and cannot false-positive on a low-motion but genuinely animated
 * pass.
 *
 * Method
 * ------
 *  1. Sample N frames evenly across the *speech window* of the output clip.
 *  2. Decode each frame and crop the mouth band (derived from the preclip
 *     geometry we used for the dispatch — same rectangle, no guessing).
 *  3. Downsample the band to a fixed grid and compute the mean absolute
 *     luminance delta between consecutive samples.
 *  4. `score` = the strongest consecutive delta observed.
 *     score >= MOVED_MIN_SCORE  → `moved`
 *     score <  MOVED_MIN_SCORE  → `static`
 *
 * Measurement contract
 * --------------------
 * If frames cannot be obtained (extractor down, no token, timeout) the
 * verdict is `unknown` — never `static`. Callers must not present an unknown
 * pass as verified lip-sync; they may retry it or stop the scene cleanly.
 *
 * No ffmpeg in the edge runtime — frames come from the same Replicate
 * extractor `extract-video-frames` already uses in production.
 */

const MODEL_TAG = "v344-mouth-motion-verdict";
const REPLICATE_MODEL = "lucataco/ffmpeg-extract-frame";

/** Mean |ΔY| (0..255) inside the mouth band required to call a pass "moved". */
export const MOVED_MIN_SCORE = 1.6;

/** Sample grid the mouth band is resampled to before differencing. */
const GRID_W = 48;
const GRID_H = 32;

/** Default mouth band inside a face-centred preclip (normalised 0..1). */
const DEFAULT_MOUTH_RECT = { x: 0.24, y: 0.52, w: 0.52, h: 0.36 };

export interface MouthRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MouthMotionVerdictInput {
  /** Provider output clip to judge. */
  outputUrl: string;
  /** Start of the speech window inside the output clip, seconds. */
  windowStartSec?: number;
  /** End of the speech window inside the output clip, seconds. */
  windowEndSec?: number;
  /**
   * v346 — Real duration of the clip being judged (the preclip / provider
   * output). Sample timestamps are clamped inside it; asking the extractor
   * for a timestamp past the last frame returns nothing and silently
   * degraded the whole probe to `frames_0_of_N`.
   */
  clipDurationSec?: number;
  /** Normalised mouth rectangle inside the clip. Defaults to the face-preclip band. */
  mouthRect?: MouthRect | null;
  /** How many frames to sample. 4 keeps latency ~8-12s and is enough for a verdict. */
  sampleCount?: number;
  /** Overall budget. */
  timeoutMs?: number;
  /** Forensics only. */
  label?: string;
}


export type MotionVerdict = "moved" | "static" | "unknown";

export interface MouthMotionVerdictResult {
  verdict: MotionVerdict;
  /** Strongest consecutive mean |ΔY| inside the mouth band, 0..255. */
  score: number;
  /** All consecutive deltas, for forensics. */
  deltas: number[];
  /** Timestamps actually sampled. */
  timestamps: number[];
  framesDecoded: number;
  threshold: number;
  reason: string;
  method: string;
  latencyMs: number;
  /**
   * v346 — Per-frame extractor outcome. Without this a probe failure was
   * indistinguishable from a provider no-op in the logs.
   */
  frameErrors?: string[];
}


/**
 * Runtime secret compatibility. Lovable Cloud exposes the configured
 * credential as REPLICATE_API_KEY; older environments used
 * REPLICATE_API_TOKEN. Keep the alias so existing deployments remain valid.
 */
export function resolveReplicateCredential(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): string | null {
  return getEnv("REPLICATE_API_KEY") || getEnv("REPLICATE_API_TOKEN") || null;
}

/**
 * Measures mouth motion in a provider output clip.
 * Never throws — failures surface as `verdict: "unknown"`.
 */
export async function judgeMouthMotion(
  input: MouthMotionVerdictInput,
): Promise<MouthMotionVerdictResult> {
  const t0 = Date.now();
  const timestamps: number[] = [];
  const base = {
    deltas: [] as number[],
    timestamps,
    framesDecoded: 0,
    threshold: MOVED_MIN_SCORE,
    method: MODEL_TAG,
  };

  try {
    const token = resolveReplicateCredential();
    if (!token) {
      return {
        ...base,
        verdict: "unknown",
        score: 0,
        reason: "motion_probe_unavailable:no_replicate_api_key_or_token",
        latencyMs: Date.now() - t0,
      };
    }
    if (!input.outputUrl || !/^https?:\/\//.test(input.outputUrl)) {
      return {
        ...base,
        verdict: "unknown",
        score: 0,
        reason: "motion_probe_unavailable:invalid_output_url",
        latencyMs: Date.now() - t0,
      };
    }

    const samples = clampInt(input.sampleCount ?? 4, 3, 8);
    const budgetMs = clampInt(input.timeoutMs ?? 45_000, 10_000, 120_000);

    // Sampling window: stay inside the speech portion, away from the very
    // first/last frame (encoders often duplicate those).
    const rawStart = Number(input.windowStartSec);
    const rawEnd = Number(input.windowEndSec);
    let start = Number.isFinite(rawStart) && rawStart >= 0 ? rawStart : 0;
    let end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 2.0;
    // Windows are provided relative to the scene; a preclip output starts at 0.
    if (end - start < 0.6) end = start + 0.6;

    // v346 — never sample past the end of the actual clip. A timestamp
    // beyond the last frame makes the extractor return nothing, which the
    // old code reported as `frames_0_of_4` — indistinguishable from an
    // outage and enough to stall the whole scene.
    const clipDur = Number(input.clipDurationSec);
    if (Number.isFinite(clipDur) && clipDur > 0.2) {
      const hardEnd = Math.max(0.1, clipDur - 0.05);
      if (end > hardEnd) end = hardEnd;
      if (start >= end) start = Math.max(0.02, end - 0.5);
    }

    const inset = Math.min(0.18, Math.max(0, (end - start) * 0.12));
    start += inset;
    end -= inset;
    if (end <= start) end = start + 0.1;

    for (let i = 0; i < samples; i++) {
      const t = start + ((end - start) * i) / (samples - 1);
      timestamps.push(Math.max(0.02, Number(t.toFixed(3))));
    }

    const deadline = Date.now() + budgetMs;
    const frameResults = await Promise.all(
      timestamps.map((t) => extractFrame(token, input.outputUrl, t, deadline)),
    );
    const frameErrors = frameResults
      .map((r, i) => (r.url ? null : `t=${timestamps[i]}:${r.error ?? "unknown"}`))
      .filter((e): e is string => !!e);
    const usable = frameResults
      .map((r) => r.url)
      .filter((u): u is string => !!u);
    if (frameErrors.length) {
      console.warn(
        `[mouth-motion-verdict] ${input.label ?? ""} frame extraction issues (${usable.length}/${samples} ok): ${frameErrors.join(" | ")}`,
      );
    }
    if (usable.length < 2) {
      return {
        ...base,
        verdict: "unknown",
        score: 0,
        frameErrors,
        reason: `motion_probe_unavailable:frames_${usable.length}_of_${samples}`,
        latencyMs: Date.now() - t0,
      };
    }


    const rect = normaliseRect(input.mouthRect) ?? DEFAULT_MOUTH_RECT;
    const grids = await Promise.all(usable.map((u) => frameToGrid(u, rect)));
    const decoded = grids.filter((g): g is Float64Array => !!g);
    if (decoded.length < 2) {
      return {
        ...base,
        verdict: "unknown",
        score: 0,
        framesDecoded: decoded.length,
        reason: `motion_probe_unavailable:decoded_${decoded.length}`,
        latencyMs: Date.now() - t0,
      };
    }

    const deltas: number[] = [];
    for (let i = 1; i < decoded.length; i++) {
      deltas.push(meanAbsDelta(decoded[i - 1], decoded[i]));
    }
    const score = deltas.length ? Math.max(...deltas) : 0;
    const verdict: MotionVerdict = score >= MOVED_MIN_SCORE ? "moved" : "static";

    return {
      deltas: deltas.map((d) => Number(d.toFixed(4))),
      timestamps,
      framesDecoded: decoded.length,
      threshold: MOVED_MIN_SCORE,
      method: MODEL_TAG,
      verdict,
      score: Number(score.toFixed(4)),
      reason: verdict === "moved"
        ? "mouth_band_motion_detected"
        : "mouth_band_static_provider_returned_noop",
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ...base,
      verdict: "unknown",
      score: 0,
      reason: `motion_probe_unavailable:${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - t0,
    };
  }
}

/**
 * Derives the mouth rectangle from the dispatch geometry we already stored on
 * the pass. Keeping this in one place guarantees the probe measures exactly
 * the region we cropped for the provider.
 */
export function mouthRectFromPass(pass: Record<string, unknown> | null | undefined): MouthRect | null {
  if (!pass) return null;

  // Explicit mouth box (normalised) wins when present.
  const explicit = normaliseRect((pass as { mouth_rect?: MouthRect }).mouth_rect);
  if (explicit) return explicit;

  const crop = (pass as { preclip_crop?: Record<string, unknown> }).preclip_crop;
  if (crop && Number.isFinite(Number(crop.size))) {
    const size = Number(crop.size);
    const mouth = (pass as { mouth_center?: [number, number] }).mouth_center;
    const cropX = Number(crop.x ?? NaN);
    const cropY = Number(crop.y ?? NaN);
    if (
      Array.isArray(mouth) && mouth.length === 2 &&
      Number.isFinite(cropX) && Number.isFinite(cropY) && size > 0
    ) {
      // Mouth centre expressed inside the crop, then a band around it.
      const cx = (Number(mouth[0]) - cropX) / size;
      const cy = (Number(mouth[1]) - cropY) / size;
      if (cx > 0 && cx < 1 && cy > 0 && cy < 1) {
        return normaliseRect({ x: cx - 0.22, y: cy - 0.15, w: 0.44, h: 0.30 });
      }
    }
  }
  return null;
}

// ────────────────────────── internals ──────────────────────────

export interface FrameExtractResult {
  url: string | null;
  /** Human-readable failure cause; null on success. */
  error: string | null;
}

/**
 * v346 — Normalises every shape the extractor can return.
 * Replicate has returned a bare string, an array of strings and a
 * FileOutput-like object with a `url` getter/method across SDK versions;
 * the previous implementation silently produced `null` for two of them.
 */
export function normaliseFrameOutput(out: unknown): string | null {
  if (!out) return null;
  let url = "";
  if (typeof out === "string") {
    url = out;
  } else if (Array.isArray(out)) {
    const first = out.find((v) => !!v);
    url = typeof first === "string" ? first : normaliseFrameOutput(first) ?? "";
  } else if (typeof out === "object") {
    // deno-lint-ignore no-explicit-any
    const o = out as any;
    const candidate = typeof o.url === "function" ? o.url() : o.url ?? o.output ?? o.href;
    url = typeof candidate === "string" ? candidate : String(candidate ?? "");
  }
  return /^https?:\/\//.test(url) ? url : null;
}

/** Cached model version id so we don't resolve it per frame. */
let cachedModelVersion: string | null = null;

async function resolveModelVersion(token: string, signal: AbortSignal): Promise<string | null> {
  if (cachedModelVersion) return cachedModelVersion;
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`model_lookup_${res.status}:${body.slice(0, 120)}`);
  }
  const json = await res.json();
  const version = String(json?.latest_version?.id ?? "");
  if (!version) throw new Error("model_lookup_no_version");
  cachedModelVersion = version;
  return version;
}

/**
 * Extracts a single frame via Replicate's prediction API.
 * Mirrors the production path used by `extract-video-frames`, but surfaces
 * the provider status/body instead of collapsing every failure to `null`.
 */
async function extractFrame(
  token: string,
  videoUrl: string,
  timestamp: number,
  deadline: number,
): Promise<FrameExtractResult> {
  const remaining = deadline - Date.now();
  if (remaining <= 2_000) return { url: null, error: "budget_exhausted" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const version = await resolveModelVersion(token, controller.signal);
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=55",
      },
      body: JSON.stringify({
        version,
        input: { video: videoUrl, timestamp },
      }),
      signal: controller.signal,
    });
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => "");
      return { url: null, error: `create_${createRes.status}:${body.slice(0, 160)}` };
    }
    let prediction = await createRes.json();

    // `Prefer: wait` usually returns a terminal prediction. Poll otherwise.
    while (
      prediction?.status &&
      !["succeeded", "failed", "canceled"].includes(String(prediction.status)) &&
      Date.now() < deadline - 1_000
    ) {
      await new Promise((r) => setTimeout(r, 1_200));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!pollRes.ok) {
        return { url: null, error: `poll_${pollRes.status}` };
      }
      prediction = await pollRes.json();
    }

    if (String(prediction?.status) !== "succeeded") {
      const detail = String(prediction?.error ?? prediction?.status ?? "no_status");
      return { url: null, error: `prediction_${String(prediction?.status ?? "pending")}:${detail.slice(0, 120)}` };
    }

    const url = normaliseFrameOutput(prediction?.output);
    return url ? { url, error: null } : { url: null, error: "unparsable_output" };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError"
      ? "timeout"
      : (e as Error)?.message ?? String(e);
    return { url: null, error: msg.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}


/** Fetches a frame, crops the mouth band and resamples it to a luminance grid. */
async function frameToGrid(frameUrl: string, rect: MouthRect): Promise<Float64Array | null> {
  try {
    const res = await fetch(frameUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { Image } = await import("npm:imagescript@1.3.0");
    // deno-lint-ignore no-explicit-any
    const img: any = await (Image as any).decode(bytes);
    const w = Number(img.width);
    const h = Number(img.height);
    if (!(w > 1 && h > 1)) return null;

    const x0 = Math.max(0, Math.floor(rect.x * w));
    const y0 = Math.max(0, Math.floor(rect.y * h));
    const bw = Math.max(2, Math.min(w - x0, Math.floor(rect.w * w)));
    const bh = Math.max(2, Math.min(h - y0, Math.floor(rect.h * h)));

    const grid = new Float64Array(GRID_W * GRID_H);
    for (let gy = 0; gy < GRID_H; gy++) {
      const sy = Math.min(h - 1, y0 + Math.floor((gy + 0.5) * bh / GRID_H));
      for (let gx = 0; gx < GRID_W; gx++) {
        const sx = Math.min(w - 1, x0 + Math.floor((gx + 0.5) * bw / GRID_W));
        // imagescript getPixelAt is 1-indexed and returns 0xRRGGBBAA.
        const px = img.getPixelAt(sx + 1, sy + 1) >>> 0;
        const r = (px >>> 24) & 0xff;
        const g = (px >>> 16) & 0xff;
        const b = (px >>> 8) & 0xff;
        grid[gy * GRID_W + gx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
    }
    return grid;
  } catch {
    return null;
  }
}

function meanAbsDelta(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

function normaliseRect(rect: unknown): MouthRect | null {
  if (!rect || typeof rect !== "object") return null;
  const r = rect as Record<string, unknown>;
  let x = Number(r.x);
  let y = Number(r.y);
  let w = Number(r.w ?? r.width);
  let h = Number(r.h ?? r.height);
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  if (w <= 0 || h <= 0) return null;
  x = Math.min(0.98, Math.max(0, x));
  y = Math.min(0.98, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0.05, w));
  h = Math.min(1 - y, Math.max(0.05, h));
  return { x, y, w, h };
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

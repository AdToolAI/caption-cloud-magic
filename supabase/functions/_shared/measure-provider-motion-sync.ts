/**
 * FA-4 v404 — Server-Side Synchronous Motion Measurement (MEASUREMENT OWNER)
 * ---------------------------------------------------------------------------
 * The ONE server-side owner of the mouth-band motion metric.
 *
 * Contract (frozen, see docs / plan "FA-4 v404 FIX CONTRACT"):
 *   - Renders N=6 stills of a video through the deployed Remotion Lambda
 *     `type:"still"` path (AWS-only frame primitive; Replicate is banned).
 *   - Decodes the JPEGs with jpeg-js@0.4.4 (calibration parity).
 *   - Computes Rec.601 luma temporal per-pixel variance inside the frozen ROI.
 *   - Returns measurement data ONLY.
 *
 * This helper MUST NOT:
 *   - patch composer_scenes / dialog_shots
 *   - write the Ledger
 *   - start a retry / replacement attempt
 *   - dispatch a mux
 *   - trigger a refund
 *
 * It only measures. The verdict is produced by the PURE
 * `classifyMotionProbe()` and applied by the G3.2.2 RPC.
 *
 * It also MUST NOT run under the per-scene dialog lock (§5 of the contract):
 * every Lambda invoke / download / decode happens after the lock is released.
 */

import { AwsClient } from "npm:aws4fetch@1.0.18";
import jpeg from "npm:jpeg-js@0.4.4";
import { getLambdaFunctionName, AWS_REGION } from "./aws-lambda.ts";
// V434 — additive telemetry helpers. Neither changes the frozen v404 verdict.
import {
  buildMadRatioTelemetry,
  computeMadSummary,
  type MadRatioTelemetry,
  type MadSummary,
} from "./v434-mad-ratio.ts";
import {
  deriveMouthRoi,
  type DerivedMouthRoi,
  type MouthRoiNormalized,
  type PreclipRoiGeometry,
} from "./v434-motion-roi.ts";
// V456 Gate 2 — validated, anchor-coherent geometry contract.
import type { V456RoiContract } from "./v456-roi-contract.ts";

/** Frozen production constants — no rounding, no heuristics. */
export const MOTION_SAMPLE_COUNT = 6;
export const MOTION_START_PADDING = 0.05;
export const MOTION_END_PADDING = 0.05;
export const MOTION_FPS = 30;
export const MOTION_STILL_COMPOSITION = "DialogStitchVideo";
export const MOTION_REMOTION_VERSION = "4.0.462";
export const MOTION_JPEG_QUALITY = 85;
export const MOTION_STILL_CONCURRENCY = 2;
export const MEASUREMENT_DEADLINE_MS = 27000;

/** Frozen SOURCE-space ROI (mouth band). */
export const MOTION_ROI = { centerX: 0.5, centerY: 0.6, width: 0.28, height: 0.12 } as const;

export interface MotionMetricValue {
  mean: number;
  peak: number;
  frames: number;
  method: string;
  roi: { bx: number; by: number; bw: number; bh: number };
  stillWidth: number;
  stillHeight: number;
  /** V434 telemetry — consecutive-frame MAD inside the geometry-coupled band. */
  mad?: MadSummary | null;
  /**
   * V456 — the FROZEN v404 band measured on the very same stills. Kept as
   * regression evidence ("legacy ROI → cheek → noop") whenever the geometry
   * ROI is the authority. Never used for a verdict.
   */
  legacy_roi_metric?: { mean: number; peak: number; roi: { bx: number; by: number; bw: number; bh: number } } | null;
}

export type MeasurementStatus = "measured" | "unmeasurable";

/**
 * v404 P1-C — remaining wall-clock budget of the WHOLE measurement run,
 * handed to every network operation. `signal` is the run-scoped root signal.
 */
export interface MeasurementBudget {
  remainingMs: number;
  signal: AbortSignal;
}

/** PURE — remaining budget, never negative-by-accident. */
export function remainingBudgetMs(nowMs: number, absoluteDeadlineMs: number): number {
  const rest = absoluteDeadlineMs - nowMs;
  return Number.isFinite(rest) ? rest : 0;
}

export type RenderStillFn = (
  videoUrl: string,
  totalSec: number,
  frame: number,
  budget: MeasurementBudget,
) => Promise<Uint8Array>;

export interface MeasureProviderMotionSyncArgs {
  preclipUrl: string;
  providerOutputUrl: string;
  /** Duration in seconds of BOTH assets (same turn window). */
  durationSeconds: number;
  /** Optional source dimension hints; probed when absent. */
  preclipDims?: { width: number; height: number } | null;
  providerDims?: { width: number; height: number } | null;
  /** Injected for tests. Returns raw JPEG bytes of one still. */
  renderStill?: RenderStillFn;
  /** Injected for tests. Returns source dimensions of a video. */
  probeDims?: (url: string) => Promise<{ width: number; height: number } | null>;
  /** Injected for tests. */
  now?: () => number;
  deadlineMs?: number;
  sampleCount?: number;
  /**
   * V434 Step 4 — pre-clip geometry (`preclip_anchor` / `preclip_face_share` /
   * `preclip_crop.size`). When it yields a geometry-coupled ROI, the mouth band
   * is measured where the mouth actually is; otherwise the frozen v404 ROI is
   * used unchanged.
   */
  preclipGeometry?: PreclipRoiGeometry | null;
  /**
   * V434 — when false (default) the frozen v404 ROI drives the AUTHORITATIVE
   * metric and the geometry ROI is reported as telemetry only.
   */
  useGeometryRoiForVerdict?: boolean;
  /**
   * V456 Gate 2 — the validated ROI contract. When supplied it is the ONLY
   * authority on the measurement band:
   *   `authoritative` → the geometry mouth ROI drives the verdict and the
   *                     frozen v404 band is measured as telemetry.
   *   `unresolved`    → NOTHING is measured; the caller receives
   *                     `mouth_roi_unresolved` and must treat the pass as
   *                     `motion_unverified` (never as a NOOP).
   */
  roiContract?: V456RoiContract | null;
}


export interface MeasureProviderMotionSyncResult {
  preclip_metric: MotionMetricValue | null;
  provider_metric: MotionMetricValue | null;
  deltaMean: number | null;
  deltaPeak: number | null;
  measurement_status: MeasurementStatus;
  reason: string;
  /** V456 — which band produced the authoritative metric. */
  v456?: {
    roi_authority: "geometry" | "legacy_frozen";
    contract_status: "authoritative" | "unresolved" | "absent";
    contract_reason: string;
    failed_check: string | null;
  };
  /** V434 telemetry — never authoritative. */
  v434?: {
    roi: DerivedMouthRoi;
    roi_applied_to_verdict: boolean;
    preclip_mad: MadSummary | null;
    provider_mad: MadSummary | null;
    mad_ratio: MadRatioTelemetry;
  };
}

/**
 * Per-asset SOURCE→STILL transform (frozen proof: DialogStitchVideo renders the
 * master video with `object-fit: cover` on the 1280×720 still canvas).
 * Integerization is identical to the calibration harness; end-exclusive box.
 */
export function stillRoiForSource(
  sourceWidth: number,
  sourceHeight: number,
  stillWidth: number,
  stillHeight: number,
  /** V434 — optional geometry-coupled band. Defaults to the frozen v404 ROI. */
  roi: MouthRoiNormalized = MOTION_ROI,
): { bx: number; by: number; bw: number; bh: number } {
  const s = Math.max(stillWidth / sourceWidth, stillHeight / sourceHeight);
  const dx = (stillWidth - sourceWidth * s) / 2;
  const dy = (stillHeight - sourceHeight * s) / 2;
  const cxStill = (roi.centerX * sourceWidth * s + dx) / stillWidth;
  const cyStill = (roi.centerY * sourceHeight * s + dy) / stillHeight;
  const wStill = (roi.width * sourceWidth * s) / stillWidth;
  const hStill = (roi.height * sourceHeight * s) / stillHeight;

  const bw = Math.max(8, Math.round(stillWidth * wStill));
  const bh = Math.max(8, Math.round(stillHeight * hStill));
  const bx = Math.min(Math.max(Math.round(cxStill * stillWidth - bw / 2), 0), stillWidth - bw);
  const by = Math.min(Math.max(Math.round(cyStill * stillHeight - bh / 2), 0), stillHeight - bh);
  return { bx, by, bw, bh };
}

/** Frozen sample timestamps: 5 % start / 5 % end padding, N evenly spaced. */
export function motionSampleFrames(durationSeconds: number, n = MOTION_SAMPLE_COUNT): number[] {
  const start = MOTION_START_PADDING * durationSeconds;
  const end = (1 - MOTION_END_PADDING) * durationSeconds;
  const step = n > 1 ? (end - start) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => Math.round((start + step * i) * MOTION_FPS));
}

export interface DecodedFrame {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[];
}

/**
 * Frozen metric (PURE):
 *   Y      = 0.299R + 0.587G + 0.114B
 *   meanY  = SUM_frames(Y) / N               (per pixel)
 *   d2     = (Y - meanY)²
 *   mean   = SUM(d2) / (N * pixelCount)
 *   peak   = MAX(d2)                          (TELEMETRY ONLY)
 */
export function computeMotionMetric(
  frames: DecodedFrame[],
  roi: { bx: number; by: number; bw: number; bh: number },
): { mean: number; peak: number } {
  const { bx, by, bw, bh } = roi;
  const px = bw * bh;
  const lum: Float64Array[] = frames.map((img) => {
    const arr = new Float64Array(px);
    let k = 0;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const off = (y * img.width + x) * 4;
        arr[k++] = 0.299 * img.data[off] + 0.587 * img.data[off + 1] + 0.114 * img.data[off + 2];
      }
    }
    return arr;
  });

  const meanY = new Float64Array(px);
  for (const f of lum) for (let p = 0; p < px; p++) meanY[p] += f[p];
  for (let p = 0; p < px; p++) meanY[p] /= lum.length;

  let sum = 0;
  let peak = 0;
  for (const f of lum) {
    for (let p = 0; p < px; p++) {
      const d = f[p] - meanY[p];
      const d2 = d * d;
      sum += d2;
      if (d2 > peak) peak = d2;
    }
  }
  return { mean: sum / (lum.length * px), peak };
}

/** Bounded worker pool — never an unbounded Promise.all flood. */
async function pool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/** Production still primitive: Remotion Lambda `type:"still"` (AWS-only). */
function defaultRenderStill(): RenderStillFn {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
  const serveUrl = Deno.env.get("REMOTION_SERVE_URL") ?? "";
  if (!accessKeyId || !secretAccessKey) throw new Error("aws_credentials_missing");
  if (!serveUrl) throw new Error("remotion_serve_url_missing");
  const aws = new AwsClient({ accessKeyId, secretAccessKey, sessionToken, region: AWS_REGION });
  const lambdaUrl =
    `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${getLambdaFunctionName()}/invocations`;

  return async (
    videoUrl: string,
    totalSec: number,
    frame: number,
    budget: MeasurementBudget,
  ): Promise<Uint8Array> => {
    // v404 P1-C — every timeout below is capped by the REMAINING global budget,
    // never by a fresh full-length timeout.
    if (budget.remainingMs <= 0) throw new Error("measurement_deadline_exceeded");
    const invokeBudget = Math.max(1, Math.floor(budget.remainingMs));
    const payload = {
      type: "still",
      serveUrl,
      composition: MOTION_STILL_COMPOSITION,
      inputProps: {
        type: "payload",
        payload: JSON.stringify({
          masterVideoUrl: videoUrl,
          masterAudioUrl: "",
          totalSec,
          shots: [],
        }),
      },
      version: MOTION_REMOTION_VERSION,
      imageFormat: "jpeg",
      jpegQuality: MOTION_JPEG_QUALITY,
      frame,
      privacy: "public",
      attempt: 1,
      logLevel: "warn",
      outName: `fa4v404-${crypto.randomUUID()}.jpeg`,
      timeoutInMilliseconds: invokeBudget,
      chromiumOptions: {},
      scale: 1,
      downloadBehavior: { type: "play-in-browser", fileName: null },
      forceHeight: null,
      forceWidth: null,
      bucketName: null,
      offthreadVideoCacheSizeInBytes: null,
      deleteAfter: null,
      envVariables: {},
      forcePathStyle: false,
    };
    const res = await aws.fetch(lambdaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: linkedSignal(budget, invokeBudget),
    });
    if (!res.ok) throw new Error(`lambda_http_${res.status}`);
    const parsed = JSON.parse(await res.text());
    const output: string | undefined = parsed?.output ?? parsed?.url;
    if (!output || typeof output !== "string") throw new Error("lambda_no_output");
    const dl = await fetch(output, { signal: linkedSignal(budget, invokeBudget) });
    if (!dl.ok) throw new Error(`still_download_${dl.status}`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.byteLength < 1024) throw new Error("still_too_small");
    return bytes;
  };
}

/**
 * Combines the run-scoped root signal with the remaining-budget timeout, so a
 * single request can never outlive the global measurement deadline.
 */
function linkedSignal(budget: MeasurementBudget, remainingMs: number): AbortSignal {
  const anySignal = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  const timeoutSignal = AbortSignal.timeout(Math.max(1, remainingMs));
  if (typeof anySignal === "function") return anySignal([budget.signal, timeoutSignal]);
  const c = new AbortController();
  const abort = () => c.abort(new Error("measurement_deadline_exceeded"));
  if (budget.signal.aborted || timeoutSignal.aborted) abort();
  budget.signal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return c.signal;
}



function unmeasurable(reason: string): MeasureProviderMotionSyncResult {
  return {
    preclip_metric: null,
    provider_metric: null,
    deltaMean: null,
    deltaPeak: null,
    measurement_status: "unmeasurable",
    reason,
  };
}

/**
 * Measures the frozen mouth-band motion metric of the exact provider input
 * preclip and the exact provider output. Never throws — every failure is
 * reported as `measurement_status: "unmeasurable"` (fail-closed upstream).
 */
export async function measureProviderMotionSync(
  args: MeasureProviderMotionSyncArgs,
): Promise<MeasureProviderMotionSyncResult> {
  const now = args.now ?? (() => Date.now());
  const deadlineMs = args.deadlineMs ?? MEASUREMENT_DEADLINE_MS;
  const n = args.sampleCount ?? MOTION_SAMPLE_COUNT;
  const t0 = now();
  const absoluteDeadline = t0 + deadlineMs;
  const remaining = () => remainingBudgetMs(now(), absoluteDeadline);

  // v404 P1-C — ONE root controller for the ENTIRE measurement run. Every
  // network operation (Lambda invoke, still download, dimension probe)
  // inherits this signal, so the wall clock — not per-request timeouts —
  // bounds the whole run at `deadlineMs`.
  const rootController = new AbortController();
  const rootTimer = setTimeout(() => {
    try {
      rootController.abort(new Error("measurement_deadline_exceeded"));
    } catch { /* already aborted */ }
  }, Math.max(0, deadlineMs));

  try {
    if (!args.preclipUrl) return unmeasurable("motion_probe_indeterminate:preclip_url_missing");
    if (!args.providerOutputUrl) {
      return unmeasurable("motion_probe_indeterminate:provider_url_missing");
    }
    const duration = Number(args.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      return unmeasurable("motion_probe_indeterminate:duration_unknown");
    }

    let renderStill: RenderStillFn;
    try {
      renderStill = args.renderStill ?? defaultRenderStill();
    } catch (e) {
      return unmeasurable(`motion_probe_indeterminate:${(e as Error).message}`);
    }

    const probeDims = args.probeDims ??
      (async (url: string) => {
        const { probeMp4Dims } = await import("./twoshot-face-map.ts");
        return await probeMp4Dims(url).catch(() => null);
      });

    const frames = motionSampleFrames(duration, n);

    /** Fail-closed budget gate — throws the frozen deadline error. */
    const budget = (): MeasurementBudget => {
      const remainingMs = remaining();
      if (remainingMs <= 0) throw new Error("measurement_deadline_exceeded");
      return { remainingMs, signal: rootController.signal };
    };

    // V434 Step 4 — derived ONCE per run so both assets share one band.
    const derivedRoi = deriveMouthRoi(args.preclipGeometry ?? null);
    // ── V456 Gate 2 — the contract, when present, owns the band ────────────
    const contract = args.roiContract ?? null;
    if (contract && contract.status === "unresolved") {
      return unmeasurable(contract.reason);
    }
    const applyGeometryRoi = contract
      ? contract.status === "authoritative"
      : (args.useGeometryRoiForVerdict === true && derivedRoi.source === "geometry");
    const verdictRoi: MouthRoiNormalized = applyGeometryRoi
      ? (contract?.roi ?? derivedRoi.roi)
      : MOTION_ROI;

    const measureOne = async (
      url: string,
      dimHint: { width: number; height: number } | null | undefined,
    ): Promise<MotionMetricValue> => {
      const dims = dimHint && dimHint.width > 0 && dimHint.height > 0
        ? dimHint
        // The dimension probe is budgeted too — it can never outlive the root
        // deadline even though it has no own abort signal.
        : await withBudget(budget(), probeDims(url));
      if (!dims || !(dims.width > 0) || !(dims.height > 0)) throw new Error("dimensions_unknown");

      const stills = await pool(
        // `budget()` is evaluated per task, i.e. AFTER the previous tasks have
        // consumed wall clock — no request ever gets the full deadline twice.
        frames.map((f) => async () => await renderStill(url, duration, f, budget())),
        MOTION_STILL_CONCURRENCY,
      );
      if (remaining() <= 0) throw new Error("measurement_deadline_exceeded");
      const decoded: DecodedFrame[] = stills.map((bytes) =>
        jpeg.decode(bytes, { useTArray: true }) as DecodedFrame
      );
      if (decoded.length < n) throw new Error("insufficient_frames");
      const stillWidth = decoded[0].width;
      const stillHeight = decoded[0].height;
      if (!(stillWidth > 0) || !(stillHeight > 0)) throw new Error("still_dimensions_invalid");
      const roi = stillRoiForSource(
        dims.width,
        dims.height,
        stillWidth,
        stillHeight,
        verdictRoi,
      );
      if (!(roi.bw > 0) || !(roi.bh > 0) || roi.bx < 0 || roi.by < 0) throw new Error("roi_invalid");
      const { mean, peak } = computeMotionMetric(decoded, roi);
      if (!Number.isFinite(mean) || !Number.isFinite(peak)) throw new Error("metric_not_finite");
      // V434 Step 3/4 — the scale-free MAD is computed on the SAME already
      // decoded stills inside the GEOMETRY-coupled band: zero extra Lambda
      // invokes, zero extra downloads, zero effect on the v404 verdict.
      const madRoi = stillRoiForSource(
        dims.width,
        dims.height,
        stillWidth,
        stillHeight,
        derivedRoi.roi,
      );
      const mad = madRoi.bw > 0 && madRoi.bh > 0 ? computeMadSummary(decoded, madRoi) : null;
      // V456 — keep the frozen v404 band as regression evidence. It is measured
      // on the SAME decoded stills (no extra Lambda invoke) and is telemetry.
      let legacyRoiMetric: MotionMetricValue["legacy_roi_metric"] = null;
      if (applyGeometryRoi) {
        const legacyBox = stillRoiForSource(dims.width, dims.height, stillWidth, stillHeight, MOTION_ROI);
        if (legacyBox.bw > 0 && legacyBox.bh > 0) {
          const legacy = computeMotionMetric(decoded, legacyBox);
          legacyRoiMetric = { mean: legacy.mean, peak: legacy.peak, roi: legacyBox };
        }
      }
      return {
        mean,
        peak,
        frames: decoded.length,
        method: applyGeometryRoi
          ? "server-remotion-still-mouthband-v456-geometry"
          : "server-remotion-still-mouthband-v404",
        roi,
        stillWidth,
        stillHeight,
        mad,
        legacy_roi_metric: legacyRoiMetric,
      };
    };

    let preclip: MotionMetricValue;
    let provider: MotionMetricValue;
    try {
      preclip = await measureOne(args.preclipUrl, args.preclipDims);
    } catch (e) {
      return deadlineAwareUnmeasurable(e, "preclip");
    }
    try {
      provider = await measureOne(args.providerOutputUrl, args.providerDims);
    } catch (e) {
      return deadlineAwareUnmeasurable(e, "provider");
    }
    if (remaining() <= 0) {
      return unmeasurable("motion_probe_indeterminate:measurement_deadline_exceeded");
    }

    return {
      preclip_metric: preclip,
      provider_metric: provider,
      deltaMean: provider.mean - preclip.mean,
      deltaPeak: provider.peak - preclip.peak,
      measurement_status: "measured",
      reason: "measured",
      v456: {
        roi_authority: applyGeometryRoi ? "geometry" : "legacy_frozen",
        contract_status: contract ? contract.status : "absent",
        contract_reason: contract ? contract.reason : "contract_absent",
        failed_check: contract?.failedCheck ?? null,
      },
      // V434 — reported alongside, never instead of, the frozen v404 verdict.
      v434: {
        roi: derivedRoi,
        roi_applied_to_verdict: applyGeometryRoi,
        preclip_mad: preclip.mad ?? null,
        provider_mad: provider.mad ?? null,
        mad_ratio: buildMadRatioTelemetry(preclip.mad ?? null, provider.mad ?? null),
      },
    };

  } finally {
    clearTimeout(rootTimer);
    // Release anything still hanging on the root signal.
    try {
      if (!rootController.signal.aborted) {
        rootController.abort(new Error("measurement_finished"));
      }
    } catch { /* noop */ }
  }
}

/**
 * Any deadline breach — wherever it surfaced — collapses to the single frozen
 * reason. Everything else keeps its stage-prefixed diagnostic reason.
 */
export function deadlineAwareUnmeasurable(
  e: unknown,
  stage: "preclip" | "provider",
): MeasureProviderMotionSyncResult {
  const msg = (e as Error)?.message ?? String(e);
  if (isDeadlineError(msg)) {
    return unmeasurable("motion_probe_indeterminate:measurement_deadline_exceeded");
  }
  return unmeasurable(`motion_probe_indeterminate:${stage}_${msg}`);
}

/** PURE — recognises every shape of "the global wall clock ran out". */
export function isDeadlineError(message: string): boolean {
  return message.includes("measurement_deadline_exceeded") ||
    message.includes("TimeoutError") ||
    message.includes("AbortError") ||
    message.includes("aborted");
}

/** Races a promise without its own abort support against the remaining budget. */
function withBudget<T>(b: MeasurementBudget, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = () => reject(new Error("measurement_deadline_exceeded"));
    const t = setTimeout(fail, Math.max(0, b.remainingMs));
    const onAbort = () => {
      clearTimeout(t);
      fail();
    };
    b.signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(t);
        b.signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        b.signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}


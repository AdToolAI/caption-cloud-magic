/**
 * plate-face-track.ts (V452) — bounded, identity-safe face tracking on the
 * FINAL plate video of the current run.
 * ---------------------------------------------------------------------------
 * Primitives (unchanged production stack, no new provider):
 *   - Frames: Remotion Lambda `type:"still"` (AWS-only; Replicate is banned in
 *     the lip-sync path, see v347).
 *   - Faces:  AWS Rekognition `DetectFaces` on the still bytes.
 *
 * IDENTITY IS STATIC. This module never re-identifies and never switches
 * speakers. It starts from the assignment-locked face box and, per sample,
 * accepts ONLY the detection that is provably the continuation of that same
 * face (IoU / center-distance gate + sibling-face veto). Anything else becomes
 * a `null` sample, which the pure path builder fills by bounded interpolation
 * — or, if nothing is provable, the caller falls back to the static crop.
 */

import { AwsClient } from "npm:aws4fetch@1.0.18";
import jpeg from "npm:jpeg-js@0.4.4";
import { AWS_REGION, getLambdaFunctionName } from "./aws-lambda.ts";
import {
  type Box,
  boxIoU,
  TRACK_SAMPLE_COUNT,
  type TrackSample,
  trackSampleTimes,
} from "./dynamic-camera-path.ts";

const STILL_COMPOSITION = "DialogStitchVideo";
const STILL_REMOTION_VERSION = "4.0.462";
const STILL_JPEG_QUALITY = 85;
const STILL_FPS = 30;
const REK_MIN_CONFIDENCE = 80;

/** Minimum IoU with the reference box for a detection to count as "same face". */
export const TRACK_MIN_IOU = 0.15;
/** Alternative acceptance: center distance below this fraction of ref side. */
export const TRACK_MAX_CENTER_DRIFT = 0.7;

/** Two candidates this similar are ambiguous — we refuse rather than switch. */
export const TRACK_AMBIGUITY_DIST_RATIO = 1.15;
export const TRACK_AMBIGUITY_IOU_DELTA = 0.05;
/** V456 — mouth-distance margin (× reference face side) that resolves a tie. */
export const TRACK_MOUTH_TIEBREAK_MARGIN = 0.25;

export interface TrackedSampleDebug {
  t: number;
  accepted: boolean;
  reason: string;
  iou?: number;
  faces?: number;
}

export interface PlateFaceTrackResult {
  ok: boolean;
  samples: TrackSample[];
  debug: TrackedSampleDebug[];
  reason: string;
  latencyMs: number;
}

export interface PlateFaceTrackInput {
  plateVideoUrl: string;
  /** Full plate duration in seconds (still composition timeline). */
  totalSec: number;
  plateWidth: number;
  plateHeight: number;
  /** Turn window on the plate timeline. */
  startSec: number;
  endSec: number;
  /** Assignment-locked face box of THIS speaker in plate pixels. */
  anchorBox: Box;
  /**
   * V456 — assignment-locked MOUTH landmark of this speaker in plate pixels.
   * Used ONLY as an identity-safe tiebreak when two candidates are otherwise
   * equally plausible (side profiles / movement). Never selects a new face.
   */
  anchorMouth?: [number, number] | null;
  /** Face centers of the other cast members — used as a veto, never a target. */
  siblingCenters?: Array<[number, number]> | null;
  sampleCount?: number;
  /** Total wall-clock budget for the whole track. */
  budgetMs?: number;
  /** Injected in tests. Returns raw JPEG bytes of one still frame. */
  renderStill?: (videoUrl: string, totalSec: number, frame: number, timeoutMs: number) => Promise<Uint8Array>;
  /** Injected in tests. Returns face boxes in STILL pixel space. */
  detectFaces?: (
    jpegBytes: Uint8Array,
    stillWidth: number,
    stillHeight: number,
    timeoutMs: number,
  ) => Promise<Array<{ bbox: Box; mouth: [number, number] | null; confidence: number }>>;
  /** Injected in tests. Returns still dimensions for the given JPEG bytes. */
  decodeDims?: (jpegBytes: Uint8Array) => { width: number; height: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function centerOf(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function sideOf(b: Box): number {
  return Math.max(1, Math.max(b[2] - b[0], b[3] - b[1]));
}

/** Inverse of Remotion's `object-fit: cover` still transform. PURE. */
export function stillPointToSource(
  px: number,
  py: number,
  srcWidth: number,
  srcHeight: number,
  stillWidth: number,
  stillHeight: number,
): [number, number] {
  const s = Math.max(stillWidth / srcWidth, stillHeight / srcHeight);
  const dx = (stillWidth - srcWidth * s) / 2;
  const dy = (stillHeight - srcHeight * s) / 2;
  return [(px - dx) / s, (py - dy) / s];
}

export function stillBoxToSource(
  b: Box,
  srcWidth: number,
  srcHeight: number,
  stillWidth: number,
  stillHeight: number,
): Box {
  const [x1, y1] = stillPointToSource(b[0], b[1], srcWidth, srcHeight, stillWidth, stillHeight);
  const [x2, y2] = stillPointToSource(b[2], b[3], srcWidth, srcHeight, stillWidth, stillHeight);
  return [
    clamp(x1, 0, srcWidth),
    clamp(y1, 0, srcHeight),
    clamp(x2, 0, srcWidth),
    clamp(y2, 0, srcHeight),
  ];
}

/**
 * PURE — picks the continuation of the SAME face. Returns null when identity
 * cannot be proven; never returns a "next best" face.
 */
export function pickAssignedFace(
  candidates: Array<{ bbox: Box; mouth: [number, number] | null }>,
  reference: Box,
  siblingCenters: Array<[number, number]>,
  /** V456 — reference mouth in the SAME pixel space (optional tiebreak). */
  referenceMouth?: [number, number] | null,
): { bbox: Box; mouth: [number, number] | null; iou: number } | null {
  if (candidates.length === 0) return null;
  const [rcx, rcy] = centerOf(reference);
  const rSide = sideOf(reference);

  let best: { bbox: Box; mouth: [number, number] | null; iou: number; dist: number } | null = null;
  for (const c of candidates) {
    const iou = boxIoU(c.bbox, reference);
    const [ccx, ccy] = centerOf(c.bbox);
    const dist = Math.hypot(ccx - rcx, ccy - rcy);
    if (iou < TRACK_MIN_IOU && dist > rSide * TRACK_MAX_CENTER_DRIFT) continue;
    // Sibling veto: a candidate that sits closer to another cast member's
    // locked position than to our own reference is NOT our speaker.
    const nearerSibling = siblingCenters.some(
      ([sx, sy]) => Math.hypot(ccx - sx, ccy - sy) < dist,
    );
    if (nearerSibling) continue;
    if (!best || iou > best.iou || (iou === best.iou && dist < best.dist)) {
      best = { bbox: c.bbox, mouth: c.mouth, iou, dist };
    }
  }
  if (!best) return null;
  // Crossing/ambiguity veto: if a second candidate is essentially as good as
  // the best one, no continuation is PROVABLE. Returning null keeps identity
  // static (the sample is interpolated) instead of risking a speaker switch.
  for (const c of candidates) {
    if (c.bbox === best.bbox) continue;
    const iou = boxIoU(c.bbox, reference);
    const [ccx, ccy] = centerOf(c.bbox);
    const dist = Math.hypot(ccx - rcx, ccy - rcy);
    if (iou < TRACK_MIN_IOU && dist > rSide * TRACK_MAX_CENTER_DRIFT) continue;
    const distClose = dist <= best.dist * TRACK_AMBIGUITY_DIST_RATIO;
    const iouClose = Math.abs(iou - best.iou) < TRACK_AMBIGUITY_IOU_DELTA;
    if (!distClose || !iouClose) continue;
    // V456 — mouth-landmark tiebreak. On 3/4 profiles and lateral movement the
    // box IoU of two cast members can be equally plausible while the MOUTH
    // landmarks are far apart. Only a CLEAR margin (best mouth at least 25%
    // closer, relative to the reference face side) resolves the ambiguity;
    // anything less still returns null (identity stays unproven).
    if (
      referenceMouth && best.mouth && c.mouth &&
      Number.isFinite(referenceMouth[0]) && Number.isFinite(referenceMouth[1])
    ) {
      const dBest = Math.hypot(best.mouth[0] - referenceMouth[0], best.mouth[1] - referenceMouth[1]);
      const dOther = Math.hypot(c.mouth[0] - referenceMouth[0], c.mouth[1] - referenceMouth[1]);
      if (dOther - dBest > rSide * TRACK_MOUTH_TIEBREAK_MARGIN) continue;
    }
    return null;
  }
  return { bbox: best.bbox, mouth: best.mouth, iou: best.iou };
}

// ── AWS primitives ─────────────────────────────────────────────────────────

function awsClient(): AwsClient {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
  if (!accessKeyId || !secretAccessKey) throw new Error("aws_credentials_missing");
  return new AwsClient({ accessKeyId, secretAccessKey, sessionToken, region: AWS_REGION });
}

/**
 * V525 — EXPORTED, otherwise unchanged.
 *
 * This is the pipeline`s only server-side video-to-still path: Remotion
 * Lambda `type:"still"` on the plate video, AWS-only. V525 needs exactly
 * this raster and reuses it rather than writing a second Lambda payload —
 * the duplication `plateFaceSlotRouter` made with the SigV4 signer is the
 * mistake this avoids. Not one byte of the payload, composition, version,
 * quality or timeout handling changes.
 */
export function defaultRenderStill() {
  const serveUrl = Deno.env.get("REMOTION_SERVE_URL") ?? "";
  if (!serveUrl) throw new Error("remotion_serve_url_missing");
  const aws = awsClient();
  const lambdaUrl =
    `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${getLambdaFunctionName()}/invocations`;

  return async (videoUrl: string, totalSec: number, frame: number, timeoutMs: number): Promise<Uint8Array> => {
    const payload = {
      type: "still",
      serveUrl,
      composition: STILL_COMPOSITION,
      inputProps: {
        type: "payload",
        payload: JSON.stringify({ masterVideoUrl: videoUrl, masterAudioUrl: "", totalSec, shots: [] }),
      },
      version: STILL_REMOTION_VERSION,
      imageFormat: "jpeg",
      jpegQuality: STILL_JPEG_QUALITY,
      frame,
      privacy: "public",
      attempt: 1,
      logLevel: "warn",
      outName: `v452-track-${crypto.randomUUID()}.jpeg`,
      timeoutInMilliseconds: Math.max(1, timeoutMs),
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
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (!res.ok) throw new Error(`lambda_http_${res.status}`);
    const parsed = JSON.parse(await res.text());
    const output: string | undefined = parsed?.output ?? parsed?.url;
    if (!output) throw new Error("lambda_no_output");
    const dl = await fetch(output, { signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
    if (!dl.ok) throw new Error(`still_download_${dl.status}`);
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.byteLength < 1024) throw new Error("still_too_small");
    return bytes;
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function defaultDetectFaces() {
  const aws = awsClient();
  const endpoint = `https://rekognition.${AWS_REGION}.amazonaws.com/`;
  return async (
    bytes: Uint8Array,
    stillWidth: number,
    stillHeight: number,
    timeoutMs: number,
  ) => {
    const res = await aws.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "RekognitionService.DetectFaces",
      },
      body: JSON.stringify({ Image: { Bytes: toBase64(bytes) }, Attributes: ["DEFAULT"] }),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (!res.ok) throw new Error(`rekognition_http_${res.status}`);
    const json = await res.json();
    const details = Array.isArray(json?.FaceDetails) ? json.FaceDetails : [];
    const out: Array<{ bbox: Box; mouth: [number, number] | null; confidence: number }> = [];
    for (const d of details) {
      const bb = d?.BoundingBox;
      if (!bb) continue;
      const conf = Number(d?.Confidence ?? 0);
      if (conf < REK_MIN_CONFIDENCE) continue;
      const x1 = bb.Left * stillWidth;
      const y1 = bb.Top * stillHeight;
      const x2 = (bb.Left + bb.Width) * stillWidth;
      const y2 = (bb.Top + bb.Height) * stillHeight;
      if (x2 - x1 < 8 || y2 - y1 < 8) continue;
      let mouth: [number, number] | null = null;
      const lms = Array.isArray(d?.Landmarks) ? d.Landmarks : [];
      const ml = lms.find((l: any) => l?.Type === "mouthLeft");
      const mr = lms.find((l: any) => l?.Type === "mouthRight");
      const md = lms.find((l: any) => l?.Type === "mouthDown");
      if (ml && mr) {
        mouth = [
          ((Number(ml.X) + Number(mr.X)) / 2) * stillWidth,
          ((Number(ml.Y) + Number(mr.Y)) / 2) * stillHeight,
        ];
      } else if (md) {
        mouth = [Number(md.X) * stillWidth, Number(md.Y) * stillHeight];
      }
      out.push({ bbox: [x1, y1, x2, y2], mouth, confidence: conf / 100 });
    }
    return out;
  };
}

/**
 * Tracks the assignment-locked face across the turn. Never throws: any failure
 * degrades to `ok:false`, and the caller keeps the legacy static crop.
 */
export async function trackAssignedFaceAcrossTurn(
  input: PlateFaceTrackInput,
): Promise<PlateFaceTrackResult> {
  const t0 = Date.now();
  const times = trackSampleTimes(input.startSec, input.endSec, input.sampleCount ?? TRACK_SAMPLE_COUNT);
  const debug: TrackedSampleDebug[] = [];
  const samples: TrackSample[] = times.map((t) => ({ t, box: null, mouth: null }));
  const budgetMs = Math.max(5_000, input.budgetMs ?? 60_000);
  const deadline = t0 + budgetMs;

  let renderStill: PlateFaceTrackInput["renderStill"];
  let detectFaces: PlateFaceTrackInput["detectFaces"];
  try {
    renderStill = input.renderStill ?? defaultRenderStill();
    detectFaces = input.detectFaces ?? defaultDetectFaces();
  } catch (e) {
    return {
      ok: false,
      samples,
      debug,
      reason: `track_init_failed:${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - t0,
    };
  }
  const decodeDims = input.decodeDims ?? ((b: Uint8Array) => {
    const img = jpeg.decode(b, { useTArray: true });
    return { width: img.width, height: img.height };
  });

  const siblings = (input.siblingCenters ?? []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  ) as Array<[number, number]>;

  // Sequential on purpose: the reference box walks forward with the face, so
  // identity continuity is preserved sample by sample.
  let reference: Box = input.anchorBox;
  let referenceMouth: [number, number] | null = Array.isArray(input.anchorMouth) &&
      Number.isFinite(Number(input.anchorMouth[0])) && Number.isFinite(Number(input.anchorMouth[1]))
    ? [Number(input.anchorMouth[0]), Number(input.anchorMouth[1])]
    : null;
  for (let i = 0; i < times.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      debug.push({ t: times[i], accepted: false, reason: "budget_exhausted" });
      continue;
    }
    const perSample = Math.min(remaining - 500, Math.max(4_000, Math.floor(remaining / (times.length - i))));
    try {
      const frame = Math.max(0, Math.round(times[i] * STILL_FPS));
      const bytes = await renderStill!(input.plateVideoUrl, input.totalSec, frame, perSample);
      const dims = decodeDims(bytes);
      const faces = await detectFaces!(bytes, dims.width, dims.height, Math.max(2_000, perSample));
      const mapped = faces.map((f) => ({
        bbox: stillBoxToSource(f.bbox, input.plateWidth, input.plateHeight, dims.width, dims.height),
        mouth: f.mouth
          ? (stillPointToSource(
            f.mouth[0],
            f.mouth[1],
            input.plateWidth,
            input.plateHeight,
            dims.width,
            dims.height,
          ) as [number, number])
          : null,
      }));
      const picked = pickAssignedFace(mapped, reference, siblings, referenceMouth);
      if (!picked) {
        debug.push({ t: times[i], accepted: false, reason: "no_identity_safe_match", faces: mapped.length });
        continue;
      }
      samples[i] = { t: times[i], box: picked.bbox, mouth: picked.mouth };
      reference = picked.bbox;
      if (picked.mouth) referenceMouth = picked.mouth;
      debug.push({ t: times[i], accepted: true, reason: "ok", iou: Number(picked.iou.toFixed(3)), faces: mapped.length });
    } catch (e) {
      debug.push({ t: times[i], accepted: false, reason: `sample_error:${(e as Error)?.message ?? String(e)}` });
    }
  }

  const valid = samples.filter((s) => s.box).length;
  return {
    ok: valid >= 2,
    samples,
    debug,
    reason: valid >= 2 ? "tracked" : `insufficient_samples:${valid}`,
    latencyMs: Date.now() - t0,
  };
}

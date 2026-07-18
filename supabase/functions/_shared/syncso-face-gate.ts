/**
 * Sync.so Live Face-Gate — v252-aws-face-gate-primary
 *
 * Runs AWS Rekognition DetectFaces on the EXACT frame we are about to send to
 * Sync.so, BEFORE the dispatch call. Gemini Vision (previously the primary
 * detector here) was flaky under load — 429/5xx and unparsed text replies
 * forced too many `probe_unavailable` results. Rekognition returns
 * deterministic bboxes with confidence; that's exactly what this gate needs.
 *
 * Gemini is intentionally NOT used in this file anymore. Cartoon-Rescue and
 * Identity-Matching still use Gemini in their own modules
 * (plate-face-detect / plate-face-identity) — this file is the pre-dispatch
 * face gate only.
 *
 * Frame source (unchanged, v251 Anchor-First):
 *   - `prebuiltFrameUrl` from the caller (client-canvas capture) is preferred
 *   - otherwise a deterministic composer-frames cache hit
 *   - no server-side MP4 extraction (no Replicate/lucataco/ffmpeg)
 *
 * Verdict mapping (unchanged so callers/DB/UI keep working):
 *   - ok: true,  code: "ok"                       → safe to dispatch
 *   - ok: true,  code: "ok_after_snap", snapped_coord → caller MUST override
 *                                                       ASD coords before dispatch
 *   - ok: true,  code: "skipped"                  → preflight constraint
 *   - ok: true,  code: "probe_unavailable"        → non-blocking, dispatch proceeds
 *   - ok: false, code: "no_face" | "not_at_coord" | "multiple_faces"
 *                                                 → caller MUST refund + fail
 *
 * `unparsed` stays in the type union for back-compat but is no longer emitted.
 */

import { extractFrameForFaceProbe } from "./face-frame-extract.ts";
import { detectFacesMediaPipe } from "./face-detect-mediapipe.ts";

const GATE_VERSION = "v252-aws-face-gate-primary";


export type FaceGateCode =
  | "ok"
  | "ok_after_snap"
  | "no_face"
  | "not_at_coord"
  | "multiple_faces"
  | "skipped"
  | "probe_unavailable"
  | "unparsed";

export interface FaceGateResult {
  ok: boolean;
  code: FaceGateCode;
  reason?: string;
  raw_reply?: string;
  http_status?: number;
  /** Raw gateway error body (truncated) — for forensic logging. */
  raw_error?: string;
  /** Public URL of the JPEG we sent to Gemini (when extraction succeeded). */
  frame_jpeg_url?: string;
  /** True when the JPEG came from the storage cache. */
  frame_cached?: boolean;
  /** Replicate + Gemini wall-clock for forensic logging. */
  extract_ms?: number;
  gemini_ms?: number;
  /** v129.22.3 — Rekognition-derived plate-pixel center to use instead of
   *  the original intent coord. Only set when code === "ok_after_snap". */
  snapped_coord?: [number, number];
  /** v129.22.3 — Original intent coord before snap (log/UI delta). */
  original_coord?: [number, number];
  /** v129.22.3 — Pixel distance between original and snapped coord. */
  snap_distance_px?: number;
}

function hasAwsCreds(): boolean {
  return Boolean(Deno.env.get("AWS_ACCESS_KEY_ID") && Deno.env.get("AWS_SECRET_ACCESS_KEY"));
}


export interface FaceGateInput {
  videoUrl: string;
  frameNumber: number | null | undefined;
  coord: [number, number] | null | undefined;
  /** When true (single-speaker preclip), multiple_faces is a soft pass.
   *  When false (multi-speaker plate), multiple_faces is a hard fail
   *  because Sync.so cannot disambiguate from a single coord. */
  isMultiSpeakerContext?: boolean;
  /** Hard timeout for the Gemini call (ms). Default 15s. */
  timeoutMs?: number;
  /** Optional fps hint for the frame extractor. Defaults to 30. */
  fps?: number;
  /** Pre-extracted JPEG/PNG URL. Dispatch should pass this when available so
   *  the gate probes exactly the frame that preflight/forensics use. */
  prebuiltFrameUrl?: string;
  /** Optional stable cache path parts for server-side extraction. */
  userId?: string;
  projectId?: string;
  sceneId?: string;
  passIdx?: number;
  /** True when the preclip was already validated as exactly one clean face. */
  preclipTrusted?: boolean;
  /** v129.22.3 — Plate pixel dims required for AWS Rekognition auto-snap.
   *  When omitted, "yes_but_not_at_coord" stays a hard fail (legacy v129.11
   *  behaviour). Callers with plate dims handy should pass them to enable
   *  self-healing. */
  plateWidth?: number;
  plateHeight?: number;
}

export async function verifyFaceBeforeDispatch(
  input: FaceGateInput,
): Promise<FaceGateResult> {
  if (!hasAwsCreds()) return { ok: true, code: "skipped", reason: "no_aws_credentials" };
  if (!input.videoUrl) return { ok: true, code: "skipped", reason: "no_video_url" };


  const frame = Number.isFinite(input.frameNumber) ? Number(input.frameNumber) : null;
  const coord = Array.isArray(input.coord) && input.coord.length >= 2
    ? [Number(input.coord[0]), Number(input.coord[1])] as [number, number]
    : null;

  // ── Stage 1 — resolve a real still image of the ASD frame ───────
  // Client-canvas frames are authoritative. Server extraction only checks
  // the deterministic cache path; it never calls Replicate/lucataco.
  let frameJpegUrl: string | undefined;
  let frameCached = false;
  let extractMs = 0;
  if (typeof input.prebuiltFrameUrl === "string" && input.prebuiltFrameUrl.startsWith("http")) {
    frameJpegUrl = input.prebuiltFrameUrl;
    frameCached = true;
  } else if (frame != null) {
    const extracted = await extractFrameForFaceProbe({
      videoUrl: input.videoUrl,
      frameNumber: frame,
      fps: input.fps ?? 30,
      userId: input.userId,
      projectId: input.projectId,
      sceneId: input.sceneId,
      passIdx: input.passIdx,
    });
    extractMs = extracted.latencyMs ?? 0;
    if (!extracted.ok || !extracted.frameUrl) {
      return {
        ok: true,
        code: "probe_unavailable",
        reason: `frame_probe_unavailable: ${extracted.reason ?? "unknown"}; source=${input.preclipTrusted ? "preclip-validated" : "none"} — dispatch will proceed unchecked.`,
        extract_ms: extractMs,
      };
    }
    frameJpegUrl = extracted.frameUrl;
    frameCached = !!extracted.cached;
  }

  if (!frameJpegUrl) {
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `no_client_canvas_frame; source=${input.preclipTrusted ? "preclip-validated" : "none"} — dispatch will proceed unchecked.`,
      extract_ms: extractMs,
    };
  }

  // ── Stage 2 — AWS Rekognition on the extracted JPEG ─────────────
  // v252: primary detector is AWS Rekognition, not Gemini. Deterministic
  // bboxes with confidence; no text parsing, no rate-limit surprises.
  const W = Math.max(0, Number(input.plateWidth ?? 0));
  const H = Math.max(0, Number(input.plateHeight ?? 0));
  // Rekognition needs plate dims to convert its relative bbox to pixel
  // space. When callers didn't provide them, fall back to a 1x1 unit box —
  // the face count is still trustworthy, we just can't do coord-tolerance
  // or safe-zone snapping.
  const rekW = W > 0 ? W : 1280;
  const rekH = H > 0 ? H : 720;

  const awsStart = Date.now();
  let rek: Awaited<ReturnType<typeof detectFacesMediaPipe>>;
  try {
    rek = await detectFacesMediaPipe({
      videoUrl: input.videoUrl,
      plateWidth: rekW,
      plateHeight: rekH,
      durationSec: 1,
      prebuiltFrameUrls: [frameJpegUrl],
    });
  } catch (e) {
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `aws_rekognition_threw: ${(e as Error)?.message ?? String(e)} — dispatch will proceed unchecked.`,
      frame_jpeg_url: frameJpegUrl,
      frame_cached: frameCached,
      extract_ms: extractMs,
      gemini_ms: Date.now() - awsStart,
    };
  }
  const awsMs = Date.now() - awsStart;
  const faceCount = rek.faces?.length ?? 0;
  const rawReply = rek.ok
    ? `aws_rek:${faceCount}_face${faceCount === 1 ? `@${Math.round(rek.faces[0].center[0])},${Math.round(rek.faces[0].center[1])}` : ""}`
    : `aws_rek_error:${rek.error ?? "unknown"}`;

  const baseMeta = {
    frame_jpeg_url: frameJpegUrl,
    frame_cached: frameCached,
    extract_ms: extractMs,
    gemini_ms: awsMs, // reused meta field for wall-clock (kept name for schema compat)
  } as const;

  if (!rek.ok) {
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `aws_rekognition_error: ${rek.error ?? "unknown"} — dispatch will proceed unchecked.`,
      raw_error: (rek.error ?? "").slice(0, 400),
      raw_reply: rawReply,
      ...baseMeta,
    };
  }

  // ── Verdict from face count ──────────────────────────────────────
  if (faceCount === 0) {
    console.log(`[face-gate] ${GATE_VERSION} no_face on jpeg`);
    return {
      ok: false,
      code: "no_face",
      reason: "AWS Rekognition detected no human face in the extracted ASD frame — Sync.so cannot lipsync.",
      raw_reply: rawReply,
      ...baseMeta,
    };
  }

  if (faceCount > 1) {
    if (input.isMultiSpeakerContext) {
      console.log(`[face-gate] ${GATE_VERSION} multiple_faces=${faceCount} multi_speaker=true → hard fail`);
      return {
        ok: false,
        code: "multiple_faces",
        reason: `AWS Rekognition saw ${faceCount} faces on a multi-speaker plate — Sync.so cannot disambiguate from a single coordinate.`,
        raw_reply: rawReply,
        ...baseMeta,
      };
    }
    // Single-speaker preclip: extra faces (e.g. background extra) are a
    // soft pass — the preclip crop guarantees the target face dominates.
    console.log(`[face-gate] ${GATE_VERSION} multiple_faces=${faceCount} single_speaker → soft pass`);
    return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta };
  }

  // Exactly one face — check coord tolerance if we have both coord + plate dims.
  const f = rek.faces[0];
  const faceCx = f.center[0];
  const faceCy = f.center[1];

  if (coord != null && W > 0 && H > 0) {
    // Tolerance: 15% of the longer plate side.
    const tolPx = Math.max(W, H) * 0.15;
    const dist = Math.hypot(faceCx - coord[0], faceCy - coord[1]);
    if (dist <= tolPx) {
      console.log(
        `[face-gate] ${GATE_VERSION} ok face=[${Math.round(faceCx)},${Math.round(faceCy)}] ` +
        `coord=[${coord[0]},${coord[1]}] dist=${Math.round(dist)}px tol=${Math.round(tolPx)}px`,
      );
      return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta };
    }

    // Off-coord: attempt auto-snap when the face is inside the 5-95% safe zone.
    const inBounds =
      faceCx >= W * 0.05 && faceCx <= W * 0.95 &&
      faceCy >= H * 0.05 && faceCy <= H * 0.95;
    if (inBounds) {
      const snapped: [number, number] = [Math.round(faceCx), Math.round(faceCy)];
      console.log(
        `[face-gate] ${GATE_VERSION} AUTO_SNAP intent=[${coord[0]},${coord[1]}] ` +
        `→ rekognition=[${snapped[0]},${snapped[1]}] dist=${Math.round(dist)}px plate=${W}x${H}`,
      );
      return {
        ok: true,
        code: "ok_after_snap",
        reason: `Intent coord [${coord[0]},${coord[1]}] missed the face. ` +
          `Rekognition snapped to [${snapped[0]},${snapped[1]}] (${Math.round(dist)}px delta).`,
        raw_reply: rawReply,
        snapped_coord: snapped,
        original_coord: [coord[0], coord[1]],
        snap_distance_px: Math.round(dist),
        ...baseMeta,
      };
    }

    console.warn(
      `[face-gate] ${GATE_VERSION} not_at_coord face=[${Math.round(faceCx)},${Math.round(faceCy)}] ` +
      `outside safe-zone on plate ${W}x${H} — hard fail.`,
    );
    return {
      ok: false,
      code: "not_at_coord",
      reason: `Face exists but not at active_speaker_detection coord [${coord[0]},${coord[1]}] — Sync.so would return generation_unknown_error.`,
      raw_reply: rawReply,
      ...baseMeta,
    };
  }

  // No coord or no plate dims → 1 face is a green light.
  console.log(`[face-gate] ${GATE_VERSION} ok face_count=1 (no coord check)`);
  return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta };

}

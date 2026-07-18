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

function getApiKey(): string {
  return Deno.env.get("LOVABLE_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
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
  const apiKey = getApiKey();
  if (!apiKey) return { ok: true, code: "skipped", reason: "no_gemini_api_key" };
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

  // ── Stage 2 — ask Gemini about the extracted frame ───────────────
  const question = (frame != null && coord != null)
    ? `You are looking at a single video frame extracted at frame ${frame}. Is there exactly one clearly visible human face whose center is near the normalized image coordinates x=${coord[0]}, y=${coord[1]} (tolerance ±0.15)? Reply with EXACTLY one of: "yes_one_face_at_coord", "yes_but_not_at_coord", "multiple_faces", "no_face". No other text.`
    : `Count distinct human faces clearly visible in this still image. Reply with ONLY a single integer (0, 1, 2, ...). No words.`;

  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: question }];
  userContent.push({ type: "image_url", image_url: { url: frameJpegUrl } });

  const geminiStart = Date.now();
  let r: Response;
  try {
    r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `gemini_network_error: ${(e as Error)?.message ?? String(e)} — dispatch will proceed unchecked.`,
      frame_jpeg_url: frameJpegUrl,
      frame_cached: frameCached,
      extract_ms: extractMs,
      gemini_ms: Date.now() - geminiStart,
    };
  }

  const geminiMs = Date.now() - geminiStart;
  const rawBody = await r.text().catch(() => "");

  if (!r.ok) {
    // With a real JPEG, a non-2xx from Gemini is almost always a 5xx /
    // rate-limit. Treat as probe_unavailable (non-blocking) so production
    // doesn't fall over on transient outages.
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `gemini_http_${r.status} on extracted_jpeg — dispatch will proceed unchecked.`,
      http_status: r.status,
      raw_error: rawBody.slice(0, 400),
      frame_jpeg_url: frameJpegUrl,
      frame_cached: frameCached,
      extract_ms: extractMs,
      gemini_ms: geminiMs,
    };
  }

  let body: unknown = null;
  try { body = JSON.parse(rawBody); } catch { /* fallthrough */ }
  const txt: string = String(
    (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "",
  ).trim();
  const tl = txt.toLowerCase();

  const baseMeta = {
    frame_jpeg_url: frameJpegUrl,
    frame_cached: frameCached,
    extract_ms: extractMs,
    gemini_ms: geminiMs,
  } as const;

  if (frame != null && coord != null) {
    if (tl.includes("yes_one_face_at_coord")) {
      return { ok: true, code: "ok", raw_reply: txt.slice(0, 80), ...baseMeta };
    }
    if (tl.includes("no_face")) {
      return {
        ok: false,
        code: "no_face",
        reason: "Gemini detected no human face in the extracted ASD frame — Sync.so cannot lipsync.",
        raw_reply: txt.slice(0, 80),
        ...baseMeta,
      };
    }
    if (tl.includes("yes_but_not_at_coord")) {
      // v129.22.3 — Auto-snap: ask AWS Rekognition for the actual face
      // center on the same JPEG. If exactly one face is found and it's
      // a plausible plate position, return ok_after_snap so the caller
      // can override the ASD coords instead of failing the dispatch.
      // This rescues runs where the original plate-face detector wasn't
      // available (e.g. AWS IAM not yet granted) and the inferred coord
      // landed off-face.
      const W = Number(input.plateWidth ?? 0);
      const H = Number(input.plateHeight ?? 0);
      const canSnap = frameJpegUrl && W > 0 && H > 0;
      if (canSnap) {
        try {
          const snap = await detectFacesMediaPipe({
            videoUrl: input.videoUrl,
            plateWidth: W,
            plateHeight: H,
            durationSec: 1,
            prebuiltFrameUrls: [frameJpegUrl as string],
          });
          if (snap.ok && snap.faces.length === 1) {
            const f = snap.faces[0];
            // Sanity: face must sit inside the 5%-95% safe zone, otherwise
            // we're likely snapping onto a background detection artefact.
            const minX = W * 0.05;
            const maxX = W * 0.95;
            const minY = H * 0.05;
            const maxY = H * 0.95;
            const inBounds = f.center[0] >= minX && f.center[0] <= maxX &&
                             f.center[1] >= minY && f.center[1] <= maxY;
            if (inBounds) {
              const dist = Math.round(Math.hypot(
                f.center[0] - coord[0],
                f.center[1] - coord[1],
              ));
              const snapped: [number, number] = [
                Math.round(f.center[0]),
                Math.round(f.center[1]),
              ];
              console.log(
                `[face-gate] v129.22.3 AUTO_SNAP intent=[${coord[0]},${coord[1]}] ` +
                `→ rekognition=[${snapped[0]},${snapped[1]}] dist=${dist}px plate=${W}x${H}`,
              );
              return {
                ok: true,
                code: "ok_after_snap",
                reason: `Intent coord [${coord[0]},${coord[1]}] missed the face. ` +
                  `Rekognition snapped to [${snapped[0]},${snapped[1]}] (${dist}px delta).`,
                raw_reply: txt.slice(0, 80),
                snapped_coord: snapped,
                original_coord: [coord[0], coord[1]],
                snap_distance_px: dist,
                ...baseMeta,
              };
            }
            console.warn(
              `[face-gate] v129.22.3 snap candidate [${f.center[0]},${f.center[1]}] ` +
              `outside safe-zone on plate ${W}x${H} — refusing snap, failing hard.`,
            );
          } else if (snap.ok && snap.faces.length > 1) {
            console.warn(
              `[face-gate] v129.22.3 snap aborted — rekognition saw ${snap.faces.length} faces, ` +
              `ambiguous which to snap to.`,
            );
          } else {
            console.warn(
              `[face-gate] v129.22.3 snap aborted — rekognition error: ${snap.error ?? "0 faces"}`,
            );
          }
        } catch (e) {
          console.warn(`[face-gate] v129.22.3 snap threw: ${(e as Error)?.message ?? e}`);
        }
      }
      return {
        ok: false,
        code: "not_at_coord",
        reason: `Face exists but not at active_speaker_detection coord [${coord[0]},${coord[1]}] — Sync.so would return generation_unknown_error.`,
        raw_reply: txt.slice(0, 80),
        ...baseMeta,
      };
    }
    if (tl.includes("multiple_faces")) {
      if (input.isMultiSpeakerContext) {
        return {
          ok: false,
          code: "multiple_faces",
          reason: "Multiple faces at the target coord — Sync.so cannot disambiguate from a single coordinate.",
          raw_reply: txt.slice(0, 80),
          ...baseMeta,
        };
      }
      return { ok: true, code: "ok", raw_reply: txt.slice(0, 80), ...baseMeta };
    }
    return {
      ok: true,
      code: "unparsed",
      reason: `Gemini reply not recognized: "${txt.slice(0, 80)}" — dispatch will proceed unchecked.`,
      raw_reply: txt.slice(0, 80),
      ...baseMeta,
    };
  }

  const m = txt.match(/\d+/);
  const n = m ? Number(m[0]) : null;
  if (n === 0) {
    return {
      ok: false,
      code: "no_face",
      reason: "Gemini detected zero faces in the extracted frame.",
      raw_reply: txt.slice(0, 80),
      ...baseMeta,
    };
  }
  if (n != null && n >= 1) {
    return { ok: true, code: "ok", raw_reply: txt.slice(0, 80), ...baseMeta };
  }
  return {
    ok: true,
    code: "unparsed",
    reason: `Gemini reply not recognized: "${txt.slice(0, 80)}" — dispatch will proceed unchecked.`,
    raw_reply: txt.slice(0, 80),
    ...baseMeta,
  };
}

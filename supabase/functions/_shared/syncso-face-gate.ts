/**
 * Sync.so Live Face-Gate — v129.11 (Deterministic Frame-Probe)
 *
 * Runs Gemini Vision on the EXACT frame + coord we are about to send to
 * Sync.so, BEFORE the dispatch call.
 *
 * v129.11 fix: instead of handing Gemini an MP4 URL (which OpenRouter
 * deterministically rejects with HTTP 400 → silent skip → wasted Sync.so
 * credit), we first extract the JPEG at frame_number via Replicate's
 * `lucataco/ffmpeg-extract-frame`, upload it to `composer-frames` and
 * send THAT image. Gemini now produces a real verdict.
 *
 * Verdict mapping:
 *   - ok: true,  code: "ok"                                 → safe to dispatch
 *   - ok: true,  code: "skipped"                            → preflight
 *       constraint (no API key / no video URL); never seen in production
 *   - ok: true,  code: "probe_unavailable"                  → frame extract
 *       or Gemini transport failed; dispatch proceeds unchecked + Forensik
 *       UI surfaces the warning honestly
 *   - ok: false, code: "no_face" | "not_at_coord"
 *               | "multiple_faces" | "unparsed"             → caller MUST
 *       refund + fail BEFORE dispatching to Sync.so
 */

import { extractFrameForFaceProbe } from "./face-frame-extract.ts";

export type FaceGateCode =
  | "ok"
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

  // ── Stage 1 — extract a real JPEG of the ASD frame ──────────────
  // Without this Gemini receives the MP4 URL and the gateway returns 400.
  let frameJpegUrl: string | undefined;
  let frameCached = false;
  let extractMs = 0;
  if (frame != null) {
    const extracted = await extractFrameForFaceProbe({
      videoUrl: input.videoUrl,
      frameNumber: frame,
      fps: input.fps ?? 30,
    });
    extractMs = extracted.latencyMs ?? 0;
    if (!extracted.ok || !extracted.frameUrl) {
      return {
        ok: true,
        code: "probe_unavailable",
        reason: `frame_extract_unavailable: ${extracted.reason ?? "unknown"} — dispatch will proceed unchecked.`,
        extract_ms: extractMs,
      };
    }
    frameJpegUrl = extracted.frameUrl;
    frameCached = !!extracted.cached;
  }

  // ── Stage 2 — ask Gemini about the extracted frame ───────────────
  const question = (frame != null && coord != null)
    ? `You are looking at a single video frame extracted at frame ${frame}. Is there exactly one clearly visible human face whose center is near the normalized image coordinates x=${coord[0]}, y=${coord[1]} (tolerance ±0.15)? Reply with EXACTLY one of: "yes_one_face_at_coord", "yes_but_not_at_coord", "multiple_faces", "no_face". No other text.`
    : `Count distinct human faces clearly visible in this still image. Reply with ONLY a single integer (0, 1, 2, ...). No words.`;

  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: question }];
  if (frameJpegUrl) {
    userContent.push({ type: "image_url", image_url: { url: frameJpegUrl } });
  } else {
    // No frame_number available → fall back to legacy video-URL probe.
    userContent.push({ type: "image_url", image_url: { url: input.videoUrl } });
  }

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

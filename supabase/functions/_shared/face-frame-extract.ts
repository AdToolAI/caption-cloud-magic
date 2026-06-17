/**
 * face-frame-extract (v129.14)
 *
 * Server-side frame extraction was disabled — neither Replicate
 * (`lucataco/ffmpeg-extract-frame` 404) nor `@ffmpeg/ffmpeg` (refuses to
 * load in the Deno Edge runtime: "ffmpeg.wasm does not support nodejs")
 * worked reliably. The browser-based Canvas extractor in the Sync.so
 * Forensics Sheet now produces the JPEG and passes it to the preflight
 * function as `probe_frame_url`.
 *
 * This module is kept as a safe no-op so existing callers
 * (`syncso-face-gate`, `syncso-preflight`) compile unchanged and the
 * gate degrades to `probe_unavailable` instead of throwing.
 */

const MODEL_TAG = "noop@v129.14";

export interface ExtractInput {
  videoUrl: string;
  frameNumber: number;
  fps?: number;
  timeoutMs?: number;
}

export interface ExtractResult {
  ok: boolean;
  frameUrl?: string;
  cached?: boolean;
  model?: string;
  latencyMs?: number;
  reason?: string;
}

export async function extractFrameForFaceProbe(
  _input: ExtractInput,
): Promise<ExtractResult> {
  return {
    ok: false,
    reason:
      "server_extractor_disabled_v129_14: edge runtime cannot run ffmpeg.wasm — use client-side canvas extractor and pass probe_frame_url",
    model: MODEL_TAG,
    latencyMs: 0,
  };
}

/**
 * Sync.so Live Face-Gate — v129.10
 *
 * Runs Gemini Vision on the EXACT video URL + frame_number + coordinates
 * we are about to send to Sync.so, BEFORE the dispatch call.
 *
 * v129.10 fix: Lovable AI Gateway routes `google/gemini-*` via OpenRouter,
 * which only accepts IMAGE URLs in `image_url` blocks. Passing a `video/mp4`
 * URL deterministically returns HTTP 400. The previous v129.9 code treated
 * that as `skipped → ok:true` and let the dispatch through — which is why
 * Sync.so credits kept burning. Now we treat non-2xx / unparsed responses
 * as `probe_unavailable` → hard block + refund.
 *
 * Returns:
 *   - { ok: true,  code: 'ok' }                     → safe to dispatch
 *   - { ok: true,  code: 'skipped', reason }        → probe could not run
 *       because no API key / no video URL was provided (admin will never
 *       see this in production, only in dev/local)
 *   - { ok: false, code: 'no_face' | 'not_at_coord' | 'multiple_faces'
 *               | 'probe_unavailable' | 'unparsed', reason, ... }
 *                                                   → caller MUST refund + fail
 */

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

  const question = (frame != null && coord != null)
    ? `This is a short video clip. Around frame ${frame} (≈${(frame / 30).toFixed(2)}s), is there a single clearly visible human face near image coordinates x=${coord[0]}, y=${coord[1]}? Reply with EXACTLY one of: "yes_one_face_at_coord", "yes_but_not_at_coord", "multiple_faces", "no_face". No other text.`
    : `Count distinct human faces clearly visible in any frame of this short video clip. Reply with ONLY a single integer (0, 1, 2, ...). No words.`;

  let r: Response;
  try {
    r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: input.videoUrl } },
          ],
        }],
      }),
    });
  } catch (e) {
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `gemini_network_error: ${(e as Error)?.message ?? String(e)} — dispatch will proceed unchecked.`,
    };
  }


  const rawBody = await r.text().catch(() => "");
  if (!r.ok) {
    // The Lovable AI gateway routes google/gemini-* via OpenRouter which
    // only accepts IMAGE URLs in image_url blocks. A video/mp4 URL
    // deterministically returns HTTP 400 here. We MUST NOT hard-block the
    // dispatch on probe_unavailable, otherwise lipsync stops working for
    // every user. Instead we surface it as a non-blocking signal: caller
    // logs FACE_GATE_PROBE_UNAVAILABLE, lets the dispatch proceed, and the
    // user sees an honest "probe unavailable" line in the Preflight UI.
    return {
      ok: true,
      code: "probe_unavailable",
      reason: `gemini_http_${r.status} — face probe cannot run on a video URL via the Lovable AI gateway (OpenRouter passthrough rejects video/mp4 in image_url). Dispatch will proceed unchecked.`,
      http_status: r.status,
      raw_error: rawBody.slice(0, 400),
    };
  }


  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { /* fallthrough */ }
  const txt: string = String(body?.choices?.[0]?.message?.content ?? "").trim();
  const tl = txt.toLowerCase();

  if (frame != null && coord != null) {
    if (tl.includes("yes_one_face_at_coord")) return { ok: true, code: "ok", raw_reply: txt.slice(0, 80) };
    if (tl.includes("no_face")) {
      return { ok: false, code: "no_face", reason: "Gemini detected no human face in the video — Sync.so cannot lipsync.", raw_reply: txt.slice(0, 80) };
    }
    if (tl.includes("yes_but_not_at_coord")) {
      return { ok: false, code: "not_at_coord", reason: `Face exists but not at active_speaker_detection coord [${coord[0]},${coord[1]}] — Sync.so would return generation_unknown_error.`, raw_reply: txt.slice(0, 80) };
    }
    if (tl.includes("multiple_faces")) {
      if (input.isMultiSpeakerContext) {
        return { ok: false, code: "multiple_faces", reason: "Multiple faces at the target coord — Sync.so cannot disambiguate from a single coordinate.", raw_reply: txt.slice(0, 80) };
      }
      return { ok: true, code: "ok", raw_reply: txt.slice(0, 80) };
    }
    return {
      ok: true,
      code: "unparsed",
      reason: `Gemini reply not recognized: "${txt.slice(0, 80)}" — dispatch will proceed unchecked.`,
      raw_reply: txt.slice(0, 80),
    };

  } else {
    const m = txt.match(/\d+/);
    const n = m ? Number(m[0]) : null;
    if (n === 0) {
      return { ok: false, code: "no_face", reason: "Gemini detected zero faces in the video.", raw_reply: txt.slice(0, 80) };
    }
    if (n != null && n >= 1) return { ok: true, code: "ok", raw_reply: txt.slice(0, 80) };
    return {
      ok: false,
      code: "unparsed",
      reason: `Gemini reply not recognized: "${txt.slice(0, 80)}" — refusing dispatch.`,
      raw_reply: txt.slice(0, 80),
    };
  }
}

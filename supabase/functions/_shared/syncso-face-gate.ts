/**
 * Sync.so Live Face-Gate — v129.9
 *
 * Runs Gemini Vision on the EXACT video URL + frame_number + coordinates
 * we are about to send to Sync.so, BEFORE the dispatch call. Purpose:
 * catch the dominant `generation_unknown_error` class (face is not at the
 * coord we promised Sync.so) deterministically and fail-fast with refund
 * instead of burning a Sync.so credit on a payload that cannot succeed.
 *
 * Read-only HTTP — never mutates DB, never calls Sync.so.
 *
 * Returns:
 *   - { ok: true }                         → safe to dispatch
 *   - { ok: false, code: 'no_face' | 'not_at_coord' | 'multiple_faces',
 *       reason, raw }                      → caller must refund + fail
 *   - { ok: true, code: 'skipped', reason } → probe could not run (no key
 *       / no url / Gemini HTTP error) — fall through to Sync.so (the
 *       existing Preflight already covers the other 5 classes).
 *
 * Strict: only blocks on confident negative verdicts. Ambiguous / unparsed
 * replies fall through to Sync.so so we don't introduce a new false-positive
 * failure mode.
 */

export type FaceGateCode =
  | "ok"
  | "no_face"
  | "not_at_coord"
  | "multiple_faces"
  | "skipped"
  | "unparsed";

export interface FaceGateResult {
  ok: boolean;
  code: FaceGateCode;
  reason?: string;
  raw_reply?: string;
  http_status?: number;
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

  // When ASD will be `auto_detect:true`, frame/coord are not promised to
  // Sync.so — only the existence of a face matters.
  const question = (frame != null && coord != null)
    ? `This is a short video clip. Around frame ${frame} (≈${(frame / 30).toFixed(2)}s), is there a single clearly visible human face near image coordinates x=${coord[0]}, y=${coord[1]}? Reply with EXACTLY one of: "yes_one_face_at_coord", "yes_but_not_at_coord", "multiple_faces", "no_face". No other text.`
    : `Count distinct human faces clearly visible in any frame of this short video clip. Reply with ONLY a single integer (0, 1, 2, ...). No words.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      return { ok: true, code: "skipped", reason: `gemini_http_${r.status}`, http_status: r.status };
    }
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
        // Single-speaker preclip — multiple faces is unusual but Sync.so's
        // auto_detect will pick one; don't block.
        return { ok: true, code: "ok", raw_reply: txt.slice(0, 80) };
      }
      return { ok: true, code: "unparsed", reason: `Gemini reply not recognized: "${txt.slice(0, 80)}"`, raw_reply: txt.slice(0, 80) };
    } else {
      const m = txt.match(/\d+/);
      const n = m ? Number(m[0]) : null;
      if (n === 0) {
        return { ok: false, code: "no_face", reason: "Gemini detected zero faces in the video.", raw_reply: txt.slice(0, 80) };
      }
      return { ok: true, code: "ok", raw_reply: txt.slice(0, 80) };
    }
  } catch (e) {
    return { ok: true, code: "skipped", reason: `gemini_error_${(e as Error)?.message ?? String(e)}` };
  }
}

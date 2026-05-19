/**
 * Shared face-count helper. Asks Gemini Vision how many distinct human
 * faces are visible in a given image or first-frame URL. Used by:
 *  - `compose-video-clips` → pre-flight check on composed scene anchor
 *    BEFORE handing it to i2v (catches "Nano Banana rendered only one
 *    face" early so we can re-compose without spending Hailuo credits).
 *  - `compose-twoshot-lipsync` → post-clip audit (separate, richer
 *    helper there because it also returns per-face coordinates).
 *
 * Returns null when the call fails — caller decides whether that means
 * "skip the check" or "fail loud".
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export async function countFacesInImage(
  url: string,
  lovableKey: string,
  opts: { kind?: "image" | "video"; timeoutMs?: number } = {},
): Promise<number | null> {
  const kind = opts.kind ?? "image";
  const timeoutMs = opts.timeoutMs ?? 20_000;
  try {
    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  (kind === "video"
                    ? "You see the FIRST FRAME of a video. "
                    : "You see a single image. ") +
                  "Count the DISTINCT human faces that are clearly visible and identifiable " +
                  "(eyes, nose and mouth all discernible). Do NOT count back-of-head shots, " +
                  "heavily occluded faces, blurred background faces, or faces shown only in profile " +
                  "silhouette with no features visible. " +
                  "Return STRICT JSON only, no prose: {\"faces\": <integer>}.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const n = Number(parsed?.faces);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  } catch {
    return null;
  }
}

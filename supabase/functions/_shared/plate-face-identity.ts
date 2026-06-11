/**
 * plate-face-identity.ts
 *
 * Combines `detectPlateFaces` (real face boxes on the RENDERED video plate)
 * with Gemini Vision identity matching against the character portraits.
 *
 * Why: the existing `faceMap` lives in ANCHOR-image space (Nano Banana 2
 * still). Hailuo/i2v plates drift 5-15% relative to that anchor, so
 * rescaling anchor coords onto the plate routinely puts the Sync.so
 * target on the WRONG face — the bug the user sees as "Lip-Sync hat
 * keinen Avatar getroffen".
 *
 * This helper returns per-character plate-pixel-space coords + bbox,
 * never the anchor's. Callers fall back to the anchor faceMap only when
 * plate detection genuinely cannot resolve a character.
 */
import { detectPlateFaces, PlateFaceBox, PlateFaceMap } from "./plate-face-detect.ts";

const LOVABLE_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_TIMEOUT_MS = 25_000;

export interface PlateIdentityFace extends PlateFaceBox {
  characterId: string | null;
  matchConfidence?: number;
}

export interface PlateIdentityMap {
  faces: PlateIdentityFace[];
  width: number;
  height: number;
  detector: string;
  frame_url?: string;
  cached: boolean;
  /** Number of speakers we could resolve to a distinct plate face. */
  resolvedCount: number;
}

async function askGeminiForPlateIdentity(
  frameUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  faces: PlateFaceBox[],
  timestampSec: number,
): Promise<Map<number, { characterId: string; confidence: number }>> {
  const out = new Map<number, { characterId: string; confidence: number }>();
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey || characters.length === 0 || faces.length === 0) return out;
  try {
    const ids = characters.map((c) => c.characterId);
    const slotDescriptions = faces
      .map(
        (f) =>
          `slot ${f.slot}: bbox normalized [${(f.bbox[0] / Math.max(1, f.center[0] * 2)).toFixed(2)}…] center≈[${f.center[0]}, ${f.center[1]}]`,
      )
      .join(", ");
    const content: any[] = [
      {
        type: "text",
        text:
          `The FIRST attachment is a video; look at the frame at timestamp ${timestampSec.toFixed(2)}s. ` +
          `That frame contains ${faces.length} human face(s). ` +
          `Faces are pre-numbered by slot, sorted left-to-right (slot 0 = left-most). ${slotDescriptions}. ` +
          `The remaining images are reference portraits in this order: ` +
          ids.map((id, i) => `(${i + 1}) ${id}`).join(", ") + ". " +
          `For EACH slot in the scene frame, identify which reference portrait matches by facial identity. ` +
          `Return STRICT JSON only — no prose, no markdown fences. ` +
          `Schema: {"assignments":[{"slot":<int>,"characterId":"<id or null>","confidence":<0..1>}]}. ` +
          `Use ONLY ids from: ${ids.join(", ")}. Never assign the same id to two different slots. ` +
          `If a slot's identity is uncertain (<0.5), use null.`,
      },
      { type: "image_url", image_url: { url: frameUrl } },
      ...characters.map((c) => ({ type: "image_url", image_url: { url: c.portraitUrl } })),
    ];
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) return out;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return out;
    const parsed = JSON.parse(m[0]);
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const seen = new Set<string>();
    if (Array.isArray(parsed?.assignments)) {
      for (const a of parsed.assignments) {
        const slot = Number(a?.slot);
        const cid = typeof a?.characterId === "string" ? a.characterId.toLowerCase().trim() : "";
        const conf = Number(a?.confidence);
        if (!Number.isFinite(slot)) continue;
        if (!cid || !allowed.has(cid) || seen.has(cid)) continue;
        if (Number.isFinite(conf) && conf < 0.45) continue;
        seen.add(cid);
        out.set(slot, { characterId: cid, confidence: Number.isFinite(conf) ? conf : 0.7 });
      }
    }
  } catch {
    /* fall through */
  }
  return out;
}

/**
 * Resolve real plate-pixel face boxes for the given characters.
 * Returns null when plate-side detection failed entirely (caller falls
 * back to the anchor faceMap). Returns a partial map when detection
 * succeeded but identity match could not cover every character — the
 * caller decides whether to dispatch or block.
 */
export async function resolvePlateFaceIdentities(params: {
  supabase: any;
  sceneId: string;
  projectId: string;
  plateUrl: string;
  plateWidth: number;
  plateHeight: number;
  midDurationSec: number;
  characters: Array<{ characterId: string; portraitUrl: string }>;
}): Promise<PlateIdentityMap | null> {
  const plateMap: PlateFaceMap | null = await detectPlateFaces({
    supabase: params.supabase,
    plateUrl: params.plateUrl,
    plateWidth: params.plateWidth,
    plateHeight: params.plateHeight,
    expectedCount: Math.max(1, params.characters.length),
    sceneId: params.sceneId,
    projectId: params.projectId,
    midDurationSec: params.midDurationSec,
  });
  if (!plateMap || plateMap.faces.length === 0) return null;

  let identityBySlot = new Map<number, { characterId: string; confidence: number }>();
  if (plateMap.frame_url && params.characters.length >= 1 && plateMap.faces.length >= 2) {
    identityBySlot = await askGeminiForPlateIdentity(
      plateMap.frame_url,
      params.characters,
      plateMap.faces,
    );
  } else if (params.characters.length === 1 && plateMap.faces.length >= 1) {
    identityBySlot.set(0, { characterId: params.characters[0].characterId, confidence: 0.9 });
  }

  const faces: PlateIdentityFace[] = plateMap.faces.map((f) => {
    const hit = identityBySlot.get(f.slot);
    return {
      ...f,
      characterId: hit?.characterId ?? null,
      matchConfidence: hit?.confidence,
    };
  });

  // Single-character infer when exactly one slot and one id remain.
  const knownIds = new Set(faces.map((f) => f.characterId).filter(Boolean) as string[]);
  const missingIds = params.characters
    .map((c) => c.characterId)
    .filter((id) => !knownIds.has(id));
  const missingSlots = faces.filter((f) => !f.characterId);
  if (missingIds.length === 1 && missingSlots.length === 1) {
    missingSlots[0].characterId = missingIds[0];
    missingSlots[0].matchConfidence = 0.5;
  }

  const resolvedCount = faces.filter((f) => f.characterId).length;
  return {
    faces,
    width: plateMap.width,
    height: plateMap.height,
    detector: plateMap.detector,
    frame_url: plateMap.frame_url,
    cached: plateMap.cached,
    resolvedCount,
  };
}

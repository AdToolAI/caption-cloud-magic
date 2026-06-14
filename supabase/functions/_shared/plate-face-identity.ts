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
  plateWidth: number,
  plateHeight: number,
): Promise<Map<number, { characterId: string; confidence: number }>> {
  const out = new Map<number, { characterId: string; confidence: number }>();
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey || characters.length === 0 || faces.length === 0) return out;

  // v117 — Use Gemini 2.5 Pro for multi-face (N≥3) identity. Flash routinely
  // returns empty assignments on 4-person Hailuo plates because faces share
  // lighting/wardrobe. Pro is ~5× more expensive (€0.005 vs €0.001/scene)
  // but eliminates the dominant cause of false plate-quality-gate blocks.
  const model = faces.length >= 3
    ? "google/gemini-2.5-pro"
    : "google/gemini-2.5-flash";

  try {
    const ids = characters.map((c) => c.characterId);
    // v117 — real pixel-space bboxes (the old normalization produced nonsense).
    const slotDescriptions = faces
      .map((f) => {
        const [x1, y1, x2, y2] = f.bbox;
        return `slot ${f.slot} at pixel bbox [x=${x1}-${x2}, y=${y1}-${y2}] (center=${f.center[0]},${f.center[1]})`;
      })
      .join("; ");
    const content: any[] = [
      {
        // v117 — corrected: this is ONE still image, not a video.
        type: "text",
        text:
          `IMAGE 1 (below) is a single still frame from a scene of ${plateWidth}×${plateHeight} pixels. ` +
          `It contains ${faces.length} visible human face(s) at these slot positions (sorted left-to-right, slot 0 = left-most): ${slotDescriptions}. ` +
          `IMAGES 2..${characters.length + 1} are reference portraits, one per character, in this exact order: ` +
          ids.map((id, i) => `image ${i + 2} = "${id}"`).join("; ") + ". " +
          `Task: for EACH slot in IMAGE 1, decide which of the ${characters.length} reference portraits matches by facial identity (same person). ` +
          `Return STRICT JSON only — no prose, no markdown fences, no comments. ` +
          `Schema: {"assignments":[{"slot":<int>,"characterId":"<one of the ids>","confidence":<0.0..1.0>}]}. ` +
          `Use ONLY these ids: ${ids.join(", ")}. Never assign the same characterId to two different slots. ` +
          `Prefer making a best-guess assignment over returning null — if forced to choose between two similar candidates, pick the more likely one with confidence ~0.4.`,
      },
      { type: "image_url", image_url: { url: frameUrl } },
      ...characters.map((c) => ({ type: "image_url", image_url: { url: c.portraitUrl } })),
    ];
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[plate-face-identity] gemini ${model} HTTP ${resp.status}`);
      return out;
    }
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    // v117 — greedy brace match: take the LONGEST {...} chunk in case the
    // model wraps JSON in chatty prose.
    const matches = String(txt).match(/\{[\s\S]*\}/g);
    if (!matches || matches.length === 0) {
      console.warn(`[plate-face-identity] gemini ${model} returned no JSON: ${String(txt).slice(0, 200)}`);
      return out;
    }
    const m = matches.sort((a, b) => b.length - a.length)[0];
    let parsed: any;
    try { parsed = JSON.parse(m); } catch (e) {
      console.warn(`[plate-face-identity] gemini ${model} JSON.parse failed: ${(e as Error).message}`);
      return out;
    }
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const seen = new Set<string>();
    if (Array.isArray(parsed?.assignments)) {
      for (const a of parsed.assignments) {
        const slot = Number(a?.slot);
        const cid = typeof a?.characterId === "string" ? a.characterId.toLowerCase().trim() : "";
        const conf = Number(a?.confidence);
        if (!Number.isFinite(slot)) continue;
        if (!cid || !allowed.has(cid) || seen.has(cid)) continue;
        // v117 — threshold relaxed 0.45 → 0.30. sync-3 forgives 10-15px drift;
        // a low-confidence guess is still ~3× safer than the anchor-rescale
        // fallback drifting onto the wrong face.
        if (Number.isFinite(conf) && conf < 0.30) continue;
        seen.add(cid);
        out.set(slot, { characterId: cid, confidence: Number.isFinite(conf) ? conf : 0.6 });
      }
    }
    if (out.size === 0) {
      console.warn(
        `[plate-face-identity] gemini ${model} parsed ok but produced 0 valid assignments — payload: ${m.slice(0, 300)}`,
      );
    }
  } catch (err) {
    console.warn(`[plate-face-identity] gemini call threw: ${(err as Error)?.message}`);
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
  const idTsHint = Math.max(0.2, params.midDurationSec * 0.5);
  if (plateMap.frame_url && params.characters.length >= 1 && plateMap.faces.length >= 2) {
    identityBySlot = await askGeminiForPlateIdentity(
      plateMap.frame_url,
      params.characters,
      plateMap.faces,
      idTsHint,
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

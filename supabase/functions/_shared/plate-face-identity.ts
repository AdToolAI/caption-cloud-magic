/**
 * plate-face-identity.ts
 *
 * Combines `detectPlateFaces` (real face boxes on the RENDERED video plate)
 * with Gemini Vision identity matching against the character portraits.
 *
 * v133 (June 2026) — Per-Character Identity Probe + Hungarian Assignment.
 *
 *   Root cause of "voice swap" bug (characters 1 ↔ 4 vertauscht in
 *   4-speaker scenes): the legacy single-call multi-slot Gemini prompt
 *   suffers from positional bias when 4 visually-similar portraits are
 *   passed in a list. Edge slots (0, N-1) get swapped routinely.
 *
 *   The fix: for N≥3 we now run ONE Gemini call PER character (parallel),
 *   build an N×N confidence matrix, and solve the global-optimal 1:1
 *   assignment with a Hungarian-style brute-force search (N≤6 → ≤720
 *   permutations, instantaneous). A second cross-check Gemini call is
 *   issued when the resulting assignment is ambiguous (min-confidence
 *   < 0.55 or first-vs-second margin < 0.15).
 *
 *   N==2 and N==1 keep the old behaviour: cheap & already-reliable.
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
  /** v133 — Identity-resolution method that produced this map. */
  identityMethod?:
    | "single"
    | "gemini-multi"
    | "per-char-hungarian"
    | "per-char-hungarian+crosscheck"
    | "slot-order"
    | "unknown";
  /** v133 — Minimum confidence across all assigned characters. */
  minConfidence?: number;
  /** v133 — Smallest first-vs-second margin across characters. */
  minMargin?: number;
  /**
   * v133 — True when the resolved mapping is not reliably distinguishable.
   * Caller (compose-dialog-segments) MUST refuse to dispatch and refund
   * instead of risking a voice-swap.
   */
  ambiguous?: boolean;
  /** v133 — Per-character × per-slot confidence matrix (debug). */
  scoreMatrix?: number[][];
  /** v133 — Cross-check Gemini verdict, if invoked. */
  crossCheck?: "confirmed" | "swapped" | "rejected" | "skipped";
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy single-call multi-slot prompt — kept for 2-speaker scenes where
// positional bias is irrelevant and 1 call is cheaper.
// ─────────────────────────────────────────────────────────────────────────────
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

  const model = faces.length >= 3
    ? "google/gemini-2.5-pro"
    : "google/gemini-2.5-flash";

  try {
    const ids = characters.map((c) => c.characterId);
    const slotDescriptions = faces
      .map((f) => {
        const [x1, y1, x2, y2] = f.bbox;
        return `slot ${f.slot} at pixel bbox [x=${x1}-${x2}, y=${y1}-${y2}] (center=${f.center[0]},${f.center[1]})`;
      })
      .join("; ");
    const content: any[] = [
      {
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
      body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[plate-face-identity] gemini ${model} HTTP ${resp.status}`);
      return out;
    }
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const matches = String(txt).match(/\{[\s\S]*\}/g);
    if (!matches || matches.length === 0) return out;
    const m = matches.sort((a, b) => b.length - a.length)[0];
    let parsed: any;
    try { parsed = JSON.parse(m); } catch { return out; }
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const seen = new Set<string>();
    if (Array.isArray(parsed?.assignments)) {
      for (const a of parsed.assignments) {
        const slot = Number(a?.slot);
        const cid = typeof a?.characterId === "string" ? a.characterId.toLowerCase().trim() : "";
        const conf = Number(a?.confidence);
        if (!Number.isFinite(slot)) continue;
        if (!cid || !allowed.has(cid) || seen.has(cid)) continue;
        if (Number.isFinite(conf) && conf < 0.30) continue;
        seen.add(cid);
        out.set(slot, { characterId: cid, confidence: Number.isFinite(conf) ? conf : 0.6 });
      }
    }
  } catch (err) {
    console.warn(`[plate-face-identity] gemini call threw: ${(err as Error)?.message}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// v133 — Per-character probe: for ONE character, score how well each of the
// N detected plate faces matches its portrait. Returns confidence per slot.
// Position-bias-free because every call only sees ONE reference portrait.
// ─────────────────────────────────────────────────────────────────────────────
async function probeCharacterOnPlate(params: {
  frameUrl: string;
  faces: PlateFaceBox[];
  plateWidth: number;
  plateHeight: number;
  characterId: string;
  portraitUrl: string;
}): Promise<Map<number, number>> {
  const scores = new Map<number, number>();
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return scores;

  const slotDescriptions = params.faces
    .map((f) => {
      const [x1, y1, x2, y2] = f.bbox;
      return `slot ${f.slot} [x=${x1}-${x2}, y=${y1}-${y2}]`;
    })
    .join("; ");

  const content: any[] = [
    {
      type: "text",
      text:
        `IMAGE 1 is a still frame of ${params.plateWidth}×${params.plateHeight} pixels containing ${params.faces.length} face(s) at: ${slotDescriptions}. ` +
        `IMAGE 2 is a reference portrait of the SINGLE character we are looking for ("${params.characterId}"). ` +
        `Task: for EACH slot in IMAGE 1, score how likely that slot's face is the SAME PERSON as the portrait. ` +
        `Score 0.0 = clearly different person, 1.0 = clearly same person. ` +
        `Pay attention to facial geometry, eye/nose/jaw shape, distinctive marks. Ignore lighting, expression, angle. ` +
        `Return STRICT JSON only: {"scores":[{"slot":<int>,"score":<0.0..1.0>}]} — one entry per slot, no missing slots.`,
    },
    { type: "image_url", image_url: { url: params.frameUrl } },
    { type: "image_url", image_url: { url: params.portraitUrl } },
  ];

  try {
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[plate-face-identity] probe ${params.characterId} HTTP ${resp.status}`);
      return scores;
    }
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const matches = String(txt).match(/\{[\s\S]*\}/g);
    if (!matches || matches.length === 0) return scores;
    const m = matches.sort((a, b) => b.length - a.length)[0];
    const parsed = JSON.parse(m);
    if (Array.isArray(parsed?.scores)) {
      for (const s of parsed.scores) {
        const slot = Number(s?.slot);
        const score = Number(s?.score);
        if (Number.isFinite(slot) && Number.isFinite(score)) {
          scores.set(slot, Math.min(1, Math.max(0, score)));
        }
      }
    }
  } catch (err) {
    console.warn(`[plate-face-identity] probe ${params.characterId} threw: ${(err as Error)?.message}`);
  }
  return scores;
}

// ─────────────────────────────────────────────────────────────────────────────
// v133 — Brute-force global-optimal assignment (N ≤ 6 → ≤ 720 perms).
// scores[i][j] = confidence that character i belongs to slot j.
// Returns slotOfCharacter[i] = best slot for character i.
// ─────────────────────────────────────────────────────────────────────────────
function optimalAssignment(scores: number[][]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const m = scores[0]?.length ?? 0;
  if (m === 0) return new Array(n).fill(-1);

  let bestPerm: number[] | null = null;
  let bestSum = -Infinity;
  const slots = Array.from({ length: m }, (_, i) => i);

  function permute(picked: number[], remaining: number[]) {
    if (picked.length === n) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += scores[i][picked[i]] ?? 0;
      if (sum > bestSum) {
        bestSum = sum;
        bestPerm = picked.slice();
      }
      return;
    }
    for (let k = 0; k < remaining.length; k++) {
      const s = remaining[k];
      picked.push(s);
      const next = remaining.slice(0, k).concat(remaining.slice(k + 1));
      permute(picked, next);
      picked.pop();
    }
  }
  permute([], slots);
  return bestPerm ?? new Array(n).fill(-1);
}

// ─────────────────────────────────────────────────────────────────────────────
// v133 — Cross-check: confirm the assignment, or report a swap pair.
// ─────────────────────────────────────────────────────────────────────────────
async function crossCheckAssignment(params: {
  frameUrl: string;
  plateWidth: number;
  plateHeight: number;
  faces: PlateFaceBox[];
  assignments: Array<{ slot: number; characterId: string; portraitUrl: string }>;
}): Promise<"confirmed" | { swap: [string, string] } | "rejected"> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return "rejected";

  const slotMap = new Map(params.faces.map((f) => [f.slot, f]));
  const assignDescr = params.assignments
    .map((a) => {
      const f = slotMap.get(a.slot);
      if (!f) return `${a.characterId}→slot${a.slot}(?)`;
      const [x1, y1, x2, y2] = f.bbox;
      return `${a.characterId}→slot${a.slot} [x=${x1}-${x2}, y=${y1}-${y2}]`;
    })
    .join("; ");

  const content: any[] = [
    {
      type: "text",
      text:
        `IMAGE 1 is a still frame of ${params.plateWidth}×${params.plateHeight} pixels. ` +
        `Proposed slot→character assignment: ${assignDescr}. ` +
        `IMAGES 2..${params.assignments.length + 1} are the reference portraits in this order: ` +
        params.assignments.map((a, i) => `image ${i + 2} = "${a.characterId}"`).join("; ") + ". " +
        `Task: verify the assignment by comparing each slot's face to its assigned portrait. ` +
        `Respond STRICT JSON only with ONE of these forms: ` +
        `{"verdict":"confirmed"} | {"verdict":"swap","characterA":"<id>","characterB":"<id>"} | {"verdict":"rejected"}. ` +
        `Use "swap" if exactly two characters are mutually mis-assigned. Use "rejected" if more than two are wrong.`,
    },
    { type: "image_url", image_url: { url: params.frameUrl } },
    ...params.assignments.map((a) => ({ type: "image_url", image_url: { url: a.portraitUrl } })),
  ];

  try {
    const resp = await fetch(LOVABLE_GW, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!resp.ok) return "rejected";
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const matches = String(txt).match(/\{[\s\S]*\}/g);
    if (!matches || matches.length === 0) return "rejected";
    const parsed = JSON.parse(matches.sort((a, b) => b.length - a.length)[0]);
    const verdict = String(parsed?.verdict ?? "").toLowerCase();
    if (verdict === "confirmed") return "confirmed";
    if (verdict === "swap") {
      const a = String(parsed?.characterA ?? "").toLowerCase().trim();
      const b = String(parsed?.characterB ?? "").toLowerCase().trim();
      if (a && b && a !== b) return { swap: [a, b] };
      return "rejected";
    }
    return "rejected";
  } catch (err) {
    console.warn(`[plate-face-identity] crossCheck threw: ${(err as Error)?.message}`);
    return "rejected";
  }
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
  /** v156 — Anchor frame for AWS Rekognition (anchor-first detection). */
  anchorUrl?: string | null;
  /**
   * v184 — Hard hint for the detector, decoupled from `characters.length`.
   * Portraits may fail to resolve (id-format mismatch, deleted character) but
   * the scene still has N speakers and the plate still has N faces. Pass the
   * real speaker count so AWS Rekognition keeps every face instead of pruning
   * to `max(1, characters.length)`.
   */
  expectedFaceCount?: number;
}): Promise<PlateIdentityMap | null> {
  const expected = Math.max(
    1,
    params.expectedFaceCount ?? params.characters.length ?? 1,
  );
  const plateMap: PlateFaceMap | null = await detectPlateFaces({
    supabase: params.supabase,
    plateUrl: params.plateUrl,
    plateWidth: params.plateWidth,
    plateHeight: params.plateHeight,
    expectedCount: expected,
    sceneId: params.sceneId,
    projectId: params.projectId,
    midDurationSec: params.midDurationSec,
    anchorUrl: params.anchorUrl ?? null,
  });
  if (!plateMap || plateMap.faces.length === 0) return null;

  const N = params.characters.length;
  let identityBySlot = new Map<number, { characterId: string; confidence: number }>();
  let identityMethod: PlateIdentityMap["identityMethod"] = "unknown";
  let scoreMatrix: number[][] | undefined;
  let minConfidence = 1;
  let minMargin = 1;
  let crossCheck: PlateIdentityMap["crossCheck"] = "skipped";

  // ── N == 1 ──────────────────────────────────────────────────────────────
  if (N === 1 && plateMap.faces.length >= 1) {
    identityBySlot.set(0, { characterId: params.characters[0].characterId, confidence: 0.9 });
    identityMethod = "single";
    minConfidence = 0.9;
  }
  // ── N == 2 — legacy single-call (positional bias minimal) ──────────────
  else if (N === 2 && plateMap.frame_url) {
    identityBySlot = await askGeminiForPlateIdentity(
      plateMap.frame_url,
      params.characters,
      plateMap.faces,
      plateMap.width,
      plateMap.height,
    );
    identityMethod = "gemini-multi";
    if (identityBySlot.size > 0) {
      const confs = Array.from(identityBySlot.values()).map((v) => v.confidence);
      minConfidence = Math.min(...confs);
    }
  }
  // ── N >= 3 — v133 Per-Character Probe + Hungarian ──────────────────────
  else if (N >= 3 && plateMap.frame_url && plateMap.faces.length >= N) {
    console.log(
      `[plate-face-identity] scene=${params.sceneId} v133_per_char_probe N=${N} faces=${plateMap.faces.length}`,
    );
    const probeResults = await Promise.all(
      params.characters.map((c) =>
        probeCharacterOnPlate({
          frameUrl: plateMap.frame_url!,
          faces: plateMap.faces,
          plateWidth: plateMap.width,
          plateHeight: plateMap.height,
          characterId: c.characterId,
          portraitUrl: c.portraitUrl,
        }),
      ),
    );

    // Build N × M score matrix. Slot indices are the actual face.slot values.
    const slotIds = plateMap.faces.map((f) => f.slot);
    scoreMatrix = probeResults.map((m) => slotIds.map((s) => m.get(s) ?? 0));

    // Sanity: if every probe returned all-zero, fail back to legacy multi-call.
    const allZero = scoreMatrix.every((row) => row.every((v) => v === 0));
    if (allZero) {
      console.warn(
        `[plate-face-identity] scene=${params.sceneId} v133 all-zero probe matrix — falling back to legacy multi-call`,
      );
      identityBySlot = await askGeminiForPlateIdentity(
        plateMap.frame_url,
        params.characters,
        plateMap.faces,
        plateMap.width,
        plateMap.height,
      );
      identityMethod = "gemini-multi";
      if (identityBySlot.size > 0) {
        const confs = Array.from(identityBySlot.values()).map((v) => v.confidence);
        minConfidence = Math.min(...confs);
      }
    } else {
      const slotPickIdx = optimalAssignment(scoreMatrix);
      // Compute confidence + margin per character.
      let minConf = 1;
      let minMar = 1;
      params.characters.forEach((c, i) => {
        const pickIdx = slotPickIdx[i];
        const conf = scoreMatrix![i][pickIdx] ?? 0;
        const sorted = scoreMatrix![i].slice().sort((a, b) => b - a);
        const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0);
        if (conf < minConf) minConf = conf;
        if (margin < minMar) minMar = margin;
        const slotId = slotIds[pickIdx];
        if (slotId != null) {
          identityBySlot.set(slotId, { characterId: c.characterId, confidence: conf });
        }
      });
      identityMethod = "per-char-hungarian";
      minConfidence = minConf;
      minMargin = minMar;

      // v151 — Swap-Hardening:
      //  • N>=4: cross-check IMMER ausführen (Outer-Face-Swaps schleichen
      //    sich bei ähnlicher Wardrobe/Geometrie durch Hungarian durch).
      //  • N==3: schärferer Ambiguity-Gate (0.70/0.25 statt 0.55/0.15).
      const forceCrossCheck = N >= 4;
      const isAmbiguous = forceCrossCheck || minConf < 0.70 || minMar < 0.25;
      if (isAmbiguous) {
        console.warn(
          `[plate-face-identity] scene=${params.sceneId} v151 cross-check engaged (N=${N}, minConf=${minConf.toFixed(2)}, minMargin=${minMar.toFixed(2)}, forced=${forceCrossCheck})`,
        );
        // Build assignment list in slot-sorted order for the cross-check.
        const assignments: Array<{ slot: number; characterId: string; portraitUrl: string }> = [];
        const portraitById = new Map(params.characters.map((c) => [c.characterId.toLowerCase(), c.portraitUrl]));
        for (const [slot, v] of identityBySlot.entries()) {
          const pu = portraitById.get(v.characterId.toLowerCase()) ?? "";
          assignments.push({ slot, characterId: v.characterId, portraitUrl: pu });
        }
        const verdict = await crossCheckAssignment({
          frameUrl: plateMap.frame_url,
          plateWidth: plateMap.width,
          plateHeight: plateMap.height,
          faces: plateMap.faces,
          assignments,
        });
        if (verdict === "confirmed") {
          crossCheck = "confirmed";
          identityMethod = "per-char-hungarian+crosscheck";
        } else if (typeof verdict === "object" && verdict.swap) {
          const [a, b] = verdict.swap;
          let slotA: number | null = null;
          let slotB: number | null = null;
          for (const [slot, v] of identityBySlot.entries()) {
            if (v.characterId.toLowerCase() === a) slotA = slot;
            if (v.characterId.toLowerCase() === b) slotB = slot;
          }
          if (slotA != null && slotB != null) {
            const va = identityBySlot.get(slotA)!;
            const vb = identityBySlot.get(slotB)!;
            identityBySlot.set(slotA, { ...vb });
            identityBySlot.set(slotB, { ...va });
            crossCheck = "swapped";
            identityMethod = "per-char-hungarian+crosscheck";
            console.log(
              `[plate-face-identity] scene=${params.sceneId} v151 cross-check applied swap ${a}↔${b}`,
            );
          } else {
            crossCheck = "rejected";
          }
        } else {
          crossCheck = "rejected";
        }

        // v151 — Tie-Breaker: bei rejected zweite Meinung via Legacy-
        // Multi-Call holen. Wenn Legacy deutlich abweicht (>= 2
        // Slots disagree), übernehmen wir Legacy als dominante Quelle.
        if (crossCheck === "rejected" && N >= 3) {
          console.warn(
            `[plate-face-identity] scene=${params.sceneId} v151 cross-check rejected → legacy multi-call tie-breaker`,
          );
          const legacyMap = await askGeminiForPlateIdentity(
            plateMap.frame_url,
            params.characters,
            plateMap.faces,
            plateMap.width,
            plateMap.height,
          );
          if (legacyMap.size >= N) {
            let agree = 0;
            for (const [slot, v] of legacyMap.entries()) {
              const hung = identityBySlot.get(slot);
              if (hung && hung.characterId.toLowerCase() === v.characterId.toLowerCase()) agree++;
            }
            if (agree < N - 1) {
              identityBySlot = legacyMap;
              identityMethod = "legacy-multi-tiebreak";
              const confs = Array.from(legacyMap.values()).map((v) => v.confidence);
              minConfidence = Math.min(...confs);
              crossCheck = "tiebreak-legacy" as any;
              console.log(
                `[plate-face-identity] scene=${params.sceneId} v151 tiebreak adopted legacy (agree=${agree}/${N})`,
              );
            } else {
              crossCheck = "tiebreak-agree" as any;
              console.log(
                `[plate-face-identity] scene=${params.sceneId} v151 tiebreak kept hungarian (agree=${agree}/${N})`,
              );
            }
          }
        }
      }
    }
  }

  const ambiguousFinal =
    N >= 3 &&
    (crossCheck === "rejected" ||
      (identityMethod === "per-char-hungarian" && (minConfidence < 0.55 || minMargin < 0.15)));

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
    identityMethod,
    minConfidence,
    minMargin,
    ambiguous: ambiguousFinal,
    scoreMatrix,
    crossCheck,
  };
}

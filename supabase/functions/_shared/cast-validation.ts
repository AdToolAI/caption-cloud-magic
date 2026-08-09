import { tl, withLang } from "./i18n.ts";
/**
 * Cast validation for dialog/lip-sync scenes.
 *
 * Rules (per project memory + approved plan):
 *  - max 4 distinct speakers per scene
 *  - same character_id may not appear under two different speaker_idx
 *  - same character_id may not have time-overlapping turns
 *
 * Pure: no DB, no fetch. Both compose-dialog-scene and compose-dialog-segments
 * call this BEFORE any wallet debit so we never charge users for invalid casts.
 */

export type CastReason =
  | "cast_invalid_too_many_speakers"
  | "cast_invalid_duplicate_character"
  | "cast_invalid_overlapping_turns";

export interface CastSpeakerLike {
  character_id?: string | null;
  speaker?: string | null;
  voicedRange?: {
    turns?: Array<{ startSec: number; endSec: number }>;
    startSec?: number;
    endSec?: number;
  } | null;
}

export interface CastValidationResult {
  ok: boolean;
  reason?: CastReason;
  /** Human-readable message safe to surface in toast / clip_error. */
  message?: string;
  /** Speakers / characters involved in the violation (lower-cased ids). */
  offenders?: string[];
}

// FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.6)
// Do NOT raise without a dedicated N=5 hardening pass (multi-portrait
// Nano Banana 2 composition + ASD face-map confidence drop above 4 faces).
const MAX_SPEAKERS = 4;

function turnsOf(sp: CastSpeakerLike): Array<[number, number]> {
  const t = Array.isArray(sp.voicedRange?.turns) ? sp.voicedRange!.turns! : [];
  if (t.length > 0) {
    return t.map((x) => [Number(x.startSec) || 0, Number(x.endSec) || 0]);
  }
  if (sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null) {
    return [[Number(sp.voicedRange.startSec) || 0, Number(sp.voicedRange.endSec) || 0]];
  }
  return [];
}

export function validateCast(speakers: CastSpeakerLike[]): CastValidationResult {
  const list = Array.isArray(speakers) ? speakers : [];

  if (list.length > MAX_SPEAKERS) {
    return {
      ok: false,
      reason: "cast_invalid_too_many_speakers",
      message:
        tl({ de: `Lip-Sync unterstützt maximal ${MAX_SPEAKERS} verschiedene Sprecher pro Szene. `, en: `Lip-sync supports a maximum of ${MAX_SPEAKERS} different speakers per scene.`, es: `La sincronización labial admite un máximo de ${MAX_SPEAKERS} oradores diferentes por escena.` }) +
        tl({ de: `Diese Szene hat ${list.length}. Bitte Cast reduzieren.`, en: `This scene has ${list.length}. Please reduce cast.`, es: `Esta escena tiene ${list.length}. Por favor, reduzca el elenco.` }),
    };
  }

  // Build character_id → [speaker indices] (only when an id is present)
  const idToIdx = new Map<string, number[]>();
  list.forEach((sp, idx) => {
    const cid = String(sp.character_id ?? "").toLowerCase().trim();
    if (!cid) return;
    const arr = idToIdx.get(cid) ?? [];
    arr.push(idx);
    idToIdx.set(cid, arr);
  });

  // Duplicate character_id across speaker slots → not allowed.
  const duplicates: string[] = [];
  for (const [cid, idxs] of idToIdx) {
    if (idxs.length > 1) duplicates.push(cid);
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: "cast_invalid_duplicate_character",
      offenders: duplicates,
      message:
        tl({ de: `Derselbe Charakter darf in einer Szene nicht mehrfach lip-synct werden `, en: `The same character cannot be lip-synced multiple times in one scene`, es: `El mismo personaje no puede ser sincronizado labialmente varias veces en una escena` }) +
        tl({ de: `(${duplicates.join(", ")}). Bitte jedem Sprecher einen anderen Charakter zuweisen.`, en: `(${duplicates.join(", ")}). Please assign a different character to each speaker.`, es: `(${duplicates.join(", ")}). Por favor, asigne un personaje diferente a cada orador.` }),
    };
  }

  // Time-overlap check (within same character_id, even if speaker_idx differs —
  // covers the case where the validator is fed already-deduped speakers but the
  // upstream script accidentally double-booked the same character).
  for (const [cid, idxs] of idToIdx) {
    const all: Array<[number, number]> = [];
    for (const i of idxs) {
      for (const t of turnsOf(list[i])) {
        if (t[1] > t[0]) all.push(t);
      }
    }
    all.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < all.length; i++) {
      const [prevStart, prevEnd] = all[i - 1];
      const [curStart] = all[i];
      if (curStart < prevEnd - 1e-3) {
        return {
          ok: false,
          reason: "cast_invalid_overlapping_turns",
          offenders: [cid],
          message:
            `Charakter "${cid}" hat überlappende Turns ` +
            `(${prevStart.toFixed(2)}-${prevEnd.toFixed(2)}s & ` +
            `${curStart.toFixed(2)}s+). Bitte Skript so anpassen, dass derselbe ` +
            tl({ de: `Charakter nicht gleichzeitig spricht.`, en: `character is not speaking at the same time.`, es: `el personaje no está hablando al mismo tiempo.` }),
        };
      }
    }
  }

  return { ok: true };
}

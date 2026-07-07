/**
 * scene-dialog-turns
 * =============================================================================
 * Backend-only ID-first speaker resolution.
 *
 * Historically the composer parsed "NAME:" prefixes out of the free-text
 * `dialog_script` and fuzzy-matched them against `brand_characters.name` /
 * `character_shots[].characterId`. That was the root cause of wrong-speaker
 * lipsync ("Sprecher 3 sagt was, was nicht im Skript stand") because two
 * characters with similar first names (or a generic `SPRECHER 1` label)
 * collapsed onto the same slot.
 *
 * `composer_scenes.dialog_turns` is now the canonical, ID-referenced turn list:
 *
 *   [{ turnId, characterId, text, mood?, order }]
 *
 * When present, this module returns the effective speaker cast **directly from
 * the IDs**, in first-appearance order — no name matching, no slug parsing.
 * Legacy scenes (empty `dialog_turns`) return `null` here and the caller falls
 * back to its existing name-based resolver.
 *
 * Reads the feature flag `composer.feature.id_only_cast_resolution` from
 * `system_config` (default true). One DB read per compose-video-clips /
 * compose-dialog-segments invocation, cached in `readIdOnlyEnabled`'s closure.
 */

export type DialogTurn = {
  turnId?: string;
  characterId: string;
  text: string;
  mood?: string;
  order?: number;
};

export type EffectiveShot = {
  characterId: string;
  shotType: "full" | "profile" | "back" | "detail" | "pov" | "silhouette" | "absent";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CFG_KEY = "composer.feature.id_only_cast_resolution";

let _flagCache: { value: boolean; ts: number } | null = null;
const FLAG_TTL_MS = 30_000;

/**
 * Reads the ID-only enforcement flag from system_config. Cached 30s per
 * process to avoid a DB roundtrip on every scene. Defaults to `true` when
 * the row is absent or unreadable.
 */
export async function readIdOnlyEnabled(admin: any): Promise<boolean> {
  const now = Date.now();
  if (_flagCache && now - _flagCache.ts < FLAG_TTL_MS) return _flagCache.value;
  try {
    const { data } = await admin
      .from("system_config")
      .select("value")
      .eq("key", CFG_KEY)
      .maybeSingle();
    let val = true;
    if (data?.value !== undefined && data?.value !== null) {
      if (typeof data.value === "boolean") val = data.value;
      else if (typeof data.value === "string") val = data.value.toLowerCase() !== "false";
      else val = Boolean(data.value);
    }
    _flagCache = { value: val, ts: now };
    return val;
  } catch {
    _flagCache = { value: true, ts: now };
    return true;
  }
}

/**
 * Fetch dialog_turns for a batch of scene IDs. Returns a Map<sceneId, turns[]>.
 * Only rows with a non-empty turns array are included in the map (so
 * `map.get(sceneId)` returns `undefined` for legacy scenes that fall back to
 * name matching).
 */
export async function fetchDialogTurnsForScenes(
  admin: any,
  sceneIds: string[],
): Promise<Map<string, DialogTurn[]>> {
  const out = new Map<string, DialogTurn[]>();
  const clean = Array.from(new Set(sceneIds.filter((x) => typeof x === "string" && x)));
  if (clean.length === 0) return out;
  try {
    const { data, error } = await admin
      .from("composer_scenes")
      .select("id, dialog_turns")
      .in("id", clean);
    if (error) {
      console.warn("[scene-dialog-turns] fetch failed:", error.message);
      return out;
    }
    for (const row of data ?? []) {
      const raw = (row as any)?.dialog_turns;
      const arr = normalizeTurns(raw);
      if (arr.length > 0) out.set(String((row as any).id), arr);
    }
  } catch (err) {
    console.warn("[scene-dialog-turns] fetch threw:", (err as any)?.message);
  }
  return out;
}

/**
 * Validate and normalize a raw dialog_turns payload. Turns without a UUID
 * characterId are dropped (they are unusable for ID-first resolution).
 */
export function normalizeTurns(raw: unknown): DialogTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: DialogTurn[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const cid = String((r as any).characterId ?? "").trim();
    if (!cid || !UUID_RE.test(cid)) continue;
    const text = String((r as any).text ?? "").trim();
    // A turn without text is still valid for slot ordering but useless for
    // dispatch — keep it out to match the "speakers who actually speak" rule.
    if (!text) continue;
    out.push({
      turnId: (r as any).turnId ? String((r as any).turnId) : undefined,
      characterId: cid,
      text,
      mood: (r as any).mood ? String((r as any).mood) : undefined,
      order: typeof (r as any).order === "number" ? (r as any).order : undefined,
    });
  }
  // Sort by explicit order when provided, otherwise keep insertion order.
  if (out.every((t) => typeof t.order === "number")) {
    out.sort((a, b) => (a.order! - b.order!));
  }
  return out;
}

/**
 * Deduplicated speaker characterIds in first-appearance order. This is the
 * canonical Slot ordering for compose-dialog-segments (speaker_idx = index
 * in this array).
 */
export function orderedSpeakerIdsFromTurns(turns: DialogTurn[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of turns) {
    if (!seen.has(t.characterId)) {
      seen.add(t.characterId);
      out.push(t.characterId);
    }
  }
  return out;
}

/**
 * Build the effective visual cast (portrait order) from a turns array,
 * preserving the shotType from `characterShots` when a slot exists there and
 * defaulting to `"full"` otherwise.
 *
 * Returns `null` when `turns` is empty — caller should fall back to legacy
 * name resolution.
 */
export function effectiveShotsFromTurns(
  turns: DialogTurn[],
  existingShots: Array<{ characterId: string; shotType: EffectiveShot["shotType"] }>,
): EffectiveShot[] | null {
  if (!turns.length) return null;
  const orderedIds = orderedSpeakerIdsFromTurns(turns);
  const shotTypeById = new Map<string, EffectiveShot["shotType"]>();
  for (const s of existingShots) {
    if (s?.characterId) shotTypeById.set(String(s.characterId), s.shotType ?? "full");
  }
  return orderedIds.map((cid) => ({
    characterId: cid,
    shotType: shotTypeById.get(cid) ?? "full",
  }));
}

/**
 * Speaker slot index for a given turn — the position of the turn's
 * characterId in the deduped ordered speaker list. Deterministic; never
 * depends on parsed names.
 */
export function speakerIdxForTurn(
  turn: DialogTurn,
  orderedSpeakerIds: string[],
): number {
  const i = orderedSpeakerIds.indexOf(turn.characterId);
  return i >= 0 ? i : 0;
}

/** UUID guard exposed for callers. */
export function isBrandCharacterUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

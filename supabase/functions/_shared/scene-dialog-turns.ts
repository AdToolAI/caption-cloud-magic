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

export type DialogTurnsBackfillResult =
  | {
      ok: true;
      turns: DialogTurn[];
      source: "existing" | "jit_backfill";
      matchedCount: number;
    }
  | {
      ok: false;
      reason:
        | "scene_id_missing"
        | "no_dialog_lines"
        | "missing_cast_ids"
        | "brand_character_fetch_failed"
        | "unmatched_speaker"
        | "ambiguous_speaker"
        | "persist_failed";
      details?: Record<string, unknown>;
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

function slugifySpeaker(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");
}

function parseDialogLines(script: unknown): Array<{ speaker: string; speakerSlug: string; text: string }> {
  const s = String(script ?? "").trim();
  if (!s) return [];
  const out: Array<{ speaker: string; speakerSlug: string; text: string }> = [];
  const re = /^\s*\[?([\p{L}][\p{L}\p{N}\s.'-]{0,60}?)\]?\s*(?:[\u2014\u2013-]\s*[\p{L}\s]{1,32})?\s*(?:\[[^\]]{1,32}\])?\s*[:：]\s*(.+)$/u;
  for (const line of s.split(/\r?\n/)) {
    const match = line.match(re);
    if (!match) continue;
    const speaker = String(match[1] ?? "").trim();
    const text = String(match[2] ?? "").trim();
    const speakerSlug = slugifySpeaker(speaker);
    if (speakerSlug && text) out.push({ speaker, speakerSlug, text });
  }
  return out;
}

function collectCastIds(scene: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = String(value ?? "").trim();
    if (UUID_RE.test(id)) ids.add(id);
  };

  const rawShots = (scene as any).character_shots ?? (scene as any).characterShots;
  if (Array.isArray(rawShots)) {
    for (const shot of rawShots) add((shot as any)?.characterId ?? (shot as any)?.character_id);
  }
  const singleShot = (scene as any).character_shot ?? (scene as any).characterShot;
  if (singleShot && typeof singleShot === "object") {
    add((singleShot as any).characterId ?? (singleShot as any).character_id);
  }

  const speakers = (scene as any).audio_plan?.twoshot?.speakers;
  if (Array.isArray(speakers)) {
    for (const speaker of speakers) add((speaker as any)?.character_id ?? (speaker as any)?.characterId);
  }

  return Array.from(ids);
}

function audioSpeakerIdBySlug(scene: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const speakers = (scene as any).audio_plan?.twoshot?.speakers;
  if (!Array.isArray(speakers)) return out;
  for (const speaker of speakers) {
    const id = String((speaker as any)?.character_id ?? (speaker as any)?.characterId ?? "").trim();
    if (!UUID_RE.test(id)) continue;
    const slug = slugifySpeaker((speaker as any)?.speaker_slug ?? (speaker as any)?.speaker);
    if (slug) out.set(slug, id);
  }
  return out;
}

/**
 * Just-in-time canonicalization for legacy scenes.
 *
 * If `dialog_turns` already contains usable UUID turns, it returns them. When
 * turns are empty but the scene has `dialog_script` + Cast & World IDs, it
 * deterministically maps every `NAME:` line to a brand_character UUID and
 * persists the result. It never returns a partial turn list: any unmatched or
 * ambiguous speaker is a hard block so callers do not fall back to fuzzy names.
 */
export async function ensureDialogTurnsForScene(
  admin: any,
  scene: Record<string, unknown>,
): Promise<DialogTurnsBackfillResult> {
  const existing = normalizeTurns((scene as any).dialog_turns ?? (scene as any).dialogTurns);
  if (existing.length > 0) {
    return { ok: true, turns: existing, source: "existing", matchedCount: existing.length };
  }

  const sceneId = String((scene as any).id ?? "").trim();
  if (!sceneId) return { ok: false, reason: "scene_id_missing" };

  const lines = parseDialogLines((scene as any).dialog_script ?? (scene as any).dialogScript);
  if (lines.length === 0) return { ok: false, reason: "no_dialog_lines" };

  const castIds = collectCastIds(scene);
  if (castIds.length === 0) {
    return { ok: false, reason: "missing_cast_ids", details: { dialog_lines: lines.length } };
  }

  let rows: Array<{ id: string; name: string }> = [];
  try {
    const { data, error } = await admin
      .from("brand_characters")
      .select("id, name")
      .in("id", castIds);
    if (error) throw error;
    rows = (data ?? []).map((row: any) => ({ id: String(row.id), name: String(row.name ?? "") }));
  } catch (error) {
    return {
      ok: false,
      reason: "brand_character_fetch_failed",
      details: { message: (error as any)?.message ?? String(error) },
    };
  }

  if (rows.length === 0) {
    return { ok: false, reason: "missing_cast_ids", details: { cast_ids: castIds } };
  }

  const audioSlugMap = audioSpeakerIdBySlug(scene);
  const nameBySlug = new Map<string, string>();
  const firstNameBuckets = new Map<string, string[]>();
  for (const row of rows) {
    const fullSlug = slugifySpeaker(row.name);
    if (fullSlug) nameBySlug.set(fullSlug, row.id);
    const first = fullSlug.split("-")[0];
    if (first) firstNameBuckets.set(first, [...(firstNameBuckets.get(first) ?? []), row.id]);
  }

  const turns: DialogTurn[] = [];
  for (let order = 0; order < lines.length; order++) {
    const line = lines[order];
    let characterId = audioSlugMap.get(line.speakerSlug) ?? nameBySlug.get(line.speakerSlug) ?? null;
    if (!characterId) {
      const first = line.speakerSlug.split("-")[0];
      const candidates = firstNameBuckets.get(first) ?? [];
      if (candidates.length === 1) {
        characterId = candidates[0];
      } else if (candidates.length > 1) {
        return {
          ok: false,
          reason: "ambiguous_speaker",
          details: { speaker: line.speaker, speaker_slug: line.speakerSlug, candidates },
        };
      }
    }
    if (!characterId) {
      return {
        ok: false,
        reason: "unmatched_speaker",
        details: {
          speaker: line.speaker,
          speaker_slug: line.speakerSlug,
          available: rows.map((r) => ({ id: r.id, name: r.name })),
        },
      };
    }
    turns.push({
      turnId: crypto.randomUUID(),
      characterId,
      text: line.text,
      order,
    });
  }

  try {
    const { error } = await admin
      .from("composer_scenes")
      .update({ dialog_turns: turns })
      .eq("id", sceneId);
    if (error) throw error;
  } catch (error) {
    return {
      ok: false,
      reason: "persist_failed",
      details: { message: (error as any)?.message ?? String(error) },
    };
  }

  console.log(
    `[scene-dialog-turns] v201_dialog_turns_jit_backfill scene=${sceneId} turns=${turns.length} cast=[${orderedSpeakerIdsFromTurns(turns).join(",")}]`,
  );
  return { ok: true, turns, source: "jit_backfill", matchedCount: turns.length };
}

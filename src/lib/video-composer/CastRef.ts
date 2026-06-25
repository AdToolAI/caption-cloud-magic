/**
 * CastRef — typed value object that **separates Character from Outfit**.
 *
 * Why this exists
 * ─────────────────────────────────────────────────────────────────────
 * Before: a single string field (`characterId`) carried either a base
 * `brand_characters.id` UUID or a prefixed mention key like
 * `outfit:<lookId>` / `catalog:<lookId>` / `lib:<id>`. The lipsync
 * pipeline (Sync.so v169) compares strictly against the BASE avatar UUID,
 * so any prefix silently broke the v153/v166 identity-bridge and the
 * anchor face map. We patched it with defensive `stripPrefix` calls
 * in many places — but every new consumer could re-introduce the bug.
 *
 * Now: outfit lives on its own field, and the type system rejects
 * `"outfit:xxx"` strings in `characterId`. Same end state, compiler-
 * enforced.
 *
 *     {
 *       characterId:  "uuid-of-samuel"   // ALWAYS brand_characters.id
 *       outfitLookId: "uuid-of-look"     // optional, avatar_outfit_looks.id
 *       displayName:  "Samuel — Casual"  // human label for the UI
 *       voiceId:      "elevenlabs-..."   // optional
 *     }
 *
 * Legacy data (plans/scenes with `"outfit:xxx"` characterIds) is
 * migrated on-read via `legacyCastIdToRef()`.
 */

export type CastRef = {
  /** Base brand_characters.id. Never prefixed. */
  characterId: string;
  /** Optional avatar_outfit_looks.id selection. */
  outfitLookId?: string | null;
  /** Human-facing label, e.g. "Samuel — Casual". */
  displayName: string;
  /** Optional ElevenLabs voice id. */
  voiceId?: string | null;
};

/** Type guard. */
export function isCastRef(v: unknown): v is CastRef {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as any).characterId === 'string' &&
    (v as any).characterId.length > 0 &&
    typeof (v as any).displayName === 'string'
  );
}

/** Stable key for React lists / dedup maps. */
export function castRefKey(r: CastRef): string {
  return `${r.characterId}::${r.outfitLookId ?? '_'}`;
}

/**
 * Strip any legacy mention-library prefix from a raw character ID string
 * and return the base UUID portion. Pure — no DB lookup.
 *
 *   "outfit:<uuid>"  → "<uuid>"  (NOTE: returns the LOOK id, not avatar)
 *   "catalog:..."    → "..."
 *   "lib:<uuid>"     → "<uuid>"
 *   "<uuid>"         → "<uuid>"
 *
 * For `outfit:` / `catalog:` IDs the **avatar** UUID is in the
 * `avatar_outfit_looks` row — use `legacyCastIdToRef` for the full
 * async resolution.
 */
export function stripLegacyCastIdPrefix(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith('lib:')) return t.slice(4) || null;
  if (t.startsWith('outfit:') || t.startsWith('catalog:')) {
    return t.split(':', 2)[1] || null;
  }
  return t;
}

/** True when the raw ID carried a known legacy prefix. */
export function isLegacyPrefixedCastId(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return /^(outfit|catalog|lib):/.test(raw);
}

/**
 * Async migration helper for an old plan/scene that stored a prefixed
 * `characterId` string. Resolves the avatar UUID via the supplied
 * outfit-look map and returns a fresh `CastRef`. When the look isn't
 * found, returns `null` (caller decides whether to surface as unresolved).
 *
 * @param raw             Raw legacy id (`"outfit:<lookId>"`, `"<uuid>"`, …)
 * @param outfitLookMap   `Map<lookId, { avatarId, lookName? }>`
 * @param displayFallback Used when no name is available.
 */
export function legacyCastIdToRef(
  raw: string | null | undefined,
  outfitLookMap: Map<string, { avatarId: string; lookName?: string; avatarName?: string }>,
  displayFallback = 'Character',
): CastRef | null {
  if (!raw) return null;
  if (isLegacyPrefixedCastId(raw)) {
    const lookId = stripLegacyCastIdPrefix(raw);
    if (!lookId) return null;
    const hit = outfitLookMap.get(lookId);
    if (!hit) return null;
    return {
      characterId: hit.avatarId,
      outfitLookId: raw.startsWith('outfit:') ? lookId : null,
      displayName: hit.lookName
        ? `${hit.avatarName ?? displayFallback} — ${hit.lookName}`
        : (hit.avatarName ?? displayFallback),
    };
  }
  return { characterId: raw, displayName: displayFallback };
}

/**
 * resolveCharacterId
 * --------------------------------------------------------------
 * Normalizes any raw `characterId` reference into the base
 * `brand_characters.id` UUID. Studio Director and the unified
 * mention library can emit prefixed IDs:
 *
 *   • `outfit:<lookId>`   → look up `avatar_outfit_looks.avatar_id`
 *   • `catalog:<lookId>`  → same lookup table for now
 *   • `lib:<id>`          → strip prefix, use as-is
 *   • `<uuid>`            → returned unchanged
 *
 * Plate-side pipelines (Cinematic-Sync anchor, Cast Consistency Map)
 * compare strictly against `brand_characters.id`, so a prefixed ID
 * silently becomes "absent" and the lipsync anchor fails. This helper
 * is the single source of truth for that normalization on the client.
 *
 * NOTE: This is a pure function — no DB calls. Callers pass the lookup
 * map they already have (typically from `useUnifiedMentionLibrary` or
 * an outfit-looks query). When the map is missing or the look isn't
 * found, the function returns `null` so callers can fall back gracefully.
 */

export type OutfitLookMap = Map<string, string>; // lookId -> avatarId (= brand_characters.id)

/**
 * Resolves a raw characterId reference to the base brand_characters.id.
 * Returns `null` when the input is empty, malformed, or the look cannot
 * be resolved against the provided map.
 */
export function resolveCharacterId(
  rawId: string | null | undefined,
  outfitLookToAvatar?: OutfitLookMap,
): string | null {
  if (!rawId || typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('outfit:') || trimmed.startsWith('catalog:')) {
    const lookId = trimmed.split(':', 2)[1] ?? '';
    if (!lookId) return null;
    const avatarId = outfitLookToAvatar?.get(lookId);
    return avatarId ?? null;
  }

  if (trimmed.startsWith('lib:')) {
    return trimmed.slice(4) || null;
  }

  return trimmed;
}

/** True when the raw ID needed normalization (i.e. carried a known prefix). */
export function isPrefixedCharacterId(rawId: string | null | undefined): boolean {
  if (!rawId) return false;
  return /^(outfit|catalog|lib):/.test(rawId);
}

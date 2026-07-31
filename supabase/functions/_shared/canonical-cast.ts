/**
 * Server-side canonical cast de-duplication (v318).
 *
 * Mirror of `src/lib/video-composer/canonicalCastId.ts`. A scene can carry two
 * cast slots for the SAME person (UUID slot + slug slot such as
 * "samuel-dusatko"). Downstream that means:
 *   - the anchor composer burns two portrait slots on one face → visible clone
 *   - the Sync.so router builds a ghost speaker pass (wasted credits, one
 *     character never moves its lips)
 *
 * Use `dedupeCharacterShots()` before portrait composition and before pass
 * calculation. Slots whose id is neither a known UUID nor resolvable to a
 * cast member are DROPPED (they can never anchor a real face).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CastPoolEntry {
  id: string;
  name?: string | null;
  /**
   * v320 — Cast & World is the ONLY character source. Briefing rows keep a
   * readable slug in `id` and the real `brand_characters` UUID here; when
   * present that UUID is the canonical identity.
   */
  brandCharacterId?: string | null;
  aliasIds?: readonly string[] | null;
}

/** Canonical id of a pool entry: the Cast & World UUID when linked. */
export function canonicalPoolId(entry: CastPoolEntry): string {
  const brandId = String(entry?.brandCharacterId ?? '').trim();
  return UUID_RE.test(brandId) ? brandId : entry.id;
}

export interface CastSlotLike {
  characterId?: string | null;
  characterName?: string | null;
  name?: string | null;
  shotType?: string | null;
  outfitLookId?: string | null;
  referenceImageUrl?: string | null;
  actionEn?: string | null;
  actionUser?: string | null;
  [k: string]: unknown;
}

function norm(v: unknown): string {
  return String(v ?? '').toLowerCase().trim().replace(/[-_\s]+/g, '');
}

function firstNameNorm(name: unknown): string {
  const parts = String(name ?? '').toLowerCase().trim().split(/\s+/);
  return norm(parts[0] ?? '');
}

/** `lookId → avatar (brand_characters) id`, from `avatar_outfit_looks`. */
export type OutfitLookMap = ReadonlyMap<string, string>;

/**
 * Strip legacy slot prefixes (`lib:`, `outfit:<lookId>`, `catalog:<lookId>`)
 * and return the base id plus the outfit look it referenced (v319).
 */
export function splitCastSlotId(
  raw: string | null | undefined,
  outfitLookMap?: OutfitLookMap,
): { base: string; outfitLookId: string | null } {
  const t = String(raw ?? '').trim();
  if (!t) return { base: '', outfitLookId: null };
  if (t.startsWith('lib:')) return { base: t.slice(4).trim(), outfitLookId: null };
  if (t.startsWith('outfit:') || t.startsWith('catalog:')) {
    const lookId = (t.split(':', 2)[1] ?? '').trim();
    if (!lookId) return { base: '', outfitLookId: null };
    const avatarId = outfitLookMap?.get(lookId) ?? '';
    return {
      base: avatarId || t,
      outfitLookId: t.startsWith('outfit:') ? lookId : null,
    };
  }
  return { base: t, outfitLookId: null };
}

export function resolveCanonicalCharacterId(
  slotId: string | null | undefined,
  pool: readonly CastPoolEntry[] | undefined,
  outfitLookMap?: OutfitLookMap,
): string | null {
  const raw = splitCastSlotId(slotId, outfitLookMap).base;
  if (!raw || !pool?.length) return null;

  const exact = pool.find(
    (c) => c.id === raw || c.brandCharacterId === raw || c.aliasIds?.includes(raw),
  );
  if (exact) {
    // If legacy duplicate UUID rows are present, the first same-name Cast &
    // World entry is the canonical winner for every duplicate.
    const sameNameWinner = exact.name
      ? pool.find((c) => norm(c.name) === norm(exact.name))
      : undefined;
    return canonicalPoolId(sameNameWinner ?? exact);
  }

  const needle = norm(raw);
  if (!needle) return null;


  const byName = pool.find((c) => norm(c.name) === needle);
  if (byName) return canonicalPoolId(byName);

  const byNameInId = pool.find((c) => {
    const full = norm(c.name);
    return !!full && full.length >= 4 && needle.includes(full);
  });
  if (byNameInId) return canonicalPoolId(byNameInId);

  if (UUID_RE.test(raw)) return null;
  const first = pool.filter((c) => {
    const f = firstNameNorm(c.name);
    return !!f && f.length >= 3 && needle.includes(f);
  });
  if (first.length === 1) return canonicalPoolId(first[0]);

  return null;
}

const SHOT_SPECIFICITY: Record<string, number> = {
  absent: 0,
  silhouette: 1,
  back: 1,
  full: 2,
  profile: 3,
  pov: 4,
  detail: 5,
};

function rank(shotType: unknown): number {
  return SHOT_SPECIFICITY[String(shotType ?? 'full')] ?? 2;
}

function mergeSlots<T extends CastSlotLike>(existing: T, incoming: T): T {
  const base = rank(incoming.shotType) > rank(existing.shotType) ? incoming : existing;
  const other = base === incoming ? existing : incoming;
  const pick = (k: keyof CastSlotLike) => (base[k] ?? other[k]) as any;
  return {
    ...other,
    ...base,
    shotType: base.shotType,
    characterName: pick('characterName'),
    name: pick('name'),
    outfitLookId: pick('outfitLookId'),
    referenceImageUrl: pick('referenceImageUrl'),
    actionEn: pick('actionEn'),
    actionUser: pick('actionUser'),
  } as T;
}

/**
 * Collapse cast slots that resolve to the same person.
 *
 * @param dropUnresolvable when true (default), slots that cannot be resolved
 *   against the pool are removed — they would only produce ghost faces.
 */
export function dedupeCharacterShots<T extends CastSlotLike>(
  shots: T[] | null | undefined,
  pool: readonly CastPoolEntry[] | undefined,
  dropUnresolvable = true,
  outfitLookMap?: OutfitLookMap,
): T[] {
  const input = Array.isArray(shots) ? shots : [];
  if (input.length === 0) return [];

  const order: string[] = [];
  const byKey = new Map<string, T>();

  for (const slot of input) {
    if (!slot) continue;
    const split = splitCastSlotId(slot.characterId, outfitLookMap);
    const canon = resolveCanonicalCharacterId(slot.characterId, pool, outfitLookMap);
    if (!canon) {
      if (dropUnresolvable) continue;
      const fallbackKey = (split.base || String(slot.characterId ?? '')).toLowerCase().trim();
      if (!fallbackKey) continue;
      if (!byKey.has(fallbackKey)) {
        byKey.set(fallbackKey, slot);
        order.push(fallbackKey);
      }
      continue;
    }
    const normalized = (canon !== slot.characterId
      ? {
          ...slot,
          characterId: canon,
          outfitLookId: slot.outfitLookId ?? split.outfitLookId ?? null,
        }
      : slot) as T;

    const existing = byKey.get(canon);
    if (!existing) {
      byKey.set(canon, normalized);
      order.push(canon);
      continue;
    }
    byKey.set(canon, mergeSlots(existing, normalized));
  }

  return order.flatMap((k) => {
    const slot = byKey.get(k);
    return slot ? [slot] : [];
  });
}

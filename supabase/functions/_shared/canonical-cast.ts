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

export function resolveCanonicalCharacterId(
  slotId: string | null | undefined,
  pool: readonly CastPoolEntry[] | undefined,
): string | null {
  const raw = String(slotId ?? '').trim();
  if (!raw || !pool?.length) return null;

  const exact = pool.find((c) => c.id === raw);
  if (exact) return exact.id;

  const needle = norm(raw);
  if (!needle) return null;

  const byName = pool.find((c) => norm(c.name) === needle);
  if (byName) return byName.id;

  const byNameInId = pool.find((c) => {
    const full = norm(c.name);
    return !!full && full.length >= 4 && needle.includes(full);
  });
  if (byNameInId) return byNameInId.id;

  if (UUID_RE.test(raw)) return null;
  const first = pool.filter((c) => {
    const f = firstNameNorm(c.name);
    return !!f && f.length >= 3 && needle.includes(f);
  });
  if (first.length === 1) return first[0].id;

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
): T[] {
  const input = Array.isArray(shots) ? shots : [];
  if (input.length === 0) return [];

  const order: string[] = [];
  const byKey = new Map<string, T>();

  for (const slot of input) {
    if (!slot) continue;
    const canon = resolveCanonicalCharacterId(slot.characterId, pool);
    if (!canon) {
      if (dropUnresolvable) continue;
      const fallbackKey = String(slot.characterId ?? '').toLowerCase().trim();
      if (!fallbackKey) continue;
      if (!byKey.has(fallbackKey)) {
        byKey.set(fallbackKey, slot);
        order.push(fallbackKey);
      }
      continue;
    }
    const normalized = (canon !== slot.characterId
      ? { ...slot, characterId: canon }
      : slot) as T;
    const existing = byKey.get(canon);
    if (!existing) {
      byKey.set(canon, normalized);
      order.push(canon);
      continue;
    }
    byKey.set(canon, mergeSlots(existing, normalized));
  }

  return order.map((k) => byKey.get(k)!);
}

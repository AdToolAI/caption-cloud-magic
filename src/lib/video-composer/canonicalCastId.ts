/**
 * Canonical cast identity resolution + de-duplication.
 *
 * Root cause this solves (v318):
 * A scene can end up with TWO cast slots for the SAME person, e.g.
 *   [{ characterId: "483f9cdc-…" }, { characterId: "samuel-dusatko" }]
 * because some upstream writers emit a slug instead of the brand_characters
 * UUID. Every consumer compares raw `characterId` strings, so the duplicate
 * survives: the UI renders two identical chips, the anchor composer burns two
 * portrait slots on the same face (→ visible clone/doppelganger) and the
 * lip-sync router builds a ghost speaker pass.
 *
 * All cast handling should route slot ids through `resolveCanonicalCharacterId`
 * and collapse arrays with `dedupeCharacterShots`.
 */

import type { CharacterShot, ComposerCharacter } from '@/types/video-composer';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CharacterLike = { id: string; name?: string | null };

/** `lookId → avatar (brand_characters) id` — see `useOutfitLookMap()`. */
export type OutfitLookMap = ReadonlyMap<string, string>;

export interface CanonicalCastOptions {
  /** Resolves `outfit:<lookId>` / `catalog:<lookId>` refs to the avatar UUID. */
  outfitLookMap?: OutfitLookMap;
}

function norm(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/[-_\s]+/g, '');
}

function firstNameNorm(name: unknown): string {
  const parts = String(name ?? '').toLowerCase().trim().split(/\s+/);
  return norm(parts[0] ?? '');
}

/**
 * Split a raw slot id into its base reference and (when the id carried an
 * `outfit:` / `catalog:` prefix) the look id it encoded.
 *
 * v319 — the cast invariant is `{ characterId: <avatar UUID>, outfitLookId? }`.
 * Legacy writers emitted the look inside the id, which made the SAME person
 * look like two different cast members.
 */
export function splitCastSlotId(
  raw: string | null | undefined,
  opts?: CanonicalCastOptions,
): { base: string; outfitLookId: string | null } {
  const t = String(raw ?? '').trim();
  if (!t) return { base: '', outfitLookId: null };
  if (t.startsWith('lib:')) return { base: t.slice(4).trim(), outfitLookId: null };
  if (t.startsWith('outfit:') || t.startsWith('catalog:')) {
    const lookId = (t.split(':', 2)[1] ?? '').trim();
    if (!lookId) return { base: '', outfitLookId: null };
    const avatarId = opts?.outfitLookMap?.get(lookId) ?? '';
    // Without the map we cannot reach the avatar — keep the look so callers can
    // retry once the map arrives, and expose the look id either way.
    return {
      base: avatarId || t,
      outfitLookId: t.startsWith('outfit:') ? lookId : null,
    };
  }
  return { base: t, outfitLookId: null };
}

/**
 * Resolve a (possibly drifted or prefixed) slot id to the canonical character
 * id from the pool. Returns `null` when nothing matches.
 */
export function resolveCanonicalCharacterId(
  slotId: string | undefined | null,
  pool: readonly CharacterLike[] | undefined,
  opts?: CanonicalCastOptions,
): string | null {
  const { base } = splitCastSlotId(slotId, opts);
  const raw = base;
  if (!raw) return null;

  // An outfit ref resolved through the look map is authoritative even when the
  // avatar isn't in the (possibly incomplete) pool.
  const viaLook =
    raw !== String(slotId ?? '').trim() && UUID_RE.test(raw) ? raw : null;

  if (!pool?.length) return viaLook;

  // 1. Exact id match (fast path, also the UUID case).
  const exact = pool.find((c) => c.id === raw);
  if (exact) return exact.id;

  const needle = norm(raw);
  if (!needle) return viaLook;

  // 2. Full-name match, ignoring separators ("samuel-dusatko" → "Samuel Dusatko").
  const byName = pool.find((c) => norm(c.name) === needle);
  if (byName) return byName.id;

  // 3. Name contained in the id ("lib:samuel-dusatko-42", "@samueldusatko").
  const byNameInId = pool.find((c) => {
    const full = norm(c.name);
    return !!full && full.length >= 4 && needle.includes(full);
  });
  if (byNameInId) return byNameInId.id;

  // 4. Last resort: unique first-name hit (never for UUID-shaped ids —
  //    a UUID must match exactly or not at all).
  if (UUID_RE.test(raw)) return viaLook;
  const first = pool.filter((c) => {
    const f = firstNameNorm(c.name);
    return !!f && f.length >= 3 && needle.includes(f);
  });
  if (first.length === 1) return first[0].id;

  return viaLook;
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

function mergeSlots(existing: CharacterShot, incoming: CharacterShot): CharacterShot {
  const base = rank(incoming.shotType) > rank(existing.shotType) ? incoming : existing;
  const other = base === incoming ? existing : incoming;
  const pick = <K extends keyof CharacterShot>(k: K): CharacterShot[K] =>
    (base[k] ?? other[k]) as CharacterShot[K];
  return {
    ...other,
    ...base,
    shotType: base.shotType,
    characterName: pick('characterName' as any) as any,
    // `name` is a legacy mirror of characterName on some rows.
    ...(('name' in base || 'name' in other)
      ? { name: ((base as any).name ?? (other as any).name) }
      : {}),
    outfitLookId: pick('outfitLookId' as any) as any,
    referenceImageUrl: pick('referenceImageUrl' as any) as any,
    actionEn: pick('actionEn' as any) as any,
    actionUser: pick('actionUser' as any) as any,
  } as CharacterShot;
}

/**
 * Normalize a single slot to the canonical shape
 * `{ characterId: <avatar UUID>, outfitLookId?: <lookId> }`.
 * Returns the SAME object when nothing changes.
 */
export function normalizeCharacterShot(
  slot: CharacterShot,
  pool: readonly CharacterLike[] | undefined,
  opts?: CanonicalCastOptions,
): CharacterShot {
  if (!slot) return slot;
  const { outfitLookId } = splitCastSlotId(slot.characterId, opts);
  const canon = resolveCanonicalCharacterId(slot.characterId, pool, opts);
  const nextId = canon ?? slot.characterId;
  const nextLook = (slot as any).outfitLookId ?? outfitLookId ?? undefined;
  const idChanged = nextId !== slot.characterId;
  const lookChanged = nextLook !== (slot as any).outfitLookId && !!nextLook;
  if (!idChanged && !lookChanged) return slot;
  return {
    ...slot,
    characterId: nextId,
    ...(nextLook ? { outfitLookId: nextLook } : {}),
  } as CharacterShot;
}

/**
 * Collapse cast slots that resolve to the same person and rewrite drifted ids
 * to the canonical UUID (including `outfit:` / `catalog:` / `lib:` refs — the
 * encoded look is preserved in `outfitLookId`).
 *
 * Idempotent: returns the SAME array reference when nothing changes, so it is
 * safe inside `useEffect` / render paths.
 */
export function dedupeCharacterShots(
  shots: CharacterShot[] | undefined,
  pool: readonly CharacterLike[] | undefined,
  opts?: CanonicalCastOptions,
): CharacterShot[] {
  const input = shots ?? [];
  if (input.length === 0) return input;
  if (input.length === 1) {
    const only = input[0];
    if (!only) return input;
    const normalized = normalizeCharacterShot(only, pool, opts);
    return normalized === only ? input : [normalized];
  }

  const order: string[] = [];
  const byKey = new Map<string, CharacterShot>();
  let changed = false;

  for (const slot of input) {
    if (!slot) {
      changed = true;
      continue;
    }
    const normalized = normalizeCharacterShot(slot, pool, opts);
    if (normalized !== slot) changed = true;

    // Unresolvable slots keep their raw id but are still deduped on it.
    const key = String(normalized.characterId ?? '').toLowerCase().trim();
    if (!key) {
      changed = true;
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      order.push(key);
      continue;
    }
    changed = true;
    byKey.set(key, mergeSlots(existing, normalized));
  }

  if (!changed) return input;
  return order.map((k) => byKey.get(k)!);
}

/** True when at least two slots resolve to the same person. */
export function hasDuplicateCast(
  shots: CharacterShot[] | undefined,
  pool: readonly CharacterLike[] | undefined,
  opts?: CanonicalCastOptions,
): boolean {
  const deduped = dedupeCharacterShots(shots, pool, opts);
  return deduped.length < (shots?.length ?? 0);
}


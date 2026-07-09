/**
 * Deduplicates cast slots inside a production-plan scene.
 *
 * Two slots are considered the same when they resolve to the same
 * `characterId` (case-insensitive). Slots without `characterId` are compared
 * by a normalized `mentionKey`/`characterName` fallback.
 *
 * Merge rules:
 * - Prefer the first slot with `characterId` set.
 * - Fill missing `voiceId`, `voiceName`, `shotType`, `outfit`,
 *   `referenceImageUrl`, `characterName` from later duplicates.
 * - Never mutate the input; returns a new array (or the same reference when
 *   nothing changed — safe for React deps).
 */

export interface PlanCastSlot {
  mentionKey?: string;
  characterId?: string | null;
  characterName?: string | null;
  shotType?: string;
  voiceId?: string | null;
  voiceName?: string | null;
  voiceAutoAssigned?: boolean;
  outfit?: string | null;
  outfitLookId?: string | null;
  referenceImageUrl?: string | null;
  [k: string]: unknown;
}

import { normalizeAssetKey } from './assetKeyUtils';

function keyOf(c: PlanCastSlot): string {
  const id = typeof c?.characterId === 'string' ? c.characterId.toLowerCase().trim() : '';
  if (id) return `id:${id}`;
  const fallback = normalizeAssetKey(c?.mentionKey || c?.characterName || '');
  return fallback ? `mk:${fallback}` : '';
}

function mergeInto<T extends PlanCastSlot>(base: T, extra: T): T {
  const merged: T = { ...base };
  if (!merged.characterId && extra.characterId) merged.characterId = extra.characterId;
  if (!merged.characterName && extra.characterName) merged.characterName = extra.characterName;
  if (!merged.voiceId && extra.voiceId) merged.voiceId = extra.voiceId;
  if (!merged.voiceName && extra.voiceName) merged.voiceName = extra.voiceName;
  if (merged.voiceAutoAssigned == null && extra.voiceAutoAssigned != null) {
    merged.voiceAutoAssigned = extra.voiceAutoAssigned;
  }
  if (!merged.shotType && extra.shotType) merged.shotType = extra.shotType;
  if (!merged.outfit && extra.outfit) merged.outfit = extra.outfit;
  if (!merged.outfitLookId && extra.outfitLookId) merged.outfitLookId = extra.outfitLookId;
  if (!merged.referenceImageUrl && extra.referenceImageUrl) {
    merged.referenceImageUrl = extra.referenceImageUrl;
  }
  return merged;
}

export interface DedupResult<T extends PlanCastSlot> {
  cast: T[];
  removed: number;
}

export function dedupePlanSceneCast<T extends PlanCastSlot>(cast: T[] | undefined | null): DedupResult<T> {
  const input = Array.isArray(cast) ? cast : [];
  if (input.length < 2) return { cast: input as T[], removed: 0 };

  // Pass 1 — prefer slots that already carry a characterId.
  const ordered = input
    .map((slot, idx) => ({ slot, idx, hasId: !!slot?.characterId }))
    .sort((a, b) => {
      if (a.hasId !== b.hasId) return a.hasId ? -1 : 1;
      return a.idx - b.idx;
    });

  const byKey = new Map<string, { slot: T; originalIdx: number }>();
  const noKey: { slot: T; originalIdx: number }[] = [];

  for (const { slot, idx } of ordered) {
    const key = keyOf(slot);
    if (!key) {
      noKey.push({ slot, originalIdx: idx });
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { slot, originalIdx: idx });
    } else {
      existing.slot = mergeInto(existing.slot, slot);
    }
  }

  const combined = [...byKey.values(), ...noKey].sort((a, b) => a.originalIdx - b.originalIdx);
  const out = combined.map((x) => x.slot);
  const removed = input.length - out.length;
  return { cast: removed > 0 ? out : (input as T[]), removed };
}

export function dedupePlanScenesCast<S extends { cast?: PlanCastSlot[] }>(scenes: S[] | undefined | null): {
  scenes: S[];
  removed: number;
} {
  const list = Array.isArray(scenes) ? scenes : [];
  if (list.length === 0) return { scenes: list, removed: 0 };
  let removed = 0;
  let changed = false;
  const next = list.map((sc) => {
    const res = dedupePlanSceneCast(sc?.cast);
    if (res.removed > 0) {
      removed += res.removed;
      changed = true;
      return { ...sc, cast: res.cast };
    }
    return sc;
  });
  return { scenes: changed ? next : list, removed };
}

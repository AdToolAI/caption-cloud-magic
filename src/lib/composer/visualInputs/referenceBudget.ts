/**
 * referenceBudget.ts — weighted selection of references.
 *
 * referenceScore = sceneRelevance × continuityImportance × identityImportance
 *                  × providerCompatibility
 *
 * A character that does not appear in THIS scene drops out, even when it is a
 * globally important anchor. Protected references always survive the cut.
 */

import type { VisualInputProfile, VisualReference } from './types';

const clamp01 = (n: number | undefined, fallback = 1): number => {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
  return Math.min(1, Math.max(0, n));
};

export function providerCompatibility(ref: VisualReference, profile: VisualInputProfile): number {
  if (ref.kind === 'video') return (profile.references.videos ?? 0) > 0 ? 1 : 0;
  if (ref.role === 'character') return profile.references.character === false ? 0.2 : 1;
  if (ref.role === 'product') return profile.references.product === false ? 0.2 : 1;
  if (ref.role === 'location') return profile.references.location === false ? 0.2 : 1;
  return 1;
}

export function referenceScore(ref: VisualReference, profile: VisualInputProfile): number {
  return (
    clamp01(ref.sceneRelevance) *
    clamp01(ref.continuityImportance) *
    clamp01(ref.identityImportance) *
    providerCompatibility(ref, profile)
  );
}

export interface BudgetResult {
  selected: VisualReference[];
  dropped: VisualReference[];
}

export function budgetReferences(
  references: VisualReference[],
  profile: VisualInputProfile,
): BudgetResult {
  const maxImages = Math.max(0, profile.references.max ?? 0);
  const maxVideos = Math.max(0, profile.references.videos ?? 0);

  const scored = references
    .map((ref, index) => ({ ref, index, score: referenceScore(ref, profile) }))
    .sort((a, b) => {
      if (a.ref.protected !== b.ref.protected) return a.ref.protected ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

  const selected: VisualReference[] = [];
  const dropped: VisualReference[] = [];
  let images = 0;
  let videos = 0;

  for (const { ref, score } of scored) {
    const isVideo = ref.kind === 'video';
    const capReached = isVideo ? videos >= maxVideos : images >= maxImages;
    if (capReached || (score === 0 && !ref.protected)) {
      dropped.push(ref);
      continue;
    }
    selected.push(ref);
    if (isVideo) videos += 1;
    else images += 1;
  }

  return { selected, dropped };
}

// v211 — build the canonical `scene_assets` UUID-array payload sent to
// `compose-video-clips`. Mirrors the shape written by `useApplyProductionPlan`
// (v202) so the edge function reads one uniform structure regardless of
// whether the scene came from a Production Plan apply or from a live
// storyboard edit.
//
// Sources:
//   - scene.characterShots / scene.characterShot     → type: 'character'
//   - scene.scene_assets (canonical, from plan-apply) → passed through as-is
//   - readSceneAssetSlugs(scene.aiPrompt) + brand lib → type: 'location'|'building'|'prop'
//
// The slug-fallback path resolves each slug to a brand_locations /
// brand_buildings / brand_props UUID via the merged world library
// (`MotionStudioLocation[]` tagged with 'building' / 'prop').

import type { ComposerScene } from '@/types/video-composer';
import type { MotionStudioLocation } from '@/types/motion-studio';
import {
  readSceneAssetSlugs,
  slugifyAssetName,
} from './applySceneAssetsToPrompt';

export type SceneAssetType =
  | 'character'
  | 'location'
  | 'building'
  | 'prop'
  | 'style';

export interface SceneAssetRef {
  type: SceneAssetType;
  id: string;
  variantId?: string | null;
  role?: string | null;
  displayName?: string | null;
}

function worldTagOf(l: MotionStudioLocation): 'location' | 'building' | 'prop' {
  const tags = (l.tags ?? []) as string[];
  if (tags.includes('building')) return 'building';
  if (tags.includes('prop')) return 'prop';
  return 'location';
}

export function buildSceneAssetsForRender(
  scene: Pick<
    ComposerScene,
    'aiPrompt' | 'characterShots' | 'characterShot'
  > & { scene_assets?: SceneAssetRef[] | null },
  worldLib?: MotionStudioLocation[],
): SceneAssetRef[] {
  const out: SceneAssetRef[] = [];
  const seen = new Set<string>();
  const push = (ref: SceneAssetRef) => {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ref);
  };

  // 1) Canonical carry-through (Production Plan apply already wrote this).
  const canonical = (scene as any).scene_assets as SceneAssetRef[] | undefined;
  if (Array.isArray(canonical)) {
    for (const ref of canonical) {
      if (ref?.id && ref?.type) push(ref);
    }
  }

  // 2) Character shots → character refs.
  const slots =
    (scene.characterShots && scene.characterShots.length > 0)
      ? scene.characterShots
      : scene.characterShot
        ? [scene.characterShot]
        : [];
  for (const s of slots) {
    if (!s?.characterId) continue;
    push({
      type: 'character',
      id: s.characterId,
      variantId: (s as any).outfitLookId ?? null,
      role: s.shotType ?? null,
      displayName: null,
    });
  }

  // 3) Slug block → resolve against the merged world library.
  if (worldLib && worldLib.length > 0) {
    const slugs = readSceneAssetSlugs(scene.aiPrompt || '');
    for (const slug of slugs) {
      const hit = worldLib.find((x) => slugifyAssetName(x.name) === slug);
      if (!hit) continue;
      push({
        type: worldTagOf(hit),
        id: hit.id,
        displayName: hit.name,
      });
    }
  }

  return out;
}

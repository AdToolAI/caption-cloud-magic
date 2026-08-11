/**
 * classifyScene.ts — derives the scene class + requirements from a Composer
 * scene. Pure and additive: it reads existing fields, never writes.
 */

import { isLipSyncIntentional, type LipSyncSceneCamel } from '@/lib/video-composer/lipSyncIntent';
import type { SceneVisualRequirements, VisualSceneClass } from './types';

export interface ClassifiableScene extends LipSyncSceneCamel {
  sceneClass?: VisualSceneClass;
  characterShots?: unknown[];
  productReferences?: { url: string }[];
  locationReferences?: { url: string }[];
  continuityLocked?: boolean;
  lockReferenceUrl?: string;
  aiPrompt?: string;
}

export function classifyScene(scene: ClassifiableScene | null | undefined): VisualSceneClass {
  if (!scene) return 'environment';
  if (scene.sceneClass) return scene.sceneClass;
  const hasCast = Array.isArray(scene.characterShots) && scene.characterShots.length > 0;
  if (hasCast || isLipSyncIntentional(scene)) return 'character';
  if ((scene.productReferences?.length ?? 0) > 0) return 'product';
  return 'environment';
}

export function deriveRequirements(
  scene: ClassifiableScene | null | undefined,
  sceneClass: VisualSceneClass = classifyScene(scene),
): SceneVisualRequirements {
  const lipSync = isLipSyncIntentional(scene ?? undefined);
  const identityCritical =
    lipSync ||
    (sceneClass === 'character' &&
      (Boolean(scene?.continuityLocked) ||
        Boolean(scene?.lockReferenceUrl) ||
        (scene?.characterShots?.length ?? 0) > 0));
  const productCritical = sceneClass === 'product' && (scene?.productReferences?.length ?? 0) > 0;
  const locationRefs = scene?.locationReferences?.length ?? 0;
  const locationContinuity: SceneVisualRequirements['locationContinuity'] =
    locationRefs > 1 ? 'high' : locationRefs === 1 ? 'medium' : 'none';

  return { lipSync, identityCritical, productCritical, locationContinuity };
}

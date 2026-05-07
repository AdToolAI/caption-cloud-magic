// Per-scene character anchor resolver.
//
// Decides HOW the chosen character should be sent to the AI provider so the
// scene composition (wide shot, back-shot, drone, etc.) is preserved instead
// of being overridden by a centered face close-up.
//
// Strategies:
//   first-frame-direct   → portrait sent as i2v anchor (only safe for close-ups)
//   first-frame-composed → portrait+scenePrompt rendered into a new first-frame
//                          via Nano Banana 2 (preferred default for character scenes)
//   subject-reference    → portrait goes into a dedicated subject-reference slot
//                          (Vidu Q2, Kling Reference2V) — does not lock framing
//   text-only            → no image anchor, identity card stays in the prompt
//
// Resolution order for picking the candidate character:
//   1. Explicit characterShot
//   2. Cast-name match in the prompt
//   3. Favourite Brand Character whose name is in the prompt

import type { ComposerCharacter, ComposerScene } from '@/types/video-composer';

export type AnchorStrategy =
  | 'first-frame-direct'
  | 'first-frame-composed'
  | 'subject-reference'
  | 'text-only';

export interface SceneAnchor {
  characterId: string;
  name: string;
  /** Original portrait URL (always present). */
  referenceImageUrl: string;
  /** Where the candidate came from. */
  source: 'explicit-shot' | 'cast-name-match' | 'brand-name-match';
  /** How the portrait should be used by the provider. */
  strategy: AnchorStrategy;
}

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
}

const SUBJECT_REF_SOURCES = new Set(['ai-vidu']);

function nameMatchesPrompt(name: string | undefined, prompt: string): boolean {
  if (!name) return false;
  const full = name.toLowerCase().trim();
  if (!full) return false;
  if (prompt.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!first && first.length >= 3 && prompt.includes(first);
}

function pickStrategy(
  shotType: string | undefined,
  clipSource: string | undefined,
  source: SceneAnchor['source'],
  forceDirect: boolean,
): AnchorStrategy {
  if (forceDirect) return 'first-frame-direct';
  if (clipSource && SUBJECT_REF_SOURCES.has(clipSource)) return 'subject-reference';
  // Tight shots: portrait directly is fine — composition IS the face.
  if (shotType === 'detail' || shotType === 'pov') return 'first-frame-direct';
  // Explicit framing that is NOT a tight close-up → compose.
  if (shotType === 'full' || shotType === 'profile' || shotType === 'back' || shotType === 'silhouette') {
    return 'first-frame-composed';
  }
  // No explicit shot (cast-name match or unspecified) → safest is text-only,
  // so the prompt fully drives composition. The identity card in the prompt
  // keeps the model on the right person; no face-lock.
  if (source === 'cast-name-match' || source === 'brand-name-match') return 'text-only';
  // Explicit shot present but unknown shotType → compose.
  return 'first-frame-composed';
}

export function resolveSceneCharacterAnchor(
  scene: Pick<ComposerScene, 'aiPrompt' | 'characterShot' | 'clipSource'> & {
    forcePortraitAsFirstFrame?: boolean;
  },
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
): SceneAnchor | undefined {
  const forceDirect = scene.forcePortraitAsFirstFrame === true;

  // 1) Explicit characterShot
  const shot = scene.characterShot;
  if (shot && shot.shotType && shot.shotType !== 'absent' && characters) {
    const cm = characters.find((c) => c.id === shot.characterId);
    if (cm?.referenceImageUrl) {
      return {
        characterId: cm.id,
        name: cm.name,
        referenceImageUrl: cm.referenceImageUrl,
        source: 'explicit-shot',
        strategy: pickStrategy(shot.shotType, scene.clipSource, 'explicit-shot', forceDirect),
      };
    }
  }

  const prompt = (scene.aiPrompt || '').toLowerCase();
  if (!prompt) return undefined;

  // 2) Any cast member whose name appears in the prompt
  if (characters && characters.length > 0) {
    for (const cm of characters) {
      if (!cm.referenceImageUrl) continue;
      if (nameMatchesPrompt(cm.name, prompt)) {
        return {
          characterId: cm.id,
          name: cm.name,
          referenceImageUrl: cm.referenceImageUrl,
          source: 'cast-name-match',
          strategy: pickStrategy(shot?.shotType, scene.clipSource, 'cast-name-match', forceDirect),
        };
      }
    }
  }

  // 3) Favourite Brand Character
  if (brandChar?.reference_image_url && nameMatchesPrompt(brandChar.name, prompt)) {
    return {
      characterId: brandChar.id || `brand:${brandChar.name}`,
      name: brandChar.name || 'Brand Character',
      referenceImageUrl: brandChar.reference_image_url,
      source: 'brand-name-match',
      strategy: pickStrategy(shot?.shotType, scene.clipSource, 'brand-name-match', forceDirect),
    };
  }

  return undefined;
}

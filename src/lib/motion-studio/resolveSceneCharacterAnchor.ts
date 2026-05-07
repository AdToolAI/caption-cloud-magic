// Per-scene character anchor resolver.
// Picks the best portrait reference image to send to the AI provider as
// i2v first-frame anchor, so a featured character actually looks like the
// chosen person instead of a randomly invented face.
//
// Resolution order:
//   1. Explicit characterShot → that cast member (if it has a referenceImageUrl)
//   2. Any cast member whose name (or first-name token, ≥3 chars) appears in
//      the scene's aiPrompt
//   3. Favourite Brand Character whose name appears in the prompt
//   4. undefined (no anchor → pure T2V)

import type { ComposerCharacter, ComposerScene } from '@/types/video-composer';

export interface SceneAnchor {
  characterId: string;
  name: string;
  referenceImageUrl: string;
  source: 'explicit-shot' | 'cast-name-match' | 'brand-name-match';
}

interface BrandCharLike {
  id?: string;
  name?: string;
  reference_image_url?: string;
}

function nameMatchesPrompt(name: string | undefined, prompt: string): boolean {
  if (!name) return false;
  const full = name.toLowerCase().trim();
  if (!full) return false;
  if (prompt.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!first && first.length >= 3 && prompt.includes(first);
}

export function resolveSceneCharacterAnchor(
  scene: Pick<ComposerScene, 'aiPrompt' | 'characterShot'>,
  characters: ComposerCharacter[] | undefined,
  brandChar: BrandCharLike | null | undefined,
): SceneAnchor | undefined {
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
    };
  }

  return undefined;
}

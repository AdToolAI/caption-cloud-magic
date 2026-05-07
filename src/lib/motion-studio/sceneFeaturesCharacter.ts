// Shared helper: does the given scene actually feature a character?
// Used by ClipsTab + SceneCard to gate the Brand Character identity-card
// auto-injection. Without this, every B-roll scene would inject the full
// person description and the model would render the character even where
// the storyboard does not call for them.

import type { ComposerScene } from '@/types/video-composer';

export interface SceneCharacterCheckInput {
  name?: string;
}

export function sceneFeaturesCharacter(
  scene: Pick<ComposerScene, 'aiPrompt' | 'characterShot'>,
  character?: SceneCharacterCheckInput | null,
): boolean {
  if (!character?.name) return false;

  // 1) Explicit character shot present and not 'absent'.
  const shot = scene.characterShot;
  if (shot && shot.shotType && shot.shotType !== 'absent') return true;

  // 2) Name (or first-name token) appears in the AI prompt.
  const prompt = (scene.aiPrompt || '').toLowerCase();
  if (!prompt) return false;
  const full = character.name.toLowerCase().trim();
  if (full && prompt.includes(full)) return true;
  const firstName = full.split(/\s+/)[0];
  if (firstName && firstName.length >= 3 && prompt.includes(firstName)) return true;

  return false;
}

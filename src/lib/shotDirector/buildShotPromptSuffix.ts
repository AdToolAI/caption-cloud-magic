import {
  SHOT_CATEGORIES,
  findOption,
  type ShotSelection,
  type ShotCategory,
} from '@/config/shotDirector';

const ORDER: ShotCategory[] = ['framing', 'angle', 'movement', 'lighting'];

/**
 * Builds an English cinematic prompt suffix from the user's Shot Director
 * selection. Always English to maximise output quality across all 9 video
 * providers (core rule).
 *
 * Example output:
 *   "Cinematography: medium close-up from chest up, shot from a low angle
 *    looking up, slow cinematic push-in, lit by warm golden hour sunlight."
 */
export function buildShotPromptSuffix(selection: ShotSelection): string {
  const fragments: string[] = [];
  for (const cat of ORDER) {
    const opt = findOption(cat, selection[cat]);
    if (opt) fragments.push(opt.promptFragment);
  }
  if (fragments.length === 0) return '';
  return `Cinematography: ${fragments.join(', ')}.`;
}

export function getSelectionCount(selection: ShotSelection): number {
  return (Object.keys(SHOT_CATEGORIES) as ShotCategory[]).filter(
    (k) => Boolean(selection[k]),
  ).length;
}

// Auto-syncs `scene.characterShots` with characters whose names appear in the
// scene prompt. Solves a real bug: the storyboard LLM (`compose-video-storyboard`)
// often writes a prompt that mentions multiple characters by name (e.g.
// "Sarah Dusatko, wipes sweat…") but only sets one slot in `characterShots`.
//
// Cast Consistency Map, `sceneFeaturesCharacter` and the cast badge row use
// different heuristics → they get out of sync. This helper uses the SAME
// name-match heuristic as those, so all three stay aligned.
//
// Behaviour:
// - Pure, idempotent: returns the **same array reference** when nothing changes
//   (so a `useEffect` won't loop).
// - Append-only: never removes manually picked slots, never overrides shotType.
// - Default shotType `'full'` for newly detected characters.
// - Caps at 4 slots — matches Multi-Portrait Nano Banana 2 / Vidu Q2 limit.

import type { CharacterShot, ComposerCharacter } from '@/types/video-composer';

const MAX_CAST = 4;

function matchesPrompt(prompt: string, character: ComposerCharacter): boolean {
  if (!character?.name) return false;
  const full = character.name.toLowerCase().trim();
  if (!full) return false;
  if (prompt.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!(first && first.length >= 3 && prompt.includes(first));
}

export function syncCastFromPrompt(
  prompt: string,
  currentShots: CharacterShot[] | undefined,
  characters: ComposerCharacter[] | undefined,
  dismissedIds?: string[],
): CharacterShot[] {
  const current = currentShots ?? [];
  if (!prompt || !characters?.length) return current;
  if (current.length >= MAX_CAST) return current;

  const lower = prompt.toLowerCase();
  const haveIds = new Set(current.map((s) => s.characterId));
  const dismissed = new Set((dismissedIds ?? []).map((id) => String(id)));

  const additions: CharacterShot[] = [];
  for (const c of characters) {
    if (haveIds.has(c.id)) continue;
    if (dismissed.has(c.id)) continue;
    if (!matchesPrompt(lower, c)) continue;
    additions.push({ characterId: c.id, shotType: 'full' });
    if (current.length + additions.length >= MAX_CAST) break;
  }

  if (additions.length === 0) return current;
  return [...current, ...additions];
}

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

// ---------------------------------------------------------------------------
// Ensemble guarantee (client-side safety net)
// ---------------------------------------------------------------------------
// Companion to the server-side ensemble-repair in `compose-video-storyboard`.
// Guarantees that at least ONE scene features ALL briefed characters together
// (max 4 — Nano Banana 2 / Vidu Q2 cast cap). For storyboards with ≥ 6 scenes,
// guarantees TWO ensemble moments. Idempotent: returns the same `scenes`
// reference when the requirement is already satisfied.
//
// The server pass is authoritative; this helper only kicks in if the server
// missed (rare — e.g. legacy storyboards persisted before the fix shipped).

type SceneLike = {
  id?: string;
  characterShots?: CharacterShot[];
};

export function ensureEnsembleScene<S extends SceneLike>(
  scenes: S[],
  characters: ComposerCharacter[] | undefined,
): S[] {
  if (!scenes?.length || !characters?.length || characters.length < 2) return scenes;

  const allChars = characters.slice(0, MAX_CAST);
  const requiredIds = new Set(allChars.map((c) => c.id));
  const requiredEnsembles = scenes.length >= 6 ? 2 : 1;

  const isEnsemble = (sc: SceneLike): boolean => {
    const visible = (sc.characterShots ?? []).filter(
      (x) => x?.shotType && x.shotType !== 'absent',
    );
    const present = new Set(visible.map((x) => x.characterId));
    for (const id of requiredIds) if (!present.has(id)) return false;
    return true;
  };

  const currentCount = scenes.filter(isEnsemble).length;
  if (currentCount >= requiredEnsembles) return scenes;

  const needed = requiredEnsembles - currentCount;
  const middle: number[] = [];
  for (let i = 1; i < scenes.length - 1; i++) middle.push(i);
  middle.sort((a, b) => {
    const cov = (i: number) => {
      const visible = (scenes[i].characterShots ?? []).filter(
        (x) => x?.shotType && x.shotType !== 'absent',
      );
      return visible.filter((x) => requiredIds.has(x.characterId)).length;
    };
    return cov(b) - cov(a);
  });
  const candidateOrder: number[] = [0];
  if (scenes.length > 1) candidateOrder.push(scenes.length - 1);
  for (const i of middle) candidateOrder.push(i);

  const next = scenes.slice();
  let repaired = 0;
  for (const idx of candidateOrder) {
    if (repaired >= needed) break;
    const sc = next[idx];
    if (isEnsemble(sc)) continue;
    const shots = Array.isArray(sc.characterShots) ? [...sc.characterShots] : [];
    const present = new Set(
      shots.filter((x) => x?.shotType && x.shotType !== 'absent').map((x) => x.characterId),
    );
    for (const ch of allChars) {
      if (present.has(ch.id)) continue;
      const visibleCount = shots.filter((x) => x?.shotType && x.shotType !== 'absent').length;
      if (visibleCount >= MAX_CAST) break;
      shots.push({ characterId: ch.id, shotType: 'full' });
      present.add(ch.id);
    }
    next[idx] = { ...sc, characterShots: shots };
    repaired++;
  }
  return repaired > 0 ? next : scenes;
}


// =============================================================================
// castCoverage — pure helpers to detect when the scene-director's aiPrompt
// names a cast member that isn't actually visible in the action body, OR
// names someone in the [Cast: …] / "Featuring …" header but forgets to give
// them anything to do in the action.
//
// This is the single-source-of-truth for the "ghost cast" warning in the
// SceneCard. It reuses the same name-match heuristic as syncCastFromPrompt
// so all three signals (cast picker, badge row, coverage chip) agree.
// =============================================================================

import type { CharacterShot, ComposerCharacter } from '@/types/video-composer';

/**
 * Strip the leading "Featuring …:" / "[Cast: …]" / "nName1 and Name2: " block
 * from the prompt so we only check the action body for cast names.
 *
 * The scene-director / applySceneAssetsToPrompt pipeline emits one of:
 *   "Featuring Alice (profile) and Bob (full): <action>"
 *   "[Cast: Alice (profile), Bob (full)] <action>"
 *   "nAlice and Bob: <action>"
 * We strip the first occurrence and return the remainder for matching.
 */
export function stripCastHeader(prompt: string): string {
  const p = (prompt || '').trim();
  if (!p) return '';

  // Pattern 1: "Featuring …: <body>"
  const featuring = p.match(/^\s*Featuring\s+[^:]{1,400}:\s*([\s\S]*)$/i);
  if (featuring?.[1]) return featuring[1];

  // Pattern 2: "[Cast: …] <body>"
  const bracket = p.match(/^\s*\[Cast:[^\]]{1,400}\]\s*([\s\S]*)$/i);
  if (bracket?.[1]) return bracket[1];

  // Pattern 3: "nName1 and Name2: <body>"   (composer storyboard format)
  const nPrefix = p.match(/^\s*n[A-Z][A-Za-z .'\-]{1,200}:\s*([\s\S]*)$/);
  if (nPrefix?.[1]) return nPrefix[1];

  return p;
}

/**
 * Same heuristic as syncCastFromPrompt: full name OR first name (≥3 chars)
 * present as a substring (case-insensitive).
 */
function matchesBody(lowerBody: string, name: string | undefined | null): boolean {
  if (!name) return false;
  const full = name.toLowerCase().trim();
  if (!full) return false;
  if (lowerBody.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!(first && first.length >= 3 && lowerBody.includes(first));
}

export interface CastCoverageResult {
  /** Names whose slot is in characterShots but who don't appear in the action body. */
  missing: string[];
  /** Names that DO appear in the action body. */
  present: string[];
  /** True when every selected cast member is visible in the action body. */
  ok: boolean;
}

/**
 * Check whether every character in `characterShots` is named in the action
 * body of `aiPrompt`. Returns the missing names so the UI can list them in
 * a warning chip + "Force cast in action" re-roll button.
 */
export function checkCastCoverage(
  aiPrompt: string | undefined,
  characterShots: CharacterShot[] | undefined,
  libraryCharacters: Array<Pick<ComposerCharacter, 'id' | 'name'>> | undefined,
): CastCoverageResult {
  const shots = (characterShots ?? []).filter(
    (s) => s && s.characterId && s.shotType !== 'absent',
  );
  if (shots.length === 0) return { missing: [], present: [], ok: true };

  const body = stripCastHeader(aiPrompt || '');
  if (!body.trim()) {
    // Empty prompt: every cast member is "missing" by definition.
    const all = shots
      .map((s) => libraryCharacters?.find((c) => c.id === s.characterId)?.name)
      .filter((n): n is string => !!n);
    return { missing: all, present: [], ok: all.length === 0 };
  }

  const lower = body.toLowerCase();
  const missing: string[] = [];
  const present: string[] = [];
  for (const s of shots) {
    const name = libraryCharacters?.find((c) => c.id === s.characterId)?.name;
    if (!name) continue;
    if (matchesBody(lower, name)) present.push(name);
    else missing.push(name);
  }
  return { missing, present, ok: missing.length === 0 };
}

/**
 * Resolve cast IDs → names for sending as `requiredCharacterNames` to the
 * scene-director edge function on a "force cast" re-roll.
 */
export function resolveRequiredCastNames(
  characterShots: CharacterShot[] | undefined,
  libraryCharacters: Array<Pick<ComposerCharacter, 'id' | 'name'>> | undefined,
): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  for (const s of characterShots ?? []) {
    if (!s?.characterId || s.shotType === 'absent') continue;
    const name = libraryCharacters?.find((c) => c.id === s.characterId)?.name;
    if (!name) continue;
    ids.push(s.characterId);
    names.push(name);
  }
  return { ids, names };
}

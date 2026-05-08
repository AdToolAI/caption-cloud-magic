// Auto-injects the selected cast (CharacterCastPicker) into the scene prompt as
// a deterministic marker at the beginning of the text:
//
//   [Cast: Sarah Dusatko (full), Matthew Dusatko (profile)] <rest of prompt>
//
// - Idempotent: re-running with the same cast doesn't duplicate the marker.
// - Updates: a new cast replaces the existing marker.
// - Cleanup: empty cast removes the marker entirely.
// - Smart: characters already mentioned freely in the prose are NOT re-listed.
// - Localised label per UI language.

import type { CharacterShot, ComposerCharacter } from '@/types/video-composer';

type Lang = 'de' | 'en' | 'es';

const LABEL: Record<Lang, string> = {
  de: 'Besetzung',
  en: 'Cast',
  es: 'Reparto',
};

const SHOT_LABEL: Record<Lang, Record<string, string>> = {
  de: { full: 'Voll', profile: 'Profil', back: 'Rücken', detail: 'Detail', pov: 'POV', silhouette: 'Silhouette', absent: 'Aus' },
  en: { full: 'full', profile: 'profile', back: 'back', detail: 'detail', pov: 'POV', silhouette: 'silhouette', absent: 'absent' },
  es: { full: 'completo', profile: 'perfil', back: 'espalda', detail: 'detalle', pov: 'POV', silhouette: 'silueta', absent: 'ausente' },
};

// Match any of the localised labels at the very beginning of the prompt.
// Tolerant of leading whitespace and trailing newline/space.
const MARKER_RE = /^\s*\[(?:Cast|Besetzung|Reparto)\s*:\s*[^\]]*\]\s*/i;

function stripExistingMarker(prompt: string): string {
  return prompt.replace(MARKER_RE, '');
}

function nameAlreadyInProse(prose: string, fullName: string): boolean {
  const p = prose.toLowerCase();
  const full = fullName.toLowerCase().trim();
  if (!full) return false;
  if (p.includes(full)) return true;
  const first = full.split(/\s+/)[0];
  return !!(first && first.length >= 3 && p.includes(first));
}

/**
 * Tolerant character lookup — mirrors `CastConsistencyMap.getAnchor` so the
 * prompt-marker stays in sync with the UI even when the storyboard LLM drifts
 * the `characterId` away from the brand UUID (e.g. "lib:matthew-…",
 * "matthew_dusatko", or the plain name).
 */
function findCharacter(
  slot: CharacterShot,
  chars: ComposerCharacter[] | undefined,
): ComposerCharacter | undefined {
  if (!chars?.length || !slot?.characterId) return undefined;
  // 1) exact id
  const exact = chars.find((c) => c.id === slot.characterId);
  if (exact) return exact;
  const slotIdLower = slot.characterId.toLowerCase();
  // 2) slot id contains first name (≥3 chars)
  const byNameInId = chars.find((c) => {
    const first = c.name?.trim().toLowerCase().split(/\s+/)[0];
    return !!first && first.length >= 3 && slotIdLower.includes(first);
  });
  if (byNameInId) return byNameInId;
  // 3) slot id equals full name lowercased
  return chars.find((c) => c.name?.trim().toLowerCase() === slotIdLower);
}

export function applyCastToPrompt(
  prompt: string,
  cast: CharacterShot[] | undefined,
  characters: ComposerCharacter[] | undefined,
  lang: Lang = 'de',
): string {
  const prose = stripExistingMarker(prompt || '');
  const list = (cast ?? []).filter((c) => c && c.characterId);
  if (list.length === 0) return prose.trimStart();

  // Build name + shot tokens, skipping any character already mentioned in the prose.
  const tokens: string[] = [];
  for (const slot of list) {
    const char = findCharacter(slot, characters);
    if (!char?.name) continue;
    if (nameAlreadyInProse(prose, char.name)) continue;
    const shotLbl = SHOT_LABEL[lang][slot.shotType] ?? slot.shotType;
    tokens.push(`${char.name} (${shotLbl})`);
  }

  if (tokens.length === 0) return prose.trimStart();

  const marker = `[${LABEL[lang]}: ${tokens.join(', ')}] `;
  return marker + prose.trimStart();
}

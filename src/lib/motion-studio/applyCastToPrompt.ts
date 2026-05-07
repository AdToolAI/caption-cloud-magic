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
    const char = characters?.find((c) => c.id === slot.characterId);
    if (!char?.name) continue;
    if (nameAlreadyInProse(prose, char.name)) continue;
    const shotLbl = SHOT_LABEL[lang][slot.shotType] ?? slot.shotType;
    tokens.push(`${char.name} (${shotLbl})`);
  }

  if (tokens.length === 0) return prose.trimStart();

  const marker = `[${LABEL[lang]}: ${tokens.join(', ')}] `;
  return marker + prose.trimStart();
}

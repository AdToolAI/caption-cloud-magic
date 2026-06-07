// Strips an explicitly-removed character from a scene's prompt + dialog script.
//
// Companion to `applyCastToPrompt` / `applyDialogToPrompt` / `syncCastFromPrompt`:
// when the user removes a character from the cast via the X button, we want
// the character to actually disappear from the prose, the [Cast] marker, and
// the [Dialog] block — otherwise `syncCastFromPrompt` re-adds them on the next
// render because their name is still present.
//
// Conservative behaviour:
//  - Full name + first-name occurrences are replaced with an empty string.
//  - Punctuation cleanup keeps the surrounding sentence readable
//    (double spaces, dangling commas, ", ." → ".").
//  - Idempotent: re-running on a clean prompt is a no-op.

import type { ComposerCharacter } from '@/types/video-composer';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripName(text: string, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return text;
  const full = escapeRegex(trimmed);
  let out = text.replace(new RegExp(`\\b${full}\\b`, 'gi'), '');
  const first = trimmed.split(/\s+/)[0];
  if (first && first.length >= 3 && first.toLowerCase() !== trimmed.toLowerCase()) {
    out = out.replace(new RegExp(`\\b${escapeRegex(first)}\\b`, 'gi'), '');
  }
  return out;
}

function tidyPunctuation(text: string): string {
  return text
    // collapse repeated commas / dangling commas before punctuation
    .replace(/,\s*,+/g, ',')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/,\s*\)/g, ')')
    .replace(/\s+,/g, ',')
    .replace(/,\s*([.;!?])/g, '$1')
    // drop leading commas at line starts
    .replace(/^\s*,\s*/gm, '')
    // collapse whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove every mention of the given characters from a free-form prompt or
 * prompt slot value (works on both because they're plain strings).
 */
export function removeCharactersFromPrompt(
  prompt: string,
  removed: ComposerCharacter[] | undefined,
): string {
  if (!prompt || !removed?.length) return prompt;
  let out = prompt;
  for (const c of removed) {
    if (!c?.name) continue;
    out = stripName(out, c.name);
  }
  return tidyPunctuation(out);
}

/**
 * Remove screenplay lines spoken by the given characters from a `dialogScript`.
 * Matches `Name:` and `Name [tonality]:` prefixes (full name OR first name),
 * case-insensitive. Continuation lines belonging to the removed speaker are
 * dropped along with the header line.
 */
export function removeCharactersFromDialogScript(
  script: string,
  removed: ComposerCharacter[] | undefined,
): string {
  if (!script || !removed?.length) return script;
  const names = new Set<string>();
  for (const c of removed) {
    if (!c?.name) continue;
    const full = c.name.toLowerCase().trim();
    if (full) names.add(full);
    const first = full.split(/\s+/)[0];
    if (first && first.length >= 3) names.add(first);
  }
  if (names.size === 0) return script;

  const HEADER_RE = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.-]{0,40})\s*(?:\[[^\]]{1,32}\])?\s*[:—-]\s*(.+)$/;
  const lines = script.split(/\r?\n/);
  const out: string[] = [];
  let dropping = false;

  for (const raw of lines) {
    const line = raw;
    const m = HEADER_RE.exec(line.trim());
    if (m) {
      const speaker = m[1].trim().toLowerCase();
      const speakerFirst = speaker.split(/\s+/)[0];
      if (names.has(speaker) || (speakerFirst && names.has(speakerFirst))) {
        dropping = true;
        continue;
      }
      dropping = false;
      out.push(line);
      continue;
    }
    if (!line.trim()) {
      dropping = false;
      out.push(line);
      continue;
    }
    if (dropping) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

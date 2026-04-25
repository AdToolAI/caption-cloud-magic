// Motion Studio Pro – @-Tag Mention System (Phase 4)
//
// Allows users to write prompts like:
//   "@Sarah is sitting in @Office at golden hour"
// At generation time, mentions are resolved against the user's library and
// the AI prompt is enriched with full character / location descriptions
// (and an i2v reference image when only ONE character/location is mentioned).
//
// Why a separate resolver instead of inlining at type time?
//   • Library entries can be edited later — we want the latest description
//     at generation time, not a stale snapshot.
//   • The textarea stays human-readable (`@Sarah`), the AI receives a fully
//     hydrated prompt.

import type {
  MotionStudioCharacter,
  MotionStudioLocation,
} from '@/types/motion-studio';

export type MentionKind = 'character' | 'location';

export interface MentionMatch {
  /** "character" or "location" */
  kind: MentionKind;
  /** The id of the resolved entity. */
  id: string;
  /** The display name (matches `@<name>` in the source text). */
  name: string;
  /** Character/Location index in the original prompt (start of `@`). */
  start: number;
  end: number;
}

export interface ResolvedPrompt {
  /** The hydrated English prompt sent to the AI model. */
  prompt: string;
  /** Reference image URL if exactly one character OR one location was mentioned and has an image. */
  referenceImageUrl?: string;
  /** All matches found in the source. */
  matches: MentionMatch[];
}

/**
 * Build a fast lookup map: lowercase name → entity.
 * Names are matched case-insensitive and accept hyphens / underscores
 * inside the @-tag (e.g. `@Sarah_Kim`, `@coffee-shop`).
 */
function buildIndex<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (item?.name) map.set(item.name.toLowerCase(), item);
  }
  return map;
}

/**
 * Find every `@token` occurrence in the text and try to resolve it
 * against characters first, then locations.
 *
 * Token rule: `@` followed by 1–60 chars of letters, digits, `_`, `-`.
 * Spaces are NOT consumed — multi-word entities should be referenced via
 * underscores (`@Sarah_Kim`) or by renaming the library entry.
 */
export function findMentions(
  text: string,
  characters: MotionStudioCharacter[],
  locations: MotionStudioLocation[]
): MentionMatch[] {
  if (!text) return [];
  const charIndex = buildIndex(characters);
  const locIndex = buildIndex(locations);
  const matches: MentionMatch[] = [];

  const regex = /@([A-Za-z0-9_\-]{1,60})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const token = m[1].toLowerCase();
    const char = charIndex.get(token);
    if (char) {
      matches.push({
        kind: 'character',
        id: char.id,
        name: char.name,
        start: m.index,
        end: m.index + m[0].length,
      });
      continue;
    }
    const loc = locIndex.get(token);
    if (loc) {
      matches.push({
        kind: 'location',
        id: loc.id,
        name: loc.name,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  return matches;
}

/**
 * Replace `@tags` with a clean readable form (just the name, no `@`)
 * and append a structured "Cast & Setting" block with the full library
 * descriptions. This format is consistently understood by Sora 2, Kling,
 * Hailuo, Veo 3 and Wan.
 *
 * If exactly one character (or one location) with a reference image is
 * mentioned, that image URL is returned so the generation pipeline can
 * use it as i2v reference for visual consistency.
 */
export function resolveMentions(
  text: string,
  characters: MotionStudioCharacter[],
  locations: MotionStudioLocation[]
): ResolvedPrompt {
  const matches = findMentions(text, characters, locations);
  if (matches.length === 0) {
    return { prompt: text, matches: [] };
  }

  // Replace tags from the END so indices stay valid.
  let cleaned = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    cleaned = cleaned.slice(0, m.start) + m.name + cleaned.slice(m.end);
  }

  // Build the descriptive block.
  const seenChars = new Set<string>();
  const seenLocs = new Set<string>();
  const charLines: string[] = [];
  const locLines: string[] = [];

  for (const m of matches) {
    if (m.kind === 'character' && !seenChars.has(m.id)) {
      seenChars.add(m.id);
      const c = characters.find((x) => x.id === m.id);
      if (c) {
        const sig = c.signature_items?.trim();
        const desc = c.description?.trim();
        const parts = [desc, sig ? `Signature: ${sig}` : null].filter(Boolean);
        charLines.push(`- ${c.name}: ${parts.join(' — ') || 'recurring character'}`);
      }
    }
    if (m.kind === 'location' && !seenLocs.has(m.id)) {
      seenLocs.add(m.id);
      const l = locations.find((x) => x.id === m.id);
      if (l) {
        const lighting = l.lighting_notes?.trim();
        const desc = l.description?.trim();
        const parts = [desc, lighting ? `Lighting: ${lighting}` : null].filter(Boolean);
        locLines.push(`- ${l.name}: ${parts.join(' — ') || 'recurring location'}`);
      }
    }
  }

  const blocks: string[] = [cleaned.trim()];
  if (charLines.length > 0) {
    blocks.push(`Cast (keep visually consistent across shots):\n${charLines.join('\n')}`);
  }
  if (locLines.length > 0) {
    blocks.push(`Setting:\n${locLines.join('\n')}`);
  }

  // Pick a reference image: prefer single character, fallback to single location.
  let referenceImageUrl: string | undefined;
  if (seenChars.size === 1) {
    const id = [...seenChars][0];
    referenceImageUrl =
      characters.find((c) => c.id === id)?.reference_image_url ?? undefined;
  } else if (seenLocs.size === 1) {
    const id = [...seenLocs][0];
    referenceImageUrl =
      locations.find((l) => l.id === id)?.reference_image_url ?? undefined;
  }

  return {
    prompt: blocks.join('\n\n'),
    referenceImageUrl,
    matches,
  };
}

/**
 * Inspect the cursor position to detect an *active* `@trigger` the user is
 * currently typing — used to drive the autocomplete dropdown.
 *
 * Returns the partial query (without `@`) and the start index of the trigger,
 * or null if no active trigger is present.
 */
export function getActiveMentionTrigger(
  text: string,
  caret: number
): { query: string; start: number } | null {
  if (caret <= 0 || caret > text.length) return null;
  // Walk back from caret until we hit `@`, whitespace, or string start.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i === 0 ? ' ' : text[i - 1];
      // `@` must be at start of word (preceded by whitespace or BOS).
      if (!/\s/.test(before) && before !== '') return null;
      const query = text.slice(i + 1, caret);
      // Stop if the partial token already contains spaces / invalid chars.
      if (!/^[A-Za-z0-9_\-]*$/.test(query)) return null;
      return { query, start: i };
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

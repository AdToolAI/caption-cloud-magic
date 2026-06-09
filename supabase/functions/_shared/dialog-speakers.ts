/**
 * Dialog script parsing helpers — single source of truth.
 *
 * Replaces:
 *   - `countDialogSpeakers` in compose-video-clips/index.ts
 *   - `detectSpeakerCount`  in compose-clip-webhook/index.ts
 *   - ad-hoc `stripSpeakerPrefixes` in compose-video-clips/index.ts
 *
 * Matches `[NAME]:`, `NAME:`, or `[NAME]：` (full-width colon) speaker prefixes.
 * Speaker names are 1–40 chars, start with a letter, may contain spaces,
 * apostrophes, dots, dashes, and Latin-1 diacritics.
 */
const SPEAKER_PREFIX_RE = /^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/;

/** Count distinct speakers in a dialog script (case-insensitive). 0 for empty. */
export function countDialogSpeakers(script?: string | null): number {
  const s = (script ?? "").trim();
  if (!s) return 0;
  const speakers = new Set<string>();
  for (const line of s.split("\n")) {
    const m = line.match(SPEAKER_PREFIX_RE);
    if (m) speakers.add(m[1].trim().toLowerCase());
  }
  return speakers.size;
}

/** Strip "NAME:" / "[NAME]:" prefixes, joining the spoken text into one line. */
export function stripSpeakerPrefixes(script: string): string {
  return script
    .split("\n")
    .map((line) => line.replace(SPEAKER_PREFIX_RE, "").trim())
    .filter((l) => l.length > 0)
    .join(" ");
}

/** True when the script contains any non-empty content. */
export function hasDialogText(script?: string | null): boolean {
  return !!(script && script.trim().length > 0);
}

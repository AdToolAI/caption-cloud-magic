/**
 * Defensive string helpers for motion-studio / video-composer.
 *
 * Library entries (brand_characters, locations, scene-director LLM output)
 * occasionally arrive without a `name` or `characterId`. Calling
 * `.toLowerCase()` directly on those values throws and the global
 * ErrorBoundary then replaces the whole page with "Etwas ist schiefgelaufen".
 *
 * Use `safeLower(value)` everywhere a string from those sources is lowercased.
 */
export function safeLower(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.toLowerCase().trim();
}

/** Lowercase first whitespace-delimited token, empty string when none. */
export function safeFirstNameLower(v: unknown): string {
  const lower = safeLower(v);
  if (!lower) return '';
  return lower.split(/\s+/)[0] ?? '';
}

// =============================================================================
// isBoilerplateAction — Phase 1 hygiene
// =============================================================================
//
// Detects the auto-generated "placeholder" action strings the storyboard
// edge function (`compose-video-storyboard` → `neutralCharacterAction`) and
// the BriefingTab multi-cast rewriter use as fallbacks when neither the LLM
// nor the prompt-clause heuristic produced a specific per-character action.
//
// Why this matters
// ----------------
// Without filtering, a 4-character scene easily ends up with three identical
// fallback lines:
//
//   - Sarah: A young professional woman, Sarah, late 20s, …
//   - Matthew: is gesturing naturally, visible to the camera
//   - Samuel: is gesturing naturally, visible to the camera
//   - Kailee: is gesturing naturally, visible to the camera
//
// Hailuo / Kling / Vidu see three semantically empty cast lines, average
// them across the frame, and weaken the one specific action. Stripping the
// boilerplate before injection keeps the [CastActions] block focused on
// what the user actually directed.
//
// The list is intentionally narrow — only strings the system itself emits.
// User-typed wording is never matched, even when it sounds similar.

export const BOILERPLATE_ACTION_PATTERNS: RegExp[] = [
  // EN — neutralCharacterAction + storyboard "performs the scene action…"
  /^performs?\s+the\s+scene\s+action(?:\s+naturally)?(?:[,\s]+visible\s+to\s+(?:the\s+)?camera)?\.?$/i,
  // EN — BriefingTab multi-cast fallback ("looks at the others and speaks naturally on camera")
  /^looks?\s+at\s+the\s+others?\s+and\s+speaks?\s+naturally(?:\s+on\s+camera)?\.?$/i,
  // EN — generic "is gesturing naturally, visible to (the) camera"
  /^(?:is\s+)?gesturing\s+naturally(?:[,\s]+visible\s+to\s+(?:the\s+)?camera)?\.?$/i,
  // EN — scene-level group fallback
  /^[\w .'-]+\s+(?:and\s+[\w .'-]+\s+)?share\s+the\s+scene(?:\s+together)?,?\s+each\s+visible\s+to\s+camera\s+with\s+their\s+own\s+action\.?$/i,

  // DE — neutralCharacterAction
  /^führt\s+die\s+szenen[- ]aktion\s+natürlich\s+aus(?:[,\s]+sichtbar\s+zur\s+kamera)?\.?$/i,
  // DE — generic
  /^(?:gestikuliert|gestiziert)\s+natürlich(?:[,\s]+sichtbar\s+zur\s+kamera)?\.?$/i,

  // ES — neutralCharacterAction
  /^realiza\s+la\s+acción\s+de\s+la\s+escena\s+con\s+naturalidad(?:[,\s]+visible\s+a\s+cámara)?\.?$/i,
  // ES — generic
  /^gesticula\s+con\s+naturalidad(?:[,\s]+visible\s+a\s+cámara)?\.?$/i,
];

/**
 * True when `text` matches one of the known system-generated placeholder
 * action strings. Whitespace-trimmed, case-insensitive.
 *
 * Returns `false` for empty input — callers handle empty separately.
 */
export function isBoilerplateAction(text: string | undefined | null): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return BOILERPLATE_ACTION_PATTERNS.some((re) => re.test(t));
}

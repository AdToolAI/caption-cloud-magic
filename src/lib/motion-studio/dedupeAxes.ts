// Axis-aware deduplication for cinematic prompt layers.
//
// When several systems (Director Modifiers, Cinematic Style Preset, Shot
// Director, free-form Visual Style Hint) describe the same axis — e.g. the
// lighting setup or the camera movement — we get conflicting / redundant
// fragments in the final prompt. This module classifies fragments by axis
// and returns a deterministic "winner" per axis, plus the residual fragments
// that don't compete on any axis (and can be appended freely).
//
// Priority is fixed (high → low):
//   shotDirector  >  cinematicPreset  >  directorModifier  >  visualStyleHint
//
// Rationale:
//   - Shot Director is the most specific per-scene cinematography control,
//     manually picked by the user → always wins.
//   - Cinematic Preset is a one-click bundle that the user explicitly chose.
//   - Director Modifier is a free combination of single chips.
//   - Visual Style Hint is global ("Comic", "Anime") — coarsest grain.

export type LayerSource =
  | 'shotDirector'
  | 'cinematicPreset'
  | 'directorModifier'
  | 'visualStyleHint';

export const LAYER_PRIORITY: Record<LayerSource, number> = {
  shotDirector: 4,
  cinematicPreset: 3,
  directorModifier: 2,
  visualStyleHint: 1,
};

export type Axis =
  | 'lighting'
  | 'camera-movement'
  | 'framing'
  | 'angle'
  | 'mood'
  | 'film-stock'
  | 'lens';

/** A single classified fragment going into the final prompt. */
export interface AxisFragment {
  source: LayerSource;
  axis: Axis | null; // null = "free" fragment (no competition)
  text: string;
}

// Heuristic axis detection — covers ~95% of preset/modifier copy without
// requiring per-fragment metadata.
const AXIS_PATTERNS: Array<{ axis: Axis; re: RegExp }> = [
  { axis: 'lighting', re: /\b(light(ing)?|lit by|backlit|softbox|noir|golden hour|blue hour|neon|moonlit|candlelight|volumetric|god rays|window light|natural daylight|overcast)\b/i },
  { axis: 'camera-movement', re: /\b(dolly|tracking shot|crane|orbit|push-?in|pull-?out|handheld|gimbal|static tripod|locked-?off|FPV|drone|whip pan)\b/i },
  { axis: 'framing', re: /\b(close-?up|medium (close|wide|shot)|wide shot|extreme (close|wide)|two-?shot|over-?the-?shoulder|establishing)\b/i },
  { axis: 'angle', re: /\b(low angle|high angle|eye-?level|bird'?s eye|worm'?s eye|dutch tilt|POV)\b/i },
  { axis: 'mood', re: /\b(teal[- ]and[- ]orange|color grade|monochrome|black and white|pastel|vibrant saturated|moody dark|low-?key|high-?key)\b/i },
  { axis: 'film-stock', re: /\b(35mm|Super 8|VHS|ARRI Alexa|RED Komodo|film grain|chromatic aberration)\b/i },
  { axis: 'lens', re: /\b(anamorphic|24mm|85mm|macro lens|tilt-?shift|wide-?angle lens)\b/i },
];

/** Detect which (if any) axis a free-text fragment belongs to. */
export function detectAxis(fragment: string): Axis | null {
  for (const { axis, re } of AXIS_PATTERNS) {
    if (re.test(fragment)) return axis;
  }
  return null;
}

/**
 * Split a comma-joined preset/modifier text into individual fragments and
 * tag each with an axis (or null).
 */
export function classifyFragments(source: LayerSource, text: string): AxisFragment[] {
  if (!text) return [];
  return text
    .split(/,\s*|\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ source, axis: detectAxis(t), text: t }));
}

/**
 * Resolve fragments across all layers: per axis, the highest-priority source
 * wins; lower-priority axis-matching fragments are dropped. "Free" fragments
 * (axis === null) all survive (with simple substring de-duplication).
 */
export function resolveAxisConflicts(fragments: AxisFragment[]): {
  winners: AxisFragment[];
  dropped: AxisFragment[];
} {
  const bestByAxis = new Map<Axis, AxisFragment>();
  const free: AxisFragment[] = [];
  const dropped: AxisFragment[] = [];

  for (const f of fragments) {
    if (f.axis === null) {
      free.push(f);
      continue;
    }
    const current = bestByAxis.get(f.axis);
    if (!current || LAYER_PRIORITY[f.source] > LAYER_PRIORITY[current.source]) {
      if (current) dropped.push(current);
      bestByAxis.set(f.axis, f);
    } else {
      dropped.push(f);
    }
  }

  // Substring de-dup on free fragments (case-insensitive).
  const seen: string[] = [];
  const dedupedFree: AxisFragment[] = [];
  for (const f of free) {
    const lower = f.text.toLowerCase();
    if (seen.some((s) => s.includes(lower) || lower.includes(s))) {
      dropped.push(f);
    } else {
      seen.push(lower);
      dedupedFree.push(f);
    }
  }

  return {
    winners: [...bestByAxis.values(), ...dedupedFree],
    dropped,
  };
}

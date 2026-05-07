// Centralized prompt-layer composer for the Motion Studio / Video Composer.
//
// This module is the single source of truth for how the per-scene prompt is
// assembled before it leaves the client. Previously each call site combined
// `resolveMentions` + `applyDirectorModifiers` + `buildShotPromptSuffix` by
// hand, which led to (a) lighting/camera double-mentions, (b) negative
// phrases leaking into the positive prompt, (c) inconsistent ordering, and
// (d) no insight into what the model actually sees.
//
// The composer takes the raw inputs, runs them through the axis-aware
// deduplication layer, splits negative phrases into a dedicated field, and
// returns both the final string AND the per-layer breakdown for the Live
// Prompt Preview UI.

import type { ShotSelection } from '@/config/shotDirector';
import {
  applyDirectorModifiers,
  type DirectorModifiers,
  getPresetById,
} from './directorPresets';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import { resolveMentions, type MentionMatch } from './mentionParser';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';
import { findStylePreset } from '@/config/cinematicStylePresets';
import {
  classifyFragments,
  resolveAxisConflicts,
  type AxisFragment,
  type LayerSource,
} from './dedupeAxes';

export interface ComposerInputs {
  /** Raw user prompt (free-form or stitched from slots). */
  rawPrompt: string;
  /** Active director modifier ids per axis (camera/lens/lighting/mood/...). */
  directorModifiers?: DirectorModifiers;
  /** Active Shot Director selection (framing/angle/movement/lighting). */
  shotDirector?: ShotSelection;
  /** Optional cinematic-preset id (one-click "director look"). */
  cinematicStylePresetId?: string;
  /** Optional brand character to auto-inject (Phase 2). */
  brandCharacter?: {
    name?: string;
    identityCardPrompt?: string;
    referenceImageUrl?: string;
    /**
     * When true, the brand character's identity-card description is injected
     * into the positive prompt. Default: false — so B-roll scenes that do not
     * feature the character don't end up rendering them anyway.
     */
    appliesToScene?: boolean;
  };
  /** Library lookups for @character / @location mentions (Phase 4 logic). */
  libraryCharacters?: MotionStudioCharacter[];
  libraryLocations?: MotionStudioLocation[];
  /** UI language (currently informational — composition stays English). */
  language?: 'en' | 'de' | 'es';
}

export interface ComposerLayerBreakdown {
  source: LayerSource | 'rawPrompt' | 'mentions' | 'brandCharacter' | 'negative';
  label: string;
  text: string;
  /** True when this layer's content was kept; false → dropped by dedup. */
  applied: boolean;
}

export interface ComposerResult {
  /** Final positive prompt sent to the AI provider (English). */
  finalPrompt: string;
  /** Negative phrases routed to the dedicated `negative_prompt` API param. */
  negativePrompt: string;
  /** Optional reference image to attach (from a single resolved mention). */
  referenceImageUrl?: string;
  /** Per-layer breakdown for the Live Preview UI. */
  layers: ComposerLayerBreakdown[];
  /** Fragments that were dropped by axis dedup (debug / preview). */
  dropped: AxisFragment[];
  /** Resolved @-mentions metadata (passed through from `resolveMentions`). */
  mentions: MentionMatch[];
}

// ---------------------------------------------------------------------------
// Negative-phrase sanitizer (Phase 3)
// ---------------------------------------------------------------------------
//
// Catches phrases like:
//   "no on-screen text", "no text", "without logos", "avoid people",
//   "no captions", "no watermarks", "no subtitles"
// and returns them as a clean, comma-joined negative prompt while removing
// them from the positive prompt.

const NEGATIVE_PATTERNS: RegExp[] = [
  /\b(no|without|avoid|exclude)\s+(on-?screen\s+)?(text|caption(s)?|subtitle(s)?|logo(s)?|watermark(s)?|brand(s|ing)?|people|humans?|hands?|fingers?|distortion|artifact(s)?|blur)\b[^,.]*/gi,
  /\bnegative:\s*([^\n.]+)/gi,
];

export interface SanitizeResult {
  positive: string;
  negative: string;
}

export function sanitizeNegativePhrases(prompt: string): SanitizeResult {
  if (!prompt) return { positive: '', negative: '' };
  const collected: string[] = [];
  let cleaned = prompt;
  for (const re of NEGATIVE_PATTERNS) {
    cleaned = cleaned.replace(re, (match, ...groups) => {
      // For the explicit "negative:" form, capture group 1 is the payload;
      // for "no/without/avoid" forms, the entire match is the payload.
      const isExplicit = /^negative:/i.test(match);
      const payload = isExplicit ? String(groups[0] ?? '').trim() : match.trim();
      if (payload) collected.push(payload.replace(/^(no|without|avoid|exclude)\s+/i, '').trim());
      return '';
    });
  }
  // Tidy up double commas / leading punctuation left behind by removal.
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s,;.]+/, '')
    .trim();

  const negative = Array.from(new Set(collected.filter(Boolean))).join(', ');
  return { positive: cleaned, negative };
}

// ---------------------------------------------------------------------------
// Brand character auto-inject (Phase 2) with Jaccard de-dup (Phase 4)
// ---------------------------------------------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

/** Jaccard overlap (|A∩B| / |A∪B|) — 0..1. Higher = more similar. */
export function jaccardOverlap(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Inject brand character description only when the prompt does not already
 * describe the character (Jaccard ≥ 0.6 → considered already present).
 */
function injectBrandCharacter(
  prompt: string,
  brand?: ComposerInputs['brandCharacter'],
): { text: string; injected: boolean } {
  if (!brand?.identityCardPrompt) return { text: prompt, injected: false };
  const overlap = jaccardOverlap(prompt, brand.identityCardPrompt);
  if (overlap >= 0.6) return { text: prompt, injected: false };
  const trimmed = prompt.trim().replace(/[.,;]\s*$/, '');
  return {
    text: `${trimmed}. ${brand.identityCardPrompt}`,
    injected: true,
  };
}

// ---------------------------------------------------------------------------
// Main composer
// ---------------------------------------------------------------------------

export function composePromptLayers(inputs: ComposerInputs): ComposerResult {
  const layers: ComposerLayerBreakdown[] = [];
  const dropped: AxisFragment[] = [];

  // 1) Resolve @character / @location mentions against the library.
  const resolved = resolveMentions(
    inputs.rawPrompt || '',
    inputs.libraryCharacters ?? [],
    inputs.libraryLocations ?? [],
  );
  layers.push({
    source: 'rawPrompt',
    label: 'Raw Prompt',
    text: inputs.rawPrompt || '',
    applied: true,
  });
  if (resolved.matches.length > 0) {
    layers.push({
      source: 'mentions',
      label: 'Mentions resolved',
      text: resolved.prompt,
      applied: true,
    });
  }

  // 2) Brand character auto-inject — gated on `appliesToScene` so B-roll
  //    scenes (no character featured) don't accidentally render the character.
  const sceneFeaturesBrand = inputs.brandCharacter?.appliesToScene === true;
  const brandStep = sceneFeaturesBrand
    ? injectBrandCharacter(resolved.prompt, inputs.brandCharacter)
    : { text: resolved.prompt, injected: false };
  if (inputs.brandCharacter?.identityCardPrompt) {
    const skipReason = !sceneFeaturesBrand
      ? 'skipped — scene not featuring character'
      : 'skipped — already described';
    layers.push({
      source: 'brandCharacter',
      label: brandStep.injected
        ? 'Brand Character (injected)'
        : `Brand Character (${skipReason})`,
      text: inputs.brandCharacter.identityCardPrompt,
      applied: brandStep.injected,
    });
  }

  // 3) Collect cinematic fragments from each layer for axis-aware dedup.
  const fragments: AxisFragment[] = [];

  // Director Modifiers — apply to a temp string then split.
  if (inputs.directorModifiers && Object.values(inputs.directorModifiers).some(Boolean)) {
    const dmText = applyDirectorModifiers('', inputs.directorModifiers)
      .replace(/^\.\s*/, '')
      .replace(/\.$/, '');
    fragments.push(...classifyFragments('directorModifier', dmText));
    layers.push({
      source: 'directorModifier',
      label: 'Director Modifiers',
      text: dmText,
      applied: true,
    });
  }

  // Cinematic Style Preset — its ShotSelection is rendered via shot suffix.
  const presetSelection = inputs.cinematicStylePresetId
    ? findStylePreset(inputs.cinematicStylePresetId)?.selection
    : undefined;
  if (presetSelection) {
    const presetText = buildShotPromptSuffix(presetSelection).replace(/^Cinematography:\s*/, '').replace(/\.$/, '');
    fragments.push(...classifyFragments('cinematicPreset', presetText));
    layers.push({
      source: 'cinematicPreset',
      label: 'Cinematic Preset',
      text: presetText,
      applied: true,
    });
  }

  // Shot Director — highest priority cinematography layer.
  if (inputs.shotDirector && Object.values(inputs.shotDirector).some(Boolean)) {
    const shotText = buildShotPromptSuffix(inputs.shotDirector).replace(/^Cinematography:\s*/, '').replace(/\.$/, '');
    fragments.push(...classifyFragments('shotDirector', shotText));
    layers.push({
      source: 'shotDirector',
      label: 'Shot Director',
      text: shotText,
      applied: true,
    });
  }

  // 4) Resolve axis conflicts.
  const { winners, dropped: droppedFrags } = resolveAxisConflicts(fragments);
  dropped.push(...droppedFrags);

  // 5) Stitch positive prompt: brand-injected text + cinematography clause.
  const cinematography = winners.map((w) => w.text).join(', ');
  const positiveBeforeSanitize = cinematography
    ? `${brandStep.text.trim().replace(/[.,;]\s*$/, '')}. Cinematography: ${cinematography}.`
    : brandStep.text;

  // 6) Sanitize negative phrases out of the positive prompt.
  const { positive, negative } = sanitizeNegativePhrases(positiveBeforeSanitize);
  if (negative) {
    layers.push({
      source: 'negative',
      label: 'Negative (extracted → negative_prompt)',
      text: negative,
      applied: true,
    });
  }

  return {
    finalPrompt: positive,
    negativePrompt: negative,
    referenceImageUrl: resolved.referenceImageUrl,
    layers,
    dropped,
    mentions: resolved.matches,
  };
}

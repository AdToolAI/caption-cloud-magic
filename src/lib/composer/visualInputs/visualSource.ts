/**
 * visualSource.ts — v430 Step 3: the persisted visual-input INTENTION.
 *
 * CONTRACT (approved plan, Step 3):
 *  - `visual_source` is a STRATEGY only. It never holds an asset URL and never
 *    replaces `reference_image_url`, `continuity_source_scene_id` or any
 *    upload field. Asset truth stays exactly where it is today.
 *  - `null` means "legacy / unmigrated scene": the resolver must behave
 *    byte-identically to the pre-v430 arbitration. `null` is NOT `auto`.
 *    `auto` is an explicitly chosen automatic strategy.
 *  - This module is strictly pure. It never persists anything. The only writer
 *    of `visual_source` is the explicit user action in the UI.
 *  - Invalid combinations are never silently rewritten: the requested strategy
 *    stays, and the resolver reports `requested !== effective` with a reason.
 */

import type { VisualInputProfile } from './types';

export const VISUAL_SOURCE_STRATEGIES = [
  'auto',
  'character_anchor',
  'previous_final_frame',
  'uploaded_reference',
  'generated_still',
] as const;

export type VisualSourceStrategy = (typeof VISUAL_SOURCE_STRATEGIES)[number];

/** `null` = legacy/unmigrated scene. Semantically distinct from `'auto'`. */
export type PersistedVisualSource = VisualSourceStrategy | null;

export type VisualSourceOverrideReason =
  | 'lipsync_continuity_disabled'
  | 'provider_slot_unsupported'
  | 'no_previous_scene'
  | 'no_anchor_image';

export interface VisualSourceDecision {
  /** Exactly what the user chose (or `null` for a legacy scene). */
  requested: PersistedVisualSource;
  /** What the resolver actually applies. */
  effective: VisualSourceStrategy;
  overridden: boolean;
  reason?: VisualSourceOverrideReason;
}

export function isVisualSourceStrategy(value: unknown): value is VisualSourceStrategy {
  return (
    typeof value === 'string' &&
    (VISUAL_SOURCE_STRATEGIES as readonly string[]).includes(value)
  );
}

/** Normalises a raw DB value. Anything unknown degrades to `null` (legacy). */
export function parseVisualSource(value: unknown): PersistedVisualSource {
  return isVisualSourceStrategy(value) ? value : null;
}

/** A legacy scene has no persisted intention yet. */
export function isLegacyVisualSource(value: PersistedVisualSource): boolean {
  return value === null;
}

export interface VisualSourceContext {
  profile: VisualInputProfile;
  lipSync: boolean;
  hasAnchorImage: boolean;
  hasPreviousFrame: boolean;
  hasPreviousClip: boolean;
}

function providerCanChainPreviousScene(profile: VisualInputProfile): boolean {
  if (profile.firstFrame.supported) return true;
  const canTakeVideoReference =
    (profile.references.videos ?? 0) > 0 &&
    (profile.mode !== 'exclusive' || (profile.modes ?? []).includes('references'));
  return canTakeVideoReference;
}

/**
 * Deterministic requested → effective resolution. Pure; returns the decision
 * only. The caller keeps the requested value untouched for persistence/UI.
 */
export function resolveVisualSource(
  requested: PersistedVisualSource,
  ctx: VisualSourceContext,
): VisualSourceDecision {
  // Legacy scenes are never re-interpreted: the pre-v430 arbitration decides.
  if (requested === null) {
    return { requested: null, effective: 'auto', overridden: false };
  }

  const keep = (): VisualSourceDecision => ({ requested, effective: requested, overridden: false });
  const override = (
    effective: VisualSourceStrategy,
    reason: VisualSourceOverrideReason,
  ): VisualSourceDecision => ({ requested, effective, overridden: true, reason });

  if (requested === 'previous_final_frame') {
    // v425/v428 stay hard: a lip-sync scene never receives continuity.
    if (ctx.lipSync) return override('character_anchor', 'lipsync_continuity_disabled');
    if (!ctx.hasPreviousFrame && !ctx.hasPreviousClip) {
      return override(ctx.hasAnchorImage ? 'character_anchor' : 'auto', 'no_previous_scene');
    }
    if (!providerCanChainPreviousScene(ctx.profile)) {
      return override(ctx.hasAnchorImage ? 'character_anchor' : 'auto', 'provider_slot_unsupported');
    }
    return keep();
  }

  if (
    requested === 'character_anchor' ||
    requested === 'uploaded_reference' ||
    requested === 'generated_still'
  ) {
    if (!ctx.hasAnchorImage) return override('auto', 'no_anchor_image');
    return keep();
  }

  return keep(); // 'auto'
}

/**
 * Maps an EFFECTIVE strategy onto the existing continuity knob. Only ever
 * called for a non-legacy scene, so legacy behaviour cannot shift.
 */
export function continuityPreferenceForSource(
  effective: VisualSourceStrategy,
): 'auto' | 'seamless' | 'identity' {
  switch (effective) {
    case 'previous_final_frame':
      return 'seamless';
    case 'character_anchor':
    case 'uploaded_reference':
    case 'generated_still':
      return 'identity';
    default:
      return 'auto';
  }
}

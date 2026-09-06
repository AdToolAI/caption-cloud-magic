import {
  isEntitlementVerified,
  isVideoEnhanceFlagEnabled,
  isVideoEnhanceModelKilled,
} from './flags';
import { VIDEO_ENHANCE_MODELS } from './models';
import type {
  EnhanceConfig,
  OutputCombination,
  QualityTier,
  VideoEnhanceModelDefinition,
  VideoResolution,
} from './types';

export * from './types';
export * from './flags';
export { VIDEO_ENHANCE_MODELS };

export function getVideoEnhanceModel(id: string): VideoEnhanceModelDefinition | undefined {
  return VIDEO_ENHANCE_MODELS.find((m) => m.id === id);
}

/** Models a user may actually see. Visibility only — the backend decides runs. */
export function visibleVideoEnhanceModels(): VideoEnhanceModelDefinition[] {
  return VIDEO_ENHANCE_MODELS.filter(
    (m) =>
      !isVideoEnhanceModelKilled(m.id) &&
      (m.enabled || isVideoEnhanceFlagEnabled(m.featureFlag)),
  );
}

/** Combinations valid for one model + processing mode. */
export function outputsFor(
  model: VideoEnhanceModelDefinition,
  mode: string,
): OutputCombination[] {
  return model.outputsByMode?.[mode] ?? model.outputs;
}

export function availableResolutions(
  model: VideoEnhanceModelDefinition,
  mode: string,
): VideoResolution[] {
  return outputsFor(model, mode).map((o) => o.resolution);
}

export function availableFps(
  model: VideoEnhanceModelDefinition,
  mode: string,
  resolution: VideoResolution,
): number[] {
  return outputsFor(model, mode).find((o) => o.resolution === resolution)?.fps ?? [];
}

/** Tiers offered to a user — entitlement tiers stay hidden until verified. */
export function availableTiers(model: VideoEnhanceModelDefinition): QualityTier[] {
  return model.qualityTiers.filter(
    (tier) => !model.entitlementTiers?.includes(tier) || isEntitlementVerified(model.id, tier),
  );
}

export type CombinationError =
  | 'unknown_model'
  | 'unknown_mode'
  | 'unsupported_resolution'
  | 'unsupported_fps'
  | 'unknown_tier'
  | 'tier_not_entitled'
  | 'duration_too_short'
  | 'duration_too_long'
  | 'unsupported_output_quality'
  | 'unsupported_interpolation_model'
  | 'manual_params_not_supported';


export interface CombinationResult {
  ok: boolean;
  error?: CombinationError;
}

/**
 * Shared validation. An invalid combination is REJECTED, never silently
 * corrected — the same rule runs client-side for the UI and server-side as the
 * authority (`_shared/video-enhance-models.ts` mirrors this function).
 */
export function validateCombination(
  config: EnhanceConfig,
  durationSeconds?: number,
  entitled: (modelId: string, tier: string) => boolean = isEntitlementVerified,
): CombinationResult {
  const model = getVideoEnhanceModel(config.modelId);
  if (!model) return { ok: false, error: 'unknown_model' };
  if (!model.processingModes.some((m) => m.id === config.mode)) {
    return { ok: false, error: 'unknown_mode' };
  }
  const combos = outputsFor(model, config.mode);
  const combo = combos.find((c) => c.resolution === config.resolution);
  if (!combo) return { ok: false, error: 'unsupported_resolution' };
  if (config.fps !== null && !combo.fps.includes(config.fps)) {
    return { ok: false, error: 'unsupported_fps' };
  }
  if (!model.qualityTiers.includes(config.tier)) return { ok: false, error: 'unknown_tier' };
  if (model.entitlementTiers?.includes(config.tier) && !entitled(model.id, config.tier)) {
    return { ok: false, error: 'tier_not_entitled' };
  }
  if (durationSeconds !== undefined) {
    if (durationSeconds < model.minDurationSeconds) return { ok: false, error: 'duration_too_short' };
    if (durationSeconds > model.maxDurationSeconds) return { ok: false, error: 'duration_too_long' };
  }
  return { ok: true };
}

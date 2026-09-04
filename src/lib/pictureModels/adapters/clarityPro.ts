import { getPictureModel } from '@/config/pictureModels';
import type { EnhanceRunConfig, ProviderAdapter } from './types';

const MODEL_ID = 'clarity-pro';

/** Registry preset -> creativity value (-10..+10). */
function resolveCreativity(config: EnhanceRunConfig): number {
  if (typeof config.creativity === 'number') return clampRange(config.creativity, -10, 10);
  const model = getPictureModel(MODEL_ID);
  const preset = model?.presets?.find((p) => p.id === (config.presetId ?? 'balanced'));
  const value = preset?.values?.creativity;
  return typeof value === 'number' ? clampRange(value, -10, 10) : 0;
}

export const clarityProAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? '',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    const scale = config.scale ?? 2;
    if (![2, 4].includes(scale)) {
      return { ok: false, code: 'UNSUPPORTED_SCALE', message: `Scale ${scale}x is not supported` };
    }
    return { ok: true };
  },

  buildInput(config) {
    const creativity = resolveCreativity(config);
    // Clarity maps a -10..+10 slider onto creativity/resemblance pairs.
    const normalized = (creativity + 10) / 20; // 0..1
    return {
      image: config.imageUrl,
      scale_factor: config.scale ?? 2,
      creativity: round2(0.2 + normalized * 0.6),
      resemblance: round2(1.4 - normalized * 0.8),
      dynamic: 6,
      num_inference_steps: 18,
      prompt: config.prompt || 'masterpiece, best quality, highres',
      output_format: 'png',
    };
  },
};

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

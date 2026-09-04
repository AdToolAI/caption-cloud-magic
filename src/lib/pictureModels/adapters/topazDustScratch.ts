import { getPictureModel } from '@/config/pictureModels';
import type { EnhanceRunConfig, ProviderAdapter } from './types';

const MODEL_ID = 'topaz-dust-scratch';

export const topazDustScratchAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? 'topazlabs/dust-scratch',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    return { ok: true };
  },

  buildInput(config) {
    const input: Record<string, unknown> = {
      image: config.imageUrl,
      output_format: 'png',
    };
    if (config.filmGrain) {
      input.film_grain = true;
      input.film_grain_strength = Math.min(1, Math.max(0, config.filmGrainStrength ?? 0.3));
    }
    return input;
  },
};

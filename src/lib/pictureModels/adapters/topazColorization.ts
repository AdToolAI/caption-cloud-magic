import { getPictureModel } from '@/config/pictureModels';
import type { EnhanceRunConfig, ProviderAdapter } from './types';

const MODEL_ID = 'topaz-colorization';

export const topazColorizationAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? 'topazlabs/image-colorization',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    return { ok: true };
  },

  buildInput(config) {
    return {
      image: config.imageUrl,
      // Natural (0) .. Vivid (1)
      saturation: Math.min(1, Math.max(0, config.vividness ?? 0.5)),
      output_format: 'png',
    };
  },
};

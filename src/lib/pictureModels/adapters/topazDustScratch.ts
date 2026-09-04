import { getPictureModel } from '@/config/pictureModels';
import { bool, num, str, type EnhanceRunConfig, type ProviderAdapter } from './types';

const MODEL_ID = 'topaz-dust-scratch';
const GRAIN_MODELS = ['silver rich', 'gaussian', 'grey'] as const;
const FORMATS = ['png', 'jpg'] as const;

export const topazDustScratchAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? 'topazlabs/dust-and-scratch-v2',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    return { ok: true };
  },

  buildInput(config) {
    const values = config.values ?? {};
    const grain = bool(values, 'filmGrain', false);
    const input: Record<string, unknown> = {
      image: config.imageUrl,
      grain,
      output_format: str(values, 'outputFormat', 'png', FORMATS),
    };
    if (grain) {
      input.grain_model = str(values, 'grainModel', 'silver rich', GRAIN_MODELS);
      input.grain_strength = Math.round(num(values, 'grainStrength', 30, 0, 60));
      input.grain_density = Math.round(num(values, 'grainDensity', 30, 0, 60));
      input.grain_size = Math.round(num(values, 'grainSize', 1, 1, 5));
    }
    return input;
  },
};

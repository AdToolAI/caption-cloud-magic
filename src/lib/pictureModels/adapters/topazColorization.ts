import { getPictureModel } from '@/config/pictureModels';
import { num, str, type EnhanceRunConfig, type ProviderAdapter } from './types';

const MODEL_ID = 'topaz-colorization';
const FORMATS = ['png', 'jpg'] as const;

function resolveValues(config: EnhanceRunConfig): Record<string, unknown> {
  const model = getPictureModel(MODEL_ID);
  const preset = model?.presets?.find((p) => p.id === config.presetId);
  return { ...(preset?.values ?? {}), ...(config.values ?? {}) };
}

export const topazColorizationAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? 'topazlabs/image-colorization',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    return { ok: true };
  },

  buildInput(config) {
    const values = resolveValues(config);
    return {
      image: config.imageUrl,
      saturation: num(values, 'saturation', 0.2, 0, 1),
      output_format: str(values, 'outputFormat', 'png', FORMATS),
    };
  },
};

import { getPictureModel } from '@/config/pictureModels';
import type { EnhanceRunConfig, ProviderAdapter } from './types';

const MODEL_ID = 'topaz-image-upscale';
const ENHANCE_MODELS = [
  'Standard V2',
  'High Fidelity V2',
  'Low Resolution V2',
  'CGI',
  'Text Refine',
] as const;

function resolveEnhanceModel(config: EnhanceRunConfig): string {
  const model = getPictureModel(MODEL_ID);
  const preset = model?.presets?.find((p) => p.id === (config.presetId ?? 'auto'));
  const value = preset?.values?.enhanceModel;
  return typeof value === 'string' && (ENHANCE_MODELS as readonly string[]).includes(value)
    ? value
    : 'Standard V2';
}

export const topazImageUpscaleAdapter: ProviderAdapter = {
  modelId: MODEL_ID,
  providerModelId: getPictureModel(MODEL_ID)?.providerModelId ?? 'topazlabs/image-upscale',

  validate(config) {
    if (!config.imageUrl) return { ok: false, code: 'MISSING_IMAGE', message: 'No source image' };
    const scale = config.scale ?? 2;
    if (![2, 4, 6].includes(scale)) {
      return { ok: false, code: 'UNSUPPORTED_SCALE', message: `Scale ${scale}x is not supported` };
    }
    return { ok: true };
  },

  buildInput(config) {
    const input: Record<string, unknown> = {
      image: config.imageUrl,
      enhance_model: resolveEnhanceModel(config),
      upscale_factor: `${config.scale ?? 2}x`,
      output_format: 'png',
    };
    if (config.faceEnhancement) {
      input.face_enhancement = true;
      input.face_enhancement_strength = clamp01(config.faceEnhancementStrength ?? 0.5);
      input.face_enhancement_creativity = clamp01(config.creativity ?? 0);
    }
    return input;
  },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export { ENHANCE_MODELS as TOPAZ_ENHANCE_MODELS };

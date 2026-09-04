import { getPictureModel } from '@/config/pictureModels';
import { bool, num, str, type EnhanceRunConfig, type ProviderAdapter } from './types';

const MODEL_ID = 'clarity-pro';
const FORMATS = ['png', 'jpg', 'webp'] as const;
const HANDFIX = ['disabled', 'hands_only', 'image_and_hands'] as const;
const TILES = [16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256];

const DEFAULT_PROMPT =
  'masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>';
const DEFAULT_NEGATIVE =
  '(worst quality, low quality, normal quality:2) JuggernautNegative-neg';

/** Preset values are the baseline; explicit control values win. */
function resolveValues(config: EnhanceRunConfig): Record<string, unknown> {
  const model = getPictureModel(MODEL_ID);
  const preset = model?.presets?.find((p) => p.id === config.presetId);
  return { ...(preset?.values ?? {}), ...(config.values ?? {}) };
}

function tile(values: Record<string, unknown>, key: string, fallback: number): number {
  const value = num(values, key, fallback);
  return TILES.includes(value) ? value : fallback;
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
    const values = resolveValues(config);
    const prompt = str(values, 'prompt', '').trim();
    const negative = str(values, 'negativePrompt', '').trim();

    return {
      image: config.imageUrl,
      scale_factor: config.scale ?? 2,
      creativity: num(values, 'creativity', 0.35, 0, 1),
      resemblance: num(values, 'resemblance', 0.6, 0, 3),
      dynamic: num(values, 'dynamic', 6, 1, 50),
      sharpen: num(values, 'sharpen', 0, 0, 10),
      num_inference_steps: Math.round(num(values, 'numInferenceSteps', 18, 1, 100)),
      prompt: prompt ? `${prompt}, ${DEFAULT_PROMPT}` : DEFAULT_PROMPT,
      negative_prompt: negative ? `${negative}, ${DEFAULT_NEGATIVE}` : DEFAULT_NEGATIVE,
      handfix: str(values, 'handfix', 'disabled', HANDFIX),
      tiling_width: tile(values, 'tilingWidth', 112),
      tiling_height: tile(values, 'tilingHeight', 144),
      seed: Math.round(num(values, 'seed', 1337)),
      downscaling: bool(values, 'downscaling', false),
      output_format: str(values, 'outputFormat', 'png', FORMATS),
    };
  },
};

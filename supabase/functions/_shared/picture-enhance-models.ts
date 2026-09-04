/**
 * Server-side mirror of the Picture Studio enhance registry + adapters.
 *
 * The client registry (`src/config/pictureModels`) drives the UI; this file is
 * the authority for what actually reaches Replicate: allowed models, clamped
 * parameters and the billed price. Never trust a payload built in the browser.
 */

export type EnhanceModelId =
  | 'clarity-pro'
  | 'topaz-image-upscale'
  | 'topaz-dust-scratch'
  | 'topaz-colorization';

import {
  priceRun,
  type PricingSnapshot,
} from './picture-pricing.ts';

export type { PricingSnapshot };

export interface EnhanceModelSpec {
  id: EnhanceModelId;
  providerModelId: string;
  supportedScales?: number[];
  pricing:
    | { unit: 'fixed_per_scale'; sell: Record<number, number> }
    | { unit: 'per_output_megapixel'; providerCostEUR: number }
    | { unit: 'per_run'; providerCostEUR: number };
  /** Requires an explicit environment opt-in until the real test run passed. */
  requiresFlag?: string;
  buildInput(config: EnhanceRunInput): Record<string, unknown>;
}

export interface EnhanceRunInput {
  imageUrl: string;
  scale?: number;
  values?: Record<string, unknown>;
  inputWidth?: number;
  inputHeight?: number;
}

/** Payment processing keeps ~10% of the gross. */
export const PAYMENT_NET_FACTOR = 0.9;
/** Sell price must be at least 1.75x the real provider cost (net of fees). */
export const MARGIN_FLOOR_MULTIPLE = 1.75;

function num(
  values: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const raw = values?.[key];
  let value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  if (min !== undefined) value = Math.max(min, value);
  if (max !== undefined) value = Math.min(max, value);
  return value;
}

function str(
  values: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
  allowed?: readonly string[],
): string {
  const raw = values?.[key];
  const value = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
  if (allowed && !allowed.includes(value)) return fallback;
  return value;
}

function bool(values: Record<string, unknown> | undefined, key: string, fallback = false): boolean {
  const raw = values?.[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

const TOPAZ_ENHANCE_MODELS = [
  'Standard V2',
  'Low Resolution V2',
  'CGI',
  'High Fidelity V2',
  'Text Refine',
] as const;

export function autoTopazEnhanceModel(config: EnhanceRunInput): string {
  const pixels = (config.inputWidth ?? 0) * (config.inputHeight ?? 0);
  if (pixels > 0 && pixels < 640 * 640) return 'Low Resolution V2';
  if (bool(config.values, 'faceEnhancement', false)) return 'High Fidelity V2';
  return 'Standard V2';
}

export const ENHANCE_MODEL_SPECS: Record<EnhanceModelId, EnhanceModelSpec> = {
  'clarity-pro': {
    id: 'clarity-pro',
    providerModelId:
      'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
    supportedScales: [2, 4],
    pricing: { unit: 'fixed_per_scale', sell: { 2: 0.03, 4: 0.06 } },
    buildInput(config) {
      const v = config.values;
      const prompt = str(v, 'prompt', '').trim();
      const negative = str(v, 'negativePrompt', '').trim();
      const basePrompt =
        'masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>';
      const baseNegative = '(worst quality, low quality, normal quality:2) JuggernautNegative-neg';
      const tiles = [16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256];
      const tile = (key: string, fallback: number) => {
        const value = Math.round(num(v, key, fallback));
        return tiles.includes(value) ? value : fallback;
      };
      return {
        image: config.imageUrl,
        scale_factor: config.scale ?? 2,
        creativity: num(v, 'creativity', 0.35, 0, 1),
        resemblance: num(v, 'resemblance', 0.6, 0, 3),
        dynamic: num(v, 'dynamic', 6, 1, 50),
        sharpen: num(v, 'sharpen', 0, 0, 10),
        num_inference_steps: Math.round(num(v, 'numInferenceSteps', 18, 1, 100)),
        prompt: prompt ? `${prompt}, ${basePrompt}` : basePrompt,
        negative_prompt: negative ? `${negative}, ${baseNegative}` : baseNegative,
        handfix: str(v, 'handfix', 'disabled', ['disabled', 'hands_only', 'image_and_hands']),
        tiling_width: tile('tilingWidth', 112),
        tiling_height: tile('tilingHeight', 144),
        seed: Math.round(num(v, 'seed', 1337)),
        output_format: str(v, 'outputFormat', 'png', ['png', 'jpg', 'webp']),
      };
    },
  },
  'topaz-image-upscale': {
    id: 'topaz-image-upscale',
    providerModelId: 'topazlabs/image-upscale',
    supportedScales: [2, 4, 6],
    pricing: { unit: 'per_output_megapixel', providerCostEUR: 0.0018 },
    requiresFlag: 'PICTURE_TOPAZ_UPSCALE_ENABLED',
    buildInput(config) {
      const v = config.values;
      const requested = str(v, 'enhanceModel', 'auto');
      const enhanceModel = (TOPAZ_ENHANCE_MODELS as readonly string[]).includes(requested)
        ? requested
        : autoTopazEnhanceModel(config);
      const input: Record<string, unknown> = {
        image: config.imageUrl,
        enhance_model: enhanceModel,
        upscale_factor: `${config.scale ?? 2}x`,
        subject_detection: str(v, 'subjectDetection', 'None', [
          'None',
          'All',
          'Foreground',
          'Background',
        ]),
        output_format: str(v, 'outputFormat', 'png', ['png', 'jpg']),
        face_enhancement: bool(v, 'faceEnhancement', false),
      };
      if (input.face_enhancement) {
        input.face_enhancement_strength = num(v, 'faceEnhancementStrength', 0.8, 0, 1);
        input.face_enhancement_creativity = num(v, 'faceEnhancementCreativity', 0, 0, 1);
      }
      return input;
    },
  },
  'topaz-dust-scratch': {
    id: 'topaz-dust-scratch',
    providerModelId: 'topazlabs/dust-and-scratch-v2',
    pricing: { unit: 'per_run', providerCostEUR: 0.02 },
    requiresFlag: 'PICTURE_TOPAZ_RESTORE_ENABLED',
    buildInput(config) {
      const v = config.values;
      const grain = bool(v, 'filmGrain', false);
      const input: Record<string, unknown> = {
        image: config.imageUrl,
        grain,
        output_format: str(v, 'outputFormat', 'png', ['png', 'jpg']),
      };
      if (grain) {
        input.grain_model = str(v, 'grainModel', 'silver rich', ['silver rich', 'gaussian', 'grey']);
        input.grain_strength = Math.round(num(v, 'grainStrength', 30, 0, 60));
        input.grain_density = Math.round(num(v, 'grainDensity', 30, 0, 60));
        input.grain_size = Math.round(num(v, 'grainSize', 1, 1, 5));
      }
      return input;
    },
  },
  'topaz-colorization': {
    id: 'topaz-colorization',
    providerModelId: 'topazlabs/image-colorization',
    pricing: { unit: 'per_run', providerCostEUR: 0.02 },
    requiresFlag: 'PICTURE_TOPAZ_COLORIZE_ENABLED',
    buildInput(config) {
      const v = config.values;
      return {
        image: config.imageUrl,
        saturation: num(v, 'saturation', 0.2, 0, 1),
        output_format: str(v, 'outputFormat', 'png', ['png', 'jpg']),
      };
    },
  },
};

/** Authoritative price + full pricing snapshot for one run. */
export function priceSnapshotForRun(
  spec: EnhanceModelSpec,
  config: EnhanceRunInput,
): PricingSnapshot {
  return priceRun(spec.id, {
    scale: config.scale,
    inputWidth: config.inputWidth,
    inputHeight: config.inputHeight,
  });
}

/** Price in wallet currency units (EUR/USD are priced 1:1 across the app). */
export function priceForRun(spec: EnhanceModelSpec, config: EnhanceRunInput): number {
  return priceSnapshotForRun(spec, config).userPriceEur;
}

/**
 * A model may run when the backend switch is on, or when the caller is on the
 * explicit test allowlist. The frontend flag alone never unlocks anything.
 */
export function isModelUnlocked(
  spec: EnhanceModelSpec,
  env: (key: string) => string | undefined,
  userId?: string,
): boolean {
  if (!spec.requiresFlag) return true;
  if (env(spec.requiresFlag) === 'true') return true;
  const allowlist = (env('PICTURE_ENHANCE_TEST_USER_IDS') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return !!userId && allowlist.includes(userId);
}

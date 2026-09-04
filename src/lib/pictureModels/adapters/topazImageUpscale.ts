import { getPictureModel } from '@/config/pictureModels';
import { bool, num, str, type EnhanceRunConfig, type ProviderAdapter } from './types';

const MODEL_ID = 'topaz-image-upscale';

export const TOPAZ_ENHANCE_MODELS = [
  'Standard V2',
  'Low Resolution V2',
  'CGI',
  'High Fidelity V2',
  'Text Refine',
] as const;

export type TopazEnhanceModel = (typeof TOPAZ_ENHANCE_MODELS)[number];

const SUBJECT_DETECTION = ['None', 'All', 'Foreground', 'Background'] as const;
const FORMATS = ['png', 'jpg'] as const;

export interface AutoModelHints {
  inputWidth?: number;
  inputHeight?: number;
  /** Image is mostly text/screenshot. */
  hasText?: boolean;
  hasFaces?: boolean;
  isIllustration?: boolean;
}

/**
 * Auto never hides its choice — the UI shows "Selected: High Fidelity V2".
 * Pure heuristic, no AI call per keystroke.
 */
export function autoEnhanceModel(hints: AutoModelHints): TopazEnhanceModel {
  if (hints.hasText) return 'Text Refine';
  if (hints.isIllustration) return 'CGI';
  const pixels = (hints.inputWidth ?? 0) * (hints.inputHeight ?? 0);
  if (pixels > 0 && pixels < 640 * 640) return 'Low Resolution V2';
  if (hints.hasFaces) return 'High Fidelity V2';
  return 'Standard V2';
}

function resolveValues(config: EnhanceRunConfig): Record<string, unknown> {
  const model = getPictureModel(MODEL_ID);
  const preset = model?.presets?.find((p) => p.id === config.presetId);
  return { ...(preset?.values ?? {}), ...(config.values ?? {}) };
}

export function resolveTopazEnhanceModel(config: EnhanceRunConfig): TopazEnhanceModel {
  const values = resolveValues(config);
  const raw = str(values, 'enhanceModel', 'auto');
  if ((TOPAZ_ENHANCE_MODELS as readonly string[]).includes(raw)) return raw as TopazEnhanceModel;
  return autoEnhanceModel({
    inputWidth: config.inputWidth,
    inputHeight: config.inputHeight,
    hasFaces: bool(values, 'faceEnhancement', false),
  });
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
    const values = resolveValues(config);
    const input: Record<string, unknown> = {
      image: config.imageUrl,
      enhance_model: resolveTopazEnhanceModel(config),
      upscale_factor: `${config.scale ?? 2}x`,
      subject_detection: str(values, 'subjectDetection', 'None', SUBJECT_DETECTION),
      output_format: str(values, 'outputFormat', 'png', FORMATS),
      face_enhancement: bool(values, 'faceEnhancement', false),
    };
    if (input.face_enhancement) {
      input.face_enhancement_strength = num(values, 'faceEnhancementStrength', 0.8, 0, 1);
      input.face_enhancement_creativity = num(values, 'faceEnhancementCreativity', 0, 0, 1);
    }
    return input;
  },
};

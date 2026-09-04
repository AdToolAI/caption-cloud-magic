import { getPictureModel, type PictureModelDefinition } from '@/config/pictureModels';

/**
 * Picture Studio pricing engine.
 * Provider cost -> margin -> end price. Every surface calls estimatePrice().
 */

/** Payment processing keeps ~10% of the gross. */
export const PAYMENT_NET_FACTOR = 0.9;
/** Sell price must be at least 1.75x the real provider cost (net of fees). */
export const MARGIN_FLOOR_MULTIPLE = 1.75;

export interface PriceConfig {
  modelId: string;
  /** Source image dimensions (needed for megapixel pricing). */
  inputWidth?: number;
  inputHeight?: number;
  scale?: number;
  /** Number of images in this run (batch). */
  images?: number;
}

export interface PriceEstimate {
  modelId: string;
  unit: PictureModelDefinition['pricing']['unit'];
  providerCostEUR: number;
  sellEUR: number;
  marginPct: number;
  outputWidth?: number;
  outputHeight?: number;
  outputMegapixels?: number;
  costUnverified: boolean;
}

function roundUpCents(value: number): number {
  return Math.ceil(value * 100 - 1e-9) / 100;
}

export function outputDimensions(config: PriceConfig): { width?: number; height?: number } {
  const scale = config.scale ?? 1;
  if (!config.inputWidth || !config.inputHeight) return {};
  return { width: config.inputWidth * scale, height: config.inputHeight * scale };
}

export function estimatePrice(config: PriceConfig): PriceEstimate | null {
  const model = getPictureModel(config.modelId);
  if (!model) return null;

  const images = Math.max(1, config.images ?? 1);
  const { width, height } = outputDimensions(config);
  const megapixels = width && height ? (width * height) / 1_000_000 : undefined;

  let providerCost: number;
  switch (model.pricing.unit) {
    case 'per_output_megapixel':
      providerCost = model.pricing.providerCostEUR * (megapixels ?? 1);
      break;
    case 'per_image':
    case 'per_run':
    default:
      providerCost = model.pricing.providerCostEUR;
      break;
  }
  providerCost *= images;

  const fixed = model.pricing.fixedSellEUR;
  let sell: number;
  if (typeof fixed === 'number') {
    sell = fixed * images;
  } else if (fixed && config.scale && fixed[config.scale] != null) {
    sell = (fixed[config.scale] as number) * images;
  } else {
    sell = roundUpCents((providerCost * MARGIN_FLOOR_MULTIPLE) / PAYMENT_NET_FACTOR);
  }
  sell = Math.max(sell, 0.01);

  return {
    modelId: model.id,
    unit: model.pricing.unit,
    providerCostEUR: providerCost,
    sellEUR: sell,
    marginPct: sell > 0 ? (sell * PAYMENT_NET_FACTOR - providerCost) / (sell * PAYMENT_NET_FACTOR) : 0,
    outputWidth: width,
    outputHeight: height,
    outputMegapixels: megapixels,
    costUnverified: model.pricing.costUnverified === true,
  };
}

export function formatDimensions(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  return `${Math.round(width)} × ${Math.round(height)}`;
}

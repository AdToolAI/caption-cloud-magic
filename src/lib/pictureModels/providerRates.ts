/**
 * Provider rate cards for Picture Studio.
 *
 * A model never carries a single hardcoded EUR cost. It describes HOW the
 * provider bills (per run, per output megapixel, per size tier) and a cost
 * estimator derives the USD cost from the concrete run configuration. FX
 * conversion with a safety buffer happens here, before the margin engine.
 */

/** Manually maintained — no live FX call per generation. */
export const FX_RATE_USD_EUR = 0.92;
export const FX_RATE_UPDATED_AT = '2026-09-04';
/** Cushion against FX drift between two rate updates. */
export const FX_SAFETY_BUFFER = 0.03;
/** Bumped whenever a rate card changes. */
export const PROVIDER_PRICING_VERSION = 'rates-2026-09-04';
/** Admin warns when the maintained FX rate is older than this. */
export const FX_MAX_AGE_DAYS = 30;

export type ProviderRateCard =
  | { currency: 'USD'; type: 'per_run'; rateUsd: number; costUnverified?: boolean }
  | { currency: 'USD'; type: 'per_output_mp'; rateUsd: number; minMegapixels?: number; costUnverified?: boolean }
  | {
      currency: 'USD';
      type: 'output_mp_tier';
      tiers: { maxMegapixels: number; rateUsd: number }[];
      costUnverified?: boolean;
    };

export interface ProviderCostConfig {
  scale?: number;
  inputWidth?: number;
  inputHeight?: number;
  images?: number;
  values?: Record<string, unknown>;
}

/** Assumed output size when the source dimensions are unknown. */
export const FALLBACK_OUTPUT_MEGAPIXELS = 12;

export const PROVIDER_RATE_CARDS: Record<string, ProviderRateCard> = {
  'clarity-pro': { currency: 'USD', type: 'per_run', rateUsd: 0.013 },
  'topaz-image-upscale': {
    currency: 'USD',
    type: 'per_output_mp',
    rateUsd: 0.002,
    minMegapixels: 1,
    costUnverified: true,
  },
  'topaz-dust-scratch': { currency: 'USD', type: 'per_run', rateUsd: 0.022, costUnverified: true },
  'topaz-colorization': { currency: 'USD', type: 'per_run', rateUsd: 0.022, costUnverified: true },
};

export function outputMegapixels(config: ProviderCostConfig): number {
  const scale = config.scale ?? 1;
  const width = (config.inputWidth ?? 0) * scale;
  const height = (config.inputHeight ?? 0) * scale;
  if (!width || !height) return FALLBACK_OUTPUT_MEGAPIXELS;
  return (width * height) / 1_000_000;
}

/** Provider cost in USD for one run of this configuration. */
export function providerCostUsd(card: ProviderRateCard, config: ProviderCostConfig): number {
  const images = Math.max(1, config.images ?? 1);
  let perRun: number;
  switch (card.type) {
    case 'per_run':
      perRun = card.rateUsd;
      break;
    case 'per_output_mp': {
      const mp = Math.max(card.minMegapixels ?? 0, outputMegapixels(config));
      perRun = card.rateUsd * mp;
      break;
    }
    case 'output_mp_tier': {
      const mp = outputMegapixels(config);
      const tier =
        card.tiers.find((t) => mp <= t.maxMegapixels) ?? card.tiers[card.tiers.length - 1];
      perRun = tier.rateUsd;
      break;
    }
  }
  return perRun * images;
}

/** USD -> EUR with the safety buffer applied. This feeds the margin engine. */
export function bufferedProviderCostEur(costUsd: number): number {
  return costUsd * FX_RATE_USD_EUR * (1 + FX_SAFETY_BUFFER);
}

export function fxRateAgeDays(now: number = Date.now()): number {
  const updated = Date.parse(`${FX_RATE_UPDATED_AT}T00:00:00Z`);
  if (Number.isNaN(updated)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - updated) / 86_400_000);
}

export function isFxRateStale(now: number = Date.now()): boolean {
  return fxRateAgeDays(now) > FX_MAX_AGE_DAYS;
}

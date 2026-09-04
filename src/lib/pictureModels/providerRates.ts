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
export const PROVIDER_PRICING_VERSION = 'rates-2026-09-05';
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

/**
 * Official Replicate rate cards, read from the model pages on 2026-09-05.
 *
 * - topazlabs/image-upscale: unit table by output megapixels
 *   (12/24 MP $0.05 · 36/48 MP $0.10 · 60 MP $0.15 · 96 MP $0.20 ·
 *    132 MP $0.24 · 168 MP $0.29 · 336 MP $0.53 · 512 MP $0.82)
 * - philz1337x/clarity-upscaler: hardware billed, A100 40GB @ $0.00115/s,
 *   published median run $0.016
 * - topazlabs/dust-and-scratch-v2 / image-colorization: $0.08 per unit;
 *   published examples consume 1 resp. 2 units — unit count still unverified.
 *
 * `costUnverified` now means: official rate known, not yet reconciled against
 * a real AdTool run — it does NOT mean the price rule is a guess.
 */
export const PROVIDER_RATE_CARDS: Record<string, ProviderRateCard> = {
  'clarity-pro': { currency: 'USD', type: 'per_run', rateUsd: 0.016, costUnverified: true },
  'topaz-image-upscale': {
    currency: 'USD',
    type: 'output_mp_tier',
    tiers: [
      { maxMegapixels: 24, rateUsd: 0.05 },
      { maxMegapixels: 48, rateUsd: 0.1 },
      { maxMegapixels: 60, rateUsd: 0.15 },
      { maxMegapixels: 96, rateUsd: 0.2 },
      { maxMegapixels: 132, rateUsd: 0.24 },
      { maxMegapixels: 168, rateUsd: 0.29 },
      { maxMegapixels: 336, rateUsd: 0.53 },
      { maxMegapixels: 512, rateUsd: 0.82 },
      // Beyond the published table: extrapolated at the top-tier unit rate.
      { maxMegapixels: 1024, rateUsd: 1.64 },
    ],
    costUnverified: true,
  },
  'topaz-dust-scratch': { currency: 'USD', type: 'per_run', rateUsd: 0.08, costUnverified: true },
  'topaz-colorization': { currency: 'USD', type: 'per_run', rateUsd: 0.16, costUnverified: true },
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

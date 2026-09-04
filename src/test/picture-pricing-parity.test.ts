/**
 * Client display price and server charge must agree exactly.
 * The fixtures below are the contract: if one side changes, this fails.
 */
import { describe, it, expect } from 'vitest';
import { estimatePrice } from '@/lib/pictureModels/pricing';
import {
  priceRun,
  userPriceFromProviderCost,
  multiplierForCost,
  marginMetrics,
  bufferedProviderCostEur,
  MIN_CONTRIBUTION_EUR,
  MIN_PRICE_EUR,
  NET_FACTOR,
} from '../../supabase/functions/_shared/picture-pricing.ts';

const FIXTURES = [
  { modelId: 'clarity-pro', scale: 2, inputWidth: 1024, inputHeight: 1024 },
  { modelId: 'clarity-pro', scale: 4, inputWidth: 1024, inputHeight: 1024 },
  { modelId: 'topaz-image-upscale', scale: 2, inputWidth: 1920, inputHeight: 1080 },
  { modelId: 'topaz-image-upscale', scale: 4, inputWidth: 3000, inputHeight: 2000 },
  // Tier boundaries of the official unit table (24 / 48 / 96 output MP).
  { modelId: 'topaz-image-upscale', scale: 2, inputWidth: 3000, inputHeight: 2000 },
  { modelId: 'topaz-image-upscale', scale: 4, inputWidth: 2000, inputHeight: 1500 },
  { modelId: 'topaz-image-upscale', scale: 6, inputWidth: 1600, inputHeight: 1667 },
  { modelId: 'topaz-dust-scratch', inputWidth: 1600, inputHeight: 1200 },
  { modelId: 'topaz-colorization', inputWidth: 1600, inputHeight: 1200 },
];

describe('picture studio pricing parity', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.modelId}@${fixture.scale ?? 1}x matches on client and server`, () => {
      const client = estimatePrice(fixture);
      const server = priceRun(fixture.modelId, fixture);
      expect(client).not.toBeNull();
      expect(client!.userPriceEur).toBe(server.userPriceEur);
      expect(client!.pricingMode).toBe(server.pricingMode);
      expect(client!.pricingVersion).toBe(server.pricingVersion);
      expect(client!.providerPricingVersion).toBe(server.providerPricingVersion);
      expect(client!.providerCostEurBuffered).toBeCloseTo(server.providerCostEurBuffered, 10);
      expect(client!.multiplierUsed).toBe(server.multiplierUsed);
    });
  }

  it('keeps the live Clarity prices unchanged', () => {
    expect(priceRun('clarity-pro', { scale: 2 }).userPriceEur).toBe(0.03);
    expect(priceRun('clarity-pro', { scale: 4 }).userPriceEur).toBe(0.06);
    expect(priceRun('clarity-pro', { scale: 2 }).pricingMode).toBe('legacy_fixed');
  });

  it('never sells below the minimum contribution or the minimum price', () => {
    for (const cost of [0, 0.001, 0.01, 0.05, 0.2, 0.9, 2.5, 4, 8]) {
      const price = userPriceFromProviderCost(cost);
      const { contributionEUR } = marginMetrics(price, cost);
      expect(price).toBeGreaterThanOrEqual(MIN_PRICE_EUR);
      expect(contributionEUR).toBeGreaterThanOrEqual(MIN_CONTRIBUTION_EUR - 1e-9);
    }
  });

  it('applies a degressive multiplier that never inverts', () => {
    const costs = [0.01, 0.05, 0.3, 1, 3, 5, 20];
    const multipliers = costs.map(multiplierForCost);
    for (let i = 1; i < multipliers.length; i++) {
      expect(multipliers[i]).toBeLessThanOrEqual(multipliers[i - 1] + 1e-9);
    }
    expect(multipliers[0]).toBe(3);
    expect(multipliers[multipliers.length - 1]).toBe(1.8);
  });

  it('buffers FX so a rate move does not eat the margin', () => {
    expect(bufferedProviderCostEur(1)).toBeGreaterThan(0.92);
    expect(NET_FACTOR).toBe(0.9);
  });

  it('prices batches linearly', () => {
    const one = estimatePrice({ modelId: 'topaz-dust-scratch', images: 1 })!;
    const three = estimatePrice({ modelId: 'topaz-dust-scratch', images: 3 })!;
    expect(three.providerCostUsdEstimated).toBeCloseTo(one.providerCostUsdEstimated * 3, 10);
  });
});

describe('official provider rate cards (read 2026-09-05)', () => {
  it('prices Topaz Upscale from the published output-MP unit table', () => {
    // 3000x2000 @4x = 96 MP -> $0.20 tier
    expect(
      priceRun('topaz-image-upscale', { scale: 4, inputWidth: 3000, inputHeight: 2000 })
        .providerCostUsdEstimated,
    ).toBe(0.2);
    // 3000x2000 @2x = 24 MP -> first tier $0.05
    expect(
      priceRun('topaz-image-upscale', { scale: 2, inputWidth: 3000, inputHeight: 2000 })
        .providerCostUsdEstimated,
    ).toBe(0.05);
  });

  it('keeps Clarity on hardware billing, not per output megapixel', () => {
    const a = priceRun('clarity-pro', { scale: 2, inputWidth: 4000, inputHeight: 3000 });
    const b = priceRun('clarity-pro', { scale: 2, inputWidth: 800, inputHeight: 600 });
    expect(a.providerCostUsdEstimated).toBe(b.providerCostUsdEstimated);
    expect(a.providerCostUsdEstimated).toBe(0.016);
    // Legacy fixed price still covers the provider cost.
    expect(a.contributionEur).toBeGreaterThan(0);
  });

  it('prices the Topaz unit models at $0.08 per unit (1 unit each, measured 2026-09-05)', () => {
    expect(priceRun('topaz-dust-scratch', {}).providerCostUsdEstimated).toBe(0.08);
    expect(priceRun('topaz-colorization', {}).providerCostUsdEstimated).toBe(0.08);
  });
});

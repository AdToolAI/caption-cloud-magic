import { describe, expect, it } from 'vitest';
import {
  ceilCent,
  curveBand,
  curveFor,
  curveMultiplier,
  evaluateCurvePricing,
  evaluatePostDiscount,
  TOPAZ_CURVE,
  VCUBE_CURVE,
} from '@/lib/videoEnhance/curves';
import {
  TOPAZ_COST_ESTIMATOR_VERSION,
  topazEstimatedCredits,
  topazUncertaintyBuffer,
  topazCreditDrift,
} from '@/lib/videoEnhance/topazCostEstimator';
import { priceVideoEnhanceRun } from '@/lib/videoEnhance/pricing';
import { TOPAZ_DEFAULT_INTERPOLATION_ID } from '@/config/videoEnhanceModels/topazCatalog';

const source = {
  durationSeconds: 10,
  width: 1080,
  height: 1920,
  fps: 24,
} as never;

describe('provider-specific degressive curves', () => {
  it('keeps vCube inside 1.6x - 2.5x and Topaz inside 1.2x - 1.8x', () => {
    expect(curveBand(VCUBE_CURVE)).toEqual({ min: 1.6, max: 2.5 });
    expect(curveBand(TOPAZ_CURVE)).toEqual({ min: 1.2, max: 1.8 });
  });

  it('is degressive: a bigger job never gets a higher multiple', () => {
    for (const curve of [VCUBE_CURVE, TOPAZ_CURVE]) {
      let previous = Infinity;
      for (const cost of [0.05, 0.2, 0.5, 1, 2, 4, 6, 12]) {
        const m = curveMultiplier(curve, cost);
        expect(m).toBeLessThanOrEqual(previous + 1e-9);
        previous = m;
      }
    }
  });

  it('interpolates linearly between two points', () => {
    // vCube: 2.0 at 1 EUR, 1.8 at 2 EUR -> 1.9 at 1.50 EUR
    expect(curveMultiplier(VCUBE_CURVE, 1.5)).toBeCloseTo(1.9, 10);
    // Topaz: 1.5 at 2 EUR, 1.35 at 4 EUR -> 1.425 at 3 EUR
    expect(curveMultiplier(TOPAZ_CURVE, 3)).toBeCloseTo(1.425, 10);
  });

  it('never prices below the estimated provider cost, even after rounding', () => {
    for (const cost of [0.001, 0.004, 0.01, 0.33, 1.117, 5.005]) {
      for (const curve of [VCUBE_CURVE, TOPAZ_CURVE]) {
        const p = evaluateCurvePricing(cost, curve);
        expect(p.listPriceEur).toBeGreaterThanOrEqual(ceilCent(cost));
      }
    }
  });

  it('tolerates sub-cent rounding overshoot instead of flagging every micro-run', () => {
    const p = evaluateCurvePricing(0.002, VCUBE_CURVE);
    expect(p.listPriceEur).toBe(0.01);
    expect(p.gate).toBe('ok');
    expect(p.gateReason).toBeNull();
  });


  it('maps model ids to their own curve', () => {
    expect(curveFor('bytedance-vcube')).toBe(VCUBE_CURVE);
    expect(curveFor('topaz-video-upscale')).toBe(TOPAZ_CURVE);
    expect(curveFor('nope')).toBeUndefined();
  });
});

describe('post-discount loss policy', () => {
  it('classifies a discounted run that stays above cost as profitable', () => {
    const r = evaluatePostDiscount(2.0, 20, 1.0);
    expect(r.chargedPriceEur).toBe(1.6);
    expect(r.profitability).toBe('profitable');
    expect(r.subsidyEur).toBe(0);
  });

  it('classifies a discounted run below cost as subsidized and quantifies it', () => {
    const r = evaluatePostDiscount(1.2, 30, 1.0);
    expect(r.chargedPriceEur).toBe(0.84);
    expect(r.effectiveMultipleAfterDiscount!).toBeLessThan(1);
    expect(r.profitability).toBe('subsidized');
    expect(r.subsidyEur).toBe(0.16);
  });

  it('ignores nonsensical discount values instead of inventing a price', () => {
    expect(evaluatePostDiscount(1, 'nope', 0.5).discountPercent).toBe(0);
    expect(evaluatePostDiscount(1, -5, 0.5).discountPercent).toBe(0);
    expect(evaluatePostDiscount(1, 400, 0.5).discountPercent).toBe(0);
  });
});

describe('Topaz model-aware cost estimator', () => {
  it('is explicitly versioned', () => {
    expect(TOPAZ_COST_ESTIMATOR_VERSION).toBe('2026-09-08-calibrated-v1');
  });

  it('charges Apollo clearly more than Chronos for the same job', () => {
    const base = { durationSeconds: 15, targetFps: 60, resolution: '4k' as const, interpolationApplies: true };
    const apollo = topazEstimatedCredits({ ...base, interpolationModel: 'apollo' });
    const chronos = topazEstimatedCredits({ ...base, interpolationModel: 'chronos' });
    expect(apollo.credits).toBeGreaterThan(chronos.credits * 1.4);
  });

  it('reproduces the billed 51-credit reference run within the drift threshold', () => {
    const estimate = topazEstimatedCredits({
      durationSeconds: 15.042,
      targetFps: 60,
      resolution: '4k',
      interpolationModel: 'apollo',
      interpolationApplies: true,
    });
    expect(Math.abs(topazCreditDrift(estimate.credits, 51).driftPct!)).toBeLessThanOrEqual(0.15);
  });

  it('bills no interpolation when the frame rate stays the same', () => {
    const e = topazEstimatedCredits({
      durationSeconds: 10,
      targetFps: 30,
      resolution: '1080p',
      interpolationModel: 'apollo',
      interpolationApplies: false,
    });
    expect(e.interpolationModel).toBeNull();
    expect(e.credits).toBeLessThan(
      topazEstimatedCredits({
        durationSeconds: 10,
        targetFps: 30,
        resolution: '1080p',
        interpolationModel: 'apollo',
        interpolationApplies: true,
      }).credits,
    );
  });

  it('adds a safety buffer only to uncertain, expensive chains', () => {
    const uncertain = topazEstimatedCredits({
      durationSeconds: 15,
      targetFps: 60,
      resolution: '4k',
      interpolationModel: 'apollo',
      interpolationApplies: true,
    });
    expect(topazUncertaintyBuffer(uncertain, 4)).toBe(0.15);
    expect(topazUncertaintyBuffer(uncertain, 0.5)).toBe(0);
    const certain = topazEstimatedCredits({
      durationSeconds: 15,
      targetFps: 60,
      resolution: '4k',
      interpolationModel: 'chronos',
      interpolationApplies: true,
    });
    expect(topazUncertaintyBuffer(certain, 4)).toBe(0);
  });

  it('flags credit drift above 15 percent only', () => {
    expect(topazCreditDrift(20, 22).flagged).toBe(false);
    expect(topazCreditDrift(20, 30).flagged).toBe(true);
  });
});

describe('priced runs', () => {
  it('defaults to Chronos, not Apollo', () => {
    expect(TOPAZ_DEFAULT_INTERPOLATION_ID).toBe('chronos');
  });

  it('prices a Topaz Apollo run above the same Chronos run and records the chain', () => {
    const config = {
      modelId: 'topaz-video-upscale',
      mode: 'proteus',
      resolution: '4k' as const,
      fps: 60,
      tier: 'standard' as const,
    };
    const chronos = priceVideoEnhanceRun({ ...config, interpolationModel: 'chronos' }, source);
    const apollo = priceVideoEnhanceRun({ ...config, interpolationModel: 'apollo' }, source);
    expect(apollo.userPriceEur).toBeGreaterThan(chronos.userPriceEur);
    expect(apollo.interpolationModel).toBe('apollo');
    expect(apollo.costEstimatorVersion).toBe(TOPAZ_COST_ESTIMATOR_VERSION);
    expect(apollo.estimatedProviderCredits).toBeGreaterThan(0);
    for (const p of [chronos, apollo]) {
      expect(p.userPriceEur).toBeGreaterThanOrEqual(p.providerCostEurBuffered);
      expect(p.multiplierBandMin).toBe(1.2);
      expect(p.multiplierBandMax).toBe(1.8);
    }
  });

  it('keeps a normal vCube run inside its band', () => {
    const p = priceVideoEnhanceRun(
      { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '4k', fps: 60, tier: 'standard' },
      source,
    );
    expect(p.pricingGate === 'ok' || p.pricingGateReason === 'estimator_calibrating').toBe(true);
    expect(p.effectiveMultiplier!).toBeLessThanOrEqual(2.5 + 0.05);
    expect(p.effectiveMultiplier!).toBeGreaterThanOrEqual(1.6 - 0.05);
  });
});

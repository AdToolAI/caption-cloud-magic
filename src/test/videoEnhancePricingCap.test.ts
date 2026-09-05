import { describe, expect, it } from 'vitest';
import {
  capPriceForCost,
  evaluatePricing,
  evaluateTrueUp,
  MIN_PRICE_EUR,
  multiplierForCost,
  userPriceFromProviderCost,
} from '@/lib/pictureModels/marginCurve';
import { bufferedProviderCostEur } from '@/lib/pictureModels/providerRates';
import {
  priceVideoEnhanceRun,
  verifiedPricing,
} from '@/lib/videoEnhance/pricing';
import {
  VIDEO_PRICING_HARD_MULTIPLIER_CAP as CAP,
  VIDEO_PRICING_TARGET_MIN_MULTIPLIER as FLOOR_MULT,
  VIDEO_RATE_CARDS,
} from '@/lib/videoEnhance/rates';
import { getVideoEnhanceModel } from '@/config/videoEnhanceModels';
import type { EnhanceConfig, SourceMetadata } from '@/config/videoEnhanceModels';

const source = (over: Partial<SourceMetadata> = {}): SourceMetadata => ({
  durationSeconds: 20,
  width: 1080,
  height: 1920,
  fps: 30,
  ...over,
});

/** Every combination each model really offers — no hand-picked happy path. */
function allCombinations(): EnhanceConfig[] {
  const out: EnhanceConfig[] = [];
  for (const modelId of Object.keys(VIDEO_RATE_CARDS)) {
    const model = getVideoEnhanceModel(modelId);
    if (!model) continue;
    for (const mode of model.processingModes) {
      for (const output of model.outputs) {
        for (const fps of output.fps) {
          for (const tier of model.qualityTiers) {
            out.push({
              modelId,
              mode: mode.id,
              resolution: output.resolution,
              fps,
              tier,
            });
          }
        }
      }
    }
  }
  return out;
}

describe('degressive curve stays inside the band', () => {
  it('never returns a multiplier outside 1.8x..3.0x', () => {
    for (let cost = 0; cost <= 12; cost += 0.01) {
      const m = multiplierForCost(cost);
      expect(m).toBeLessThanOrEqual(CAP + 1e-9);
      expect(m).toBeGreaterThanOrEqual(FLOOR_MULT - 1e-9);
    }
  });

  it('is monotonically non-increasing with cost', () => {
    let previous = Infinity;
    for (let cost = 0; cost <= 12; cost += 0.01) {
      const m = multiplierForCost(cost);
      expect(m).toBeLessThanOrEqual(previous + 1e-9);
      previous = m;
    }
  });
});

describe('hard cap on the pre-run estimate', () => {
  it('caps a price that the floors would push above 3.0x', () => {
    // A tiny cost: the min price / min contribution floor dominates.
    const evaluation = evaluatePricing(0.001, {
      hardMultiplierCap: CAP,
      allowFloorAboveCap: false,
    });
    expect(evaluation.priceEur).toBeLessThanOrEqual(capPriceForCost(0.001, CAP) + 1e-9);
    expect(evaluation.gate).toBe('review_required');
    expect(evaluation.gateReason).toBe('floor_conflict');
  });

  it('flags but never silently exceeds the cap', () => {
    for (let cost = 0.0005; cost < 8; cost *= 1.35) {
      const evaluation = evaluatePricing(cost, {
        hardMultiplierCap: CAP,
        allowFloorAboveCap: false,
      });
      if (evaluation.effectiveMultiplier !== null) {
        expect(evaluation.effectiveMultiplier).toBeLessThanOrEqual(CAP + 1e-6);
      }
      if (evaluation.uncappedPriceEur > (evaluation.capPriceEur ?? 0) + 1e-9) {
        expect(evaluation.gate).toBe('review_required');
      }
    }
  });

  it('leaves the historical uncapped behaviour untouched when no cap is set', () => {
    for (const cost of [0.01, 0.2, 1.4, 4.2]) {
      expect(evaluatePricing(cost).priceEur).toBe(userPriceFromProviderCost(cost));
    }
  });

  it('never prices below the absolute minimum price when the cap allows it', () => {
    const evaluation = evaluatePricing(1, { hardMultiplierCap: CAP, allowFloorAboveCap: false });
    expect(evaluation.priceEur).toBeGreaterThanOrEqual(MIN_PRICE_EUR);
  });
});

describe('every real video-enhance combination respects the cap', () => {
  const combos = allCombinations();

  it('covers a non-trivial matrix', () => {
    expect(combos.length).toBeGreaterThan(20);
  });

  it('production price is never above 3.0x buffered estimated provider cost', () => {
    for (const config of combos) {
      let snapshot;
      try {
        snapshot = priceVideoEnhanceRun(config, source());
      } catch {
        continue; // unpriceable combinations must not start at all
      }
      const cap = capPriceForCost(snapshot.providerCostEurBuffered, CAP);
      expect(snapshot.userPriceEur).toBeLessThanOrEqual(Math.max(cap, MIN_PRICE_EUR) + 1e-9);
      if (snapshot.effectiveMultiplier !== null) {
        expect(snapshot.effectiveMultiplier).toBeLessThanOrEqual(CAP + 1e-6);
      }
      expect(snapshot.multiplierCap).toBe(CAP);
    }
  });

  it('flags any configuration whose floor conflicts with the cap for review', () => {
    for (const config of combos) {
      let snapshot;
      try {
        snapshot = priceVideoEnhanceRun(config, source());
      } catch {
        continue;
      }
      if ((snapshot.effectiveMultiplier ?? 0) > CAP + 1e-6) {
        expect(snapshot.pricingGate).toBe('review_required');
      }
    }
  });
});

describe('post-run true-up against verified provider cost', () => {
  it('refunds the overcharge so the verified multiplier lands at the cap', () => {
    // The measured Topaz case: charged well above 3x the real $0.48.
    const result = verifiedPricing({
      capturedUsageChargeEur: 3.18,
      providerCostUsdActual: 0.48,
    });
    expect(result.refundEur).toBeGreaterThan(0);
    expect(result.verifiedMultiplierBeforeTrueUp!).toBeGreaterThan(CAP);
    expect(result.verifiedMultiplierAfterTrueUp!).toBeLessThanOrEqual(CAP + 1e-6);
  });

  it('never charges back when the real cost is HIGHER than estimated', () => {
    const result = verifiedPricing({
      capturedUsageChargeEur: 0.72,
      providerCostUsdActual: 5.0,
    });
    expect(result.refundEur).toBe(0);
    expect(result.netUsageChargeEur).toBe(0.72);
  });

  it('does nothing and reports COST UNVERIFIED without a real cost number', () => {
    for (const cost of [null, undefined, 0, Number.NaN]) {
      const result = verifiedPricing({ capturedUsageChargeEur: 1.5, providerCostUsdActual: cost });
      expect(result.refundEur).toBe(0);
      expect(result.netUsageChargeEur).toBe(1.5);
      expect(result.verifiedMultiplierAfterTrueUp).toBeNull();
      expect(result.gateReason).toBe('cost_unverified');
    }
  });

  it('is stable when applied twice (idempotent maths)', () => {
    const first = evaluateTrueUp({
      capturedUsageChargeEur: 3.18,
      actualProviderCostEur: 0.44,
      hardMultiplierCap: CAP,
    });
    const second = evaluateTrueUp({
      capturedUsageChargeEur: first.netUsageChargeEur,
      actualProviderCostEur: 0.44,
      hardMultiplierCap: CAP,
    });
    expect(second.refundEur).toBe(0);
  });

  it('leaves a run inside the band untouched', () => {
    const costEur = 0.5;
    const price = evaluatePricing(bufferedProviderCostEur(0.5 / 0.92), {
      hardMultiplierCap: CAP,
      allowFloorAboveCap: false,
    }).priceEur;
    const result = evaluateTrueUp({
      capturedUsageChargeEur: price,
      actualProviderCostEur: costEur,
      hardMultiplierCap: CAP,
    });
    expect(result.refundEur).toBe(0);
    expect(result.gateReason).toBeNull();
  });
});

describe('Topaz rate card', () => {
  it('is billed per unit at the verified $0.08 unit price', () => {
    const card = VIDEO_RATE_CARDS['topaz-video-upscale'];
    expect(card.type).toBe('per_unit');
    if (card.type === 'per_unit') expect(card.unitUsd).toBe(0.08);
  });

  it('stays flagged as calibrating until real unit data exists', () => {
    const card = VIDEO_RATE_CARDS['topaz-video-upscale'];
    expect(card.estimatorCalibrating).toBe(true);
    expect(card.costUnverified).toBe(true);
  });

  it('surfaces the calibration state on the price snapshot', () => {
    const snapshot = priceVideoEnhanceRun(
      { modelId: 'topaz-video-upscale', mode: 'standard', resolution: '4k', fps: 30, tier: 'standard' },
      source(),
    );
    expect(snapshot.estimatorCalibrating).toBe(true);
    expect(snapshot.pricingGateReason).not.toBeNull();
  });
});

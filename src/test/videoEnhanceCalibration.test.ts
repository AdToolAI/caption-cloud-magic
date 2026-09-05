/**
 * Calibration semantics must stay strictly separate from pricing-gate
 * semantics, and a run without verified cost must stay true-up eligible.
 */
import { describe, it, expect } from 'vitest';
import { verifiedPricing } from '@/lib/videoEnhance/pricing';
import { PRICING_TARGET_MULTIPLIER_FLOOR } from '@/lib/pictureModels/marginCurve';
import { lateCostBackoffMinutes } from '../../supabase/functions/_shared/video-enhance-finalize.ts';

describe('calibration vs pricing gate', () => {
  it('flags a verified multiplier below the corridor as calibration only', () => {
    // Real Topaz smoke run: 0.22 EUR charged, 0.16 USD verified cost -> 1.49x.
    const result = verifiedPricing({
      capturedUsageChargeEur: 0.22,
      providerCostUsdActual: 0.16,
    });
    expect(result.refundEur).toBe(0);
    expect(result.gateReason).toBeNull();
    expect(result.calibrationStatus).toBe('review');
    expect(result.calibrationReason).toBe('below_target_corridor');
    expect(result.verifiedMultiplierAfterTrueUp).toBeLessThan(PRICING_TARGET_MULTIPLIER_FLOOR);
  });

  it('keeps calibration ok inside the corridor', () => {
    const result = verifiedPricing({
      capturedUsageChargeEur: 0.5,
      providerCostUsdActual: 0.25,
    });
    expect(result.calibrationStatus).toBe('ok');
    expect(result.calibrationReason).toBeNull();
    expect(result.gateReason).toBeNull();
  });

  it('refunds above the cap and never charges back below it', () => {
    const result = verifiedPricing({
      capturedUsageChargeEur: 1.01,
      providerCostUsdActual: 0.24,
    });
    expect(result.refundEur).toBeGreaterThan(0);
    expect(result.gateReason).toBe('actual_cost_drift');
    expect(result.verifiedMultiplierAfterTrueUp!).toBeLessThanOrEqual(3.0001);
  });

  it('treats an unverified cost as a gate reason, not a calibration verdict', () => {
    const result = verifiedPricing({
      capturedUsageChargeEur: 0.38,
      providerCostUsdActual: null,
    });
    expect(result.gateReason).toBe('cost_unverified');
    expect(result.calibrationStatus).toBe('ok');
    expect(result.refundEur).toBe(0);
  });
});

describe('late cost backoff', () => {
  it('grows from hours to days and caps at seven days', () => {
    expect(lateCostBackoffMinutes(0)).toBe(60);
    expect(lateCostBackoffMinutes(1)).toBeGreaterThan(lateCostBackoffMinutes(0));
    expect(lateCostBackoffMinutes(99)).toBe(7 * 24 * 60);
  });
});

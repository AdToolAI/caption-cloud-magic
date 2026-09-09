/**
 * vCube follow-ups after the pricing verification:
 *  1. the rate card is no longer `costUnverified`
 *  2. billed output seconds are converted into an actual provider cost
 *  3. a missing metric stays "unavailable" so the late re-read backfills later
 *  4. telemetry separates the TARGET multiplier from the EFFECTIVE one
 *  5. 120 fps stays hidden until a real validation run
 */
import { describe, it, expect } from 'vitest';
import { extractProviderCost } from '../../supabase/functions/_shared/video-enhance-runtime.ts';
import { VIDEO_RATE_CARDS } from '../../supabase/functions/_shared/video-enhance-models.ts';
import { VIDEO_RATE_CARDS as CLIENT_CARDS } from '../lib/videoEnhance/rates';
import { evaluateCurvePricing, VCUBE_CURVE } from '../lib/videoEnhance/curves';

const run = (over: Record<string, unknown> = {}) => ({
  model_id: 'bytedance-vcube',
  mode: 'aigc',
  resolution: '4k',
  fps: 60,
  tier: 'standard',
  source_fps: 24,
  ...over,
});

describe('vCube rate card verification', () => {
  it('is verified on both mirrors', () => {
    expect(VIDEO_RATE_CARDS['bytedance-vcube'].costUnverified).toBeFalsy();
    expect(CLIENT_CARDS['bytedance-vcube'].costUnverified).toBeFalsy();
  });

  it('still exposes 24/30/60 fps only — 120 fps stays hidden', () => {
    const card = CLIENT_CARDS['bytedance-vcube'];
    if (card.type !== 'per_second_matrix') throw new Error('expected matrix card');
    expect([...new Set(card.entries.map((e) => e.fps))].sort((a, b) => a - b)).toEqual([24, 30, 60]);
  });
});

describe('vCube actual-cost backfill', () => {
  it('prices billed output seconds with the verified matrix', () => {
    const reading = extractProviderCost(
      { metrics: { predict_time: 88.3, video_output_duration_seconds: 10 } },
      'bytedance-vcube',
      run(),
    );
    expect(reading.source).toBe('provider_usage');
    expect(reading.units).toBe(10);
    expect(reading.usd).toBeCloseTo(0.055097 * 10, 6);
  });

  it('uses the <=30 fps band for a 30 fps order', () => {
    const reading = extractProviderCost(
      { metrics: { video_output_duration_seconds: 9.934 } },
      'bytedance-vcube',
      run({ resolution: '1080p', fps: 30 }),
    );
    expect(reading.usd).toBeCloseTo(0.006887 * 9.934, 6);
  });

  it('falls back to the source frame rate when the order keeps it', () => {
    const reading = extractProviderCost(
      { metrics: { video_output_duration_seconds: 10 } },
      'bytedance-vcube',
      run({ resolution: '1080p', fps: null, source_fps: 24 }),
    );
    expect(reading.usd).toBeCloseTo(0.006887 * 10, 6);
  });

  it('stays usage-only when the order cannot be priced', () => {
    const reading = extractProviderCost(
      { metrics: { video_output_duration_seconds: 10 } },
      'bytedance-vcube',
      run({ fps: 120 }),
    );
    expect(reading.source).toBe('provider_usage');
    expect(reading.usd).toBeUndefined();
  });

  it('reports no metric as unavailable so the late re-read can backfill', () => {
    const reading = extractProviderCost({ metrics: { predict_time: 41 } }, 'bytedance-vcube', run());
    expect(reading.source).toBe('unavailable');
    expect(reading.usd).toBeUndefined();
  });
});

describe('multiplier telemetry', () => {
  it('separates the target multiplier from the effective one after cent rounding', () => {
    const pricing = evaluateCurvePricing(0.0647, VCUBE_CURVE);
    expect(pricing.targetMultiplier).toBe(pricing.multiplier);
    expect(pricing.effectiveMultiplier).not.toBeNull();
    expect(pricing.roundingUplift).toBeCloseTo(
      (pricing.effectiveMultiplier as number) - pricing.targetMultiplier,
      9,
    );
    // The customer-facing curve is untouched: 1.6x .. 2.5x.
    expect(pricing.band).toEqual({ min: 1.6, max: 2.5 });
  });
});

/**
 * The three corrections agreed before the release run:
 *
 *  1. Actual provider cost has an explicit source; a missing cost number never
 *     blocks a run and never marks it unverified.
 *  2. The manual-review horizon is configurable without a deploy.
 *  3. The persistence failure is a deterministic fail-once switch, honoured for
 *     allowlisted validation accounts only.
 */
import { describe, it, expect } from 'vitest';
import {
  extractProviderCost,
  manualReviewAfterMinutes,
  RECONCILE_HORIZON_MINUTES,
} from '../../supabase/functions/_shared/video-enhance-runtime.ts';
import { isTestAllowlisted } from '../../supabase/functions/_shared/video-enhance-models.ts';

const envOf = (map: Record<string, string>) => (key: string) => map[key];

describe('provider cost source', () => {
  it('reads a real cost metric', () => {
    expect(extractProviderCost({ metrics: { total_cost: 0.42 } })).toMatchObject({
      usd: 0.42,
      source: 'prediction_metric',
    });
  });

  it('accepts alternative money fields', () => {
    expect(extractProviderCost({ metrics: { predict_cost: 1.5 } }).source).toBe('prediction_metric');
  });

  it('reports consumed units as usage without inventing a price', () => {
    const reading = extractProviderCost({ metrics: { units: 12 } });
    expect(reading.source).toBe('provider_usage');
    expect(reading.usd).toBeUndefined();
  });

  it('recognises the real Topaz and vCube usage metrics', () => {
    // Observed live on Replicate: Topaz bills in units, vCube in output seconds.
    expect(extractProviderCost({
      metrics: { predict_time: 23.49, unspecified_billing_metric: 2 },
    }).source).toBe('provider_usage');
    expect(extractProviderCost({
      metrics: { predict_time: 88.34, video_output_duration_seconds: 12.052 },
    }).source).toBe('provider_usage');
  });


  it('treats a missing cost as unavailable, not as a failure', () => {
    const reading = extractProviderCost({ metrics: { predict_time: 31.2 } });
    expect(reading.source).toBe('unavailable');
    expect(reading.usd).toBeUndefined();
    expect(reading.processingSeconds).toBe(31.2);
  });

  it('derives money from billed units for a per-unit rate card', () => {
    const reading = extractProviderCost(
      { metrics: { unspecified_billing_metric: 6 } },
      'topaz-video-upscale',
    );
    expect(reading.units).toBe(6);
    expect(reading.usd).toBeCloseTo(0.48, 5);
  });

  it('ignores nonsense values', () => {
    expect(extractProviderCost({ metrics: { total_cost: -3 } }).source).toBe('unavailable');
    expect(extractProviderCost({}).source).toBe('unavailable');
    expect(extractProviderCost(null).source).toBe('unavailable');
  });
});

describe('manual review horizon', () => {
  it('falls back to the default', () => {
    expect(manualReviewAfterMinutes(envOf({}))).toBe(RECONCILE_HORIZON_MINUTES);
  });

  it('is configurable', () => {
    expect(
      manualReviewAfterMinutes(envOf({ VIDEO_ENHANCE_MANUAL_REVIEW_AFTER_MINUTES: '600' })),
    ).toBe(600);
  });

  it('rejects invalid overrides', () => {
    for (const raw of ['0', '-5', 'soon', '']) {
      expect(
        manualReviewAfterMinutes(envOf({ VIDEO_ENHANCE_MANUAL_REVIEW_AFTER_MINUTES: raw })),
      ).toBe(RECONCILE_HORIZON_MINUTES);
    }
  });
});

describe('fail-once persistence switch', () => {
  const allow = envOf({ VIDEO_ENHANCE_TEST_USER_IDS: 'user-a, user-b' });

  it('is only available to allowlisted accounts', () => {
    expect(isTestAllowlisted(allow, 'user-b')).toBe(true);
    expect(isTestAllowlisted(allow, 'someone-else')).toBe(false);
    expect(isTestAllowlisted(allow, undefined)).toBe(false);
    expect(isTestAllowlisted(envOf({}), 'user-a')).toBe(false);
  });
});

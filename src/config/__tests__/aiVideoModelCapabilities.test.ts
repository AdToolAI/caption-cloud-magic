import { describe, it, expect } from 'vitest';
import { AI_VIDEO_TOOLKIT_MODELS } from '../aiVideoModelRegistry';
import { VIDEO_PRICING_CATALOG } from '../../../supabase/functions/_shared/videoPricingCatalog';

describe('AI Video model registry ↔ pricing catalog', () => {
  for (const model of AI_VIDEO_TOOLKIT_MODELS) {
    const entry = VIDEO_PRICING_CATALOG[model.id];
    if (!entry) continue;

    it(`${model.id}: durations stay inside provider min/max`, () => {
      const min = entry.minDuration ?? entry.fixedClipSeconds ?? 0;
      const max = entry.maxDuration ?? entry.fixedClipSeconds ?? Infinity;
      for (const d of model.durations) {
        expect(d, `${model.id} duration ${d}s below provider minimum`).toBeGreaterThanOrEqual(min);
        expect(d, `${model.id} duration ${d}s above provider maximum`).toBeLessThanOrEqual(max);
      }
    });

    if (entry.unit === 'per-second') {
      it(`${model.id}: UI price matches the billed catalog price`, () => {
        expect(model.costPerSecond.EUR).toBeCloseTo(entry.sellEUR, 3);
      });
    }
  }

  it('every model exposes at least one duration and aspect ratio', () => {
    for (const model of AI_VIDEO_TOOLKIT_MODELS) {
      expect(model.durations.length, model.id).toBeGreaterThan(0);
      expect(model.aspectRatios.length, model.id).toBeGreaterThan(0);
      if (model.resolutions) {
        expect(model.resolutions, model.id).toContain(model.resolution);
      }
    }
  });

  it('Seedance 2.5 sells at 10.00 EUR / 11.50 USD per 30 s clip', () => {
    const s25 = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === 'seedance-2-5')!;
    expect(s25.costPerSecond.EUR * 30).toBeCloseTo(10.0, 1);
    expect(s25.costPerSecond.USD * 30).toBeCloseTo(11.5, 1);
    expect(VIDEO_PRICING_CATALOG['seedance-2-5'].sellEUR * 30).toBeCloseTo(10.0, 1);
  });
});

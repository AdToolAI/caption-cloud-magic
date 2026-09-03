/**
 * Net margin floor — the 1.75x promise must hold AFTER payment fees.
 *
 * A gross sale loses ~10% to payment-processing (method fee, cross-border
 * surcharge, conversion spread — measured on a real $10 purchase that netted
 * 7.69 EUR). Checking the margin against the gross price silently overstated
 * it, so every catalog entry is now checked against NET revenue:
 *
 *   sellEUR * PAYMENT_NET_FACTOR >= MARGIN_FLOOR_MULTIPLE * costEUR
 *
 * Seedance 2.5 is the only documented commercial exception.
 */
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_NET_FACTOR,
  MARGIN_FLOOR_MULTIPLE,
  NET_MARGIN_FLOOR_EXCEPTIONS,
  minGrossEURForCost,
  netRevenueEUR,
} from '@/lib/cost/fx';
import { VIDEO_PRICING_CATALOG } from '@/lib/cost/videoPricingCatalog';

const entries = Object.values(VIDEO_PRICING_CATALOG);

describe('net margin floor (after payment fees)', () => {
  it('reads the catalog', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('uses the measured net factor', () => {
    expect(PAYMENT_NET_FACTOR).toBe(0.9);
    expect(netRevenueEUR(10)).toBe(9);
    // 1.75 / 0.90 = 1.9445x gross over provider cost
    expect(minGrossEURForCost(1)).toBeCloseTo(1.9445, 4);
  });

  it.each(
    entries
      .filter((e) => !NET_MARGIN_FLOOR_EXCEPTIONS.has(e.id))
      .map((e) => [e.id, e] as const),
  )('%s clears the net margin floor', (_id, entry) => {
    expect(netRevenueEUR(entry.sellEUR)).toBeGreaterThanOrEqual(
      MARGIN_FLOOR_MULTIPLE * entry.costEUR - 1e-9,
    );
  });

  it('keeps the documented Seedance 2.5 exception explicit', () => {
    for (const id of NET_MARGIN_FLOOR_EXCEPTIONS) {
      const entry = VIDEO_PRICING_CATALOG[id];
      expect(entry, `exception "${id}" no longer exists in the catalog`).toBeTruthy();
    }
  });
});

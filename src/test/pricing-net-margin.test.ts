/**
 * Break-even pricing (22.09.2026).
 *
 * AI video models are sold at cost: a gross EUR price must, after the
 * inclusive 19% VAT, ~10% payment-processing fees and the largest customer
 * discount (Founder 10%), leave exactly the provider cost plus a 3% drift
 * buffer — no profit, no loss.
 *
 *   sellEUR / 1.19 * 0.90 * 0.90 ≈ costEUR * 1.03
 */
import { describe, it, expect } from 'vitest';
import {
  PAYMENT_NET_FACTOR,
  VAT_RATE,
  MAX_DISCOUNT_FACTOR,
  COST_SAFETY_BUFFER,
  BREAK_EVEN_FACTOR,
  breakEvenSellEUR,
  netRevenueEUR,
} from '@/lib/cost/fx';
import { VIDEO_PRICING_CATALOG } from '@/lib/cost/videoPricingCatalog';

const entries = Object.values(VIDEO_PRICING_CATALOG);

describe('break-even pricing', () => {
  it('reads the catalog', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it('uses the documented factors', () => {
    expect(PAYMENT_NET_FACTOR).toBe(0.9);
    expect(VAT_RATE).toBe(0.19);
    expect(MAX_DISCOUNT_FACTOR).toBe(0.9);
    expect(COST_SAFETY_BUFFER).toBe(1.03);
    expect(BREAK_EVEN_FACTOR).toBeCloseTo(1.5132, 4);
    expect(netRevenueEUR(10)).toBe(9);
  });

  it.each(entries.map((e) => [e.id, e] as const))(
    '%s is priced at break-even',
    (_id, entry) => {
      expect(entry.sellEUR).toBeCloseTo(breakEvenSellEUR(entry.costEUR), 4);

      // Discounted, VAT-inclusive, fee-adjusted revenue covers the cost.
      const netAfterEverything =
        (entry.sellEUR / (1 + VAT_RATE)) * PAYMENT_NET_FACTOR * MAX_DISCOUNT_FACTOR;
      expect(netAfterEverything).toBeGreaterThanOrEqual(entry.costEUR - 1e-4);
      // ... and does not turn into a profit beyond the safety buffer.
      expect(netAfterEverything).toBeLessThanOrEqual(
        entry.costEUR * COST_SAFETY_BUFFER + 1e-4,
      );
    },
  );
});

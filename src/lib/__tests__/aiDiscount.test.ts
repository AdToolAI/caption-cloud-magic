import { describe, it, expect } from 'vitest';
import { applyAiDiscount, discountFactor, normalizeDiscountPercent } from '../aiDiscount';

describe('aiDiscount', () => {
  it('standard accounts pay the full list price', () => {
    expect(discountFactor(0)).toBe(1);
    expect(applyAiDiscount(6, 0)).toBe(6);
  });

  it('creator accounts pay 60% of the list price', () => {
    expect(discountFactor(40)).toBeCloseTo(0.6, 10);
    expect(applyAiDiscount(6, 40)).toBe(3.6);
    expect(applyAiDiscount(13.5, 40)).toBe(8.1);
  });

  it('rounds to cents like the database does', () => {
    expect(applyAiDiscount(0.07, 40)).toBe(0.04);
    expect(applyAiDiscount(1.11, 40)).toBe(0.67);
  });

  it('clamps invalid percentages', () => {
    expect(normalizeDiscountPercent(null)).toBe(0);
    expect(normalizeDiscountPercent('abc')).toBe(0);
    expect(normalizeDiscountPercent(-10)).toBe(0);
    expect(normalizeDiscountPercent(140)).toBe(100);
    expect(applyAiDiscount(10, 100)).toBe(0);
  });

  it('never returns a negative charge', () => {
    expect(applyAiDiscount(-5, 40)).toBe(0);
  });
});

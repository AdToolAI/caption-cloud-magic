import { describe, it, expect } from 'vitest';
import {
  billsReferenceSeconds,
  referenceBillableSeconds,
  computeBillableSeconds,
  UNKNOWN_REFERENCE_SECONDS,
} from '@/lib/cost/referenceVideoBilling';

const SEEDANCE = 'seedance-2-5';
const SEEDANCE_480 = 'seedance-2-5-480p';

describe('reference-video billing (v518)', () => {
  it('only applies to the Seedance 2.5 tiers', () => {
    expect(billsReferenceSeconds(SEEDANCE)).toBe(true);
    expect(billsReferenceSeconds(SEEDANCE_480)).toBe(true);
    expect(billsReferenceSeconds('kling-2-5')).toBe(false);
    expect(referenceBillableSeconds('kling-2-5', 1, [8])).toBe(0);
  });

  it('charges nothing without a reference clip', () => {
    expect(referenceBillableSeconds(SEEDANCE, 0, [])).toBe(0);
    expect(computeBillableSeconds(SEEDANCE, 8, 0, [])).toBe(8);
  });

  it('rounds each clip up to a whole second', () => {
    expect(referenceBillableSeconds(SEEDANCE, 1, [2])).toBe(2);
    expect(referenceBillableSeconds(SEEDANCE, 1, [4.2])).toBe(5);
    expect(referenceBillableSeconds(SEEDANCE, 1, [8.042])).toBe(9);
  });

  it('falls back to the maximum length when the duration is unknown', () => {
    expect(referenceBillableSeconds(SEEDANCE, 1, [null])).toBe(UNKNOWN_REFERENCE_SECONDS);
    expect(referenceBillableSeconds(SEEDANCE, 1, undefined)).toBe(UNKNOWN_REFERENCE_SECONDS);
    expect(referenceBillableSeconds(SEEDANCE, 1, [0])).toBe(UNKNOWN_REFERENCE_SECONDS);
  });

  it('caps a single clip at 30 s', () => {
    expect(referenceBillableSeconds(SEEDANCE, 1, [120])).toBe(30);
  });

  it('matches the documented examples', () => {
    // 8 s output + 8 s reference = 16 billable seconds
    expect(computeBillableSeconds(SEEDANCE, 8, 1, [8])).toBe(16);
    // 8 s output + 2 s reference = 10 billable seconds
    expect(computeBillableSeconds(SEEDANCE, 8, 1, [2])).toBe(10);
    expect(computeBillableSeconds(SEEDANCE, 5, 1, [4])).toBe(9);
    expect(computeBillableSeconds(SEEDANCE, 10, 1, [4])).toBe(14);
    expect(computeBillableSeconds(SEEDANCE, 15, 1, [8])).toBe(23);
  });
});

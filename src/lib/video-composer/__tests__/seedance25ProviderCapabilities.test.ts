import { describe, expect, it } from 'vitest';
import {
  getProviderDurations,
  providerSupportsLipsync,
} from '../providerCapabilities';

describe('v425 — Seedance 2.5 lip-sync contract', () => {
  it('keeps its long-form durations for B-roll', () => {
    expect(getProviderDurations('ai-seedance25')).toContain(25);
  });

  it('is no longer certified as a lip-sync master plate', () => {
    expect(providerSupportsLipsync('ai-seedance25')).toBe(false);
    expect(providerSupportsLipsync('ai-happyhorse')).toBe(true);
    expect(providerSupportsLipsync('ai-hailuo')).toBe(true);
    expect(providerSupportsLipsync('ai-kling')).toBe(false);
  });
});

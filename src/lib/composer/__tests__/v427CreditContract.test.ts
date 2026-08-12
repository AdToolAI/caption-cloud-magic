import { describe, it, expect } from 'vitest';
import {
  ceilingSeconds,
  costPerSecond,
  maxRunCostEuros,
} from '../../../../supabase/functions/_shared/v427-credit-contract.ts';

const scene = (over: Partial<any> = {}) => ({
  id: 's1',
  clipSource: 'ai-hailuo',
  clipQuality: 'standard',
  durationSeconds: 6,
  ...over,
});

describe('v427B money contract', () => {
  it('reserves against the provider window ceiling, not the requested duration', () => {
    expect(ceilingSeconds(scene({ clipSource: 'ai-hailuo', durationSeconds: 6 }))).toBe(10);
    expect(ceilingSeconds(scene({ clipSource: 'ai-happyhorse', durationSeconds: 5 }))).toBe(15);
    expect(ceilingSeconds(scene({ clipSource: 'ai-seedance25', durationSeconds: 8 }))).toBe(30);
  });

  it('never reserves less than what the user already requested', () => {
    expect(ceilingSeconds(scene({ clipSource: 'ai-unknown-model', durationSeconds: 12 }))).toBe(12);
  });

  it('ceiling cost is never below the quoted cost', () => {
    const scenes = [
      scene({ id: 'a', clipSource: 'ai-hailuo', durationSeconds: 6 }),
      scene({ id: 'b', clipSource: 'ai-seedance25', durationSeconds: 10 }),
    ];
    const quoted = scenes.reduce(
      (sum, s) => sum + s.durationSeconds * costPerSecond(s.clipSource, s.clipQuality),
      0,
    );
    expect(maxRunCostEuros(scenes)).toBeGreaterThanOrEqual(Math.round(quoted * 100) / 100);
  });

  it('ignores non-AI scenes entirely', () => {
    expect(maxRunCostEuros([scene({ clipSource: 'stock', durationSeconds: 30 })])).toBe(0);
  });
});

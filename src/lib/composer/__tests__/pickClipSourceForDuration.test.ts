import { describe, it, expect } from 'vitest';
import { pickClipSourceForDuration } from '../pickClipSourceForDuration';

describe('pickClipSourceForDuration', () => {
  it('keeps the preferred source when it can hold the duration', () => {
    const r = pickClipSourceForDuration({ durationSeconds: 8, preferred: 'ai-hailuo' });
    expect(r.clipSource).toBe('ai-hailuo');
    expect(r.durationSeconds).toBe(8);
    expect(r.switched).toBe(false);
  });

  it('routes long B-roll scenes to Seedance 2.5', () => {
    const r = pickClipSourceForDuration({ durationSeconds: 25, preferred: 'ai-hailuo' });
    expect(r.clipSource).toBe('ai-seedance25');
    expect(r.durationSeconds).toBe(25);
    expect(r.switched).toBe(true);
  });

  it('clamps long dialog scenes while Seedance 2.5 lip-sync is not enabled', () => {
    const r = pickClipSourceForDuration({
      durationSeconds: 25,
      preferred: 'ai-happyhorse',
      dialogMode: true,
    });
    expect(r.clipSource).toBe('ai-happyhorse');
    expect(r.durationSeconds).toBeLessThanOrEqual(15);
    expect(r.switched).toBe(false);
  });

  it('v425 — never routes dialog scenes away from certified providers', () => {
    const r = pickClipSourceForDuration({
      durationSeconds: 25,
      preferred: 'ai-happyhorse',
      dialogMode: true,
      longFormDialogAllowed: true,
    });
    expect(r.clipSource).toBe('ai-happyhorse');
    expect(r.durationSeconds).toBeLessThanOrEqual(15);
    expect(r.switched).toBe(false);
  });

  it('never exceeds the 30 s long-form ceiling', () => {
    const r = pickClipSourceForDuration({ durationSeconds: 48, preferred: 'ai-hailuo' });
    expect(r.durationSeconds).toBe(30);
  });
});

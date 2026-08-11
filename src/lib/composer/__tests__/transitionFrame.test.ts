import { describe, it, expect } from 'vitest';
import { scoreFrame } from '@/lib/composer/visualInputs/transitionFrame';

function frame(fill: (i: number) => [number, number, number], px = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const [r, g, b] = fill(i);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('transition frame quality gate', () => {
  it('rejects a fade-to-black frame', () => {
    expect(scoreFrame(frame(() => [2, 2, 2])).usable).toBe(false);
  });

  it('rejects a blown-out white frame', () => {
    expect(scoreFrame(frame(() => [252, 252, 252])).usable).toBe(false);
  });

  it('rejects a flat mid-grey frame (no detail)', () => {
    expect(scoreFrame(frame(() => [128, 128, 128])).usable).toBe(false);
  });

  it('accepts a frame with real contrast', () => {
    const q = scoreFrame(frame((i) => (i % 2 ? [30, 40, 35] : [200, 190, 180])));
    expect(q.usable).toBe(true);
    expect(q.detail).toBeGreaterThan(8);
  });
});

import { describe, it, expect } from 'vitest';
import { scorePlateDrift, type PlateSample } from '../plateDriftScore';

const DIMS = { width: 1280, height: 720 };

// Helper: 4 faces in one row, natural micro-movement.
function stableRowSample(t: number, jitter = 0): PlateSample {
  const centers = [200, 500, 800, 1100];
  return {
    t,
    faces: centers.map((cx, i) => ({
      characterId: `c${i}`,
      bbox: [cx - 60 + jitter, 200, cx + 60 + jitter, 340] as const,
      center: [cx + jitter, 270] as const,
      confidence: 0.98,
    })),
  };
}

describe('plateDriftScore', () => {
  it('reports stable for identical samples', () => {
    const r = scorePlateDrift([stableRowSample(0), stableRowSample(0.5), stableRowSample(1)], DIMS);
    expect(r.layoutStable).toBe(true);
    expect(r.hardDrift).toBe(false);
    expect(r.driftScore).toBeLessThan(0.05);
  });

  it('tolerates small speaker movement (<25% frame width)', () => {
    const r = scorePlateDrift(
      [stableRowSample(0), stableRowSample(0.5, 40), stableRowSample(1, -30)],
      DIMS,
    );
    expect(r.hardDrift).toBe(false);
    expect(r.layoutStable).toBe(true);
  });

  it('flags hard drift when face count changes (speaker leaves frame)', () => {
    const s2 = stableRowSample(1);
    s2.faces = s2.faces.slice(0, 3);
    const r = scorePlateDrift([stableRowSample(0), s2], DIMS);
    expect(r.hardDrift).toBe(true);
    expect(r.transitions.some((t) => t.kind === 'face_count_change')).toBe(true);
  });

  it('flags row cluster change (row → 2x2 grid = the bug we guard against)', () => {
    const grid: PlateSample = {
      t: 1,
      faces: [
        { characterId: 'c0', bbox: [200, 100, 400, 260], center: [300, 180] },
        { characterId: 'c1', bbox: [880, 100, 1080, 260], center: [980, 180] },
        { characterId: 'c2', bbox: [200, 460, 400, 620], center: [300, 540] },
        { characterId: 'c3', bbox: [880, 460, 1080, 620], center: [980, 540] },
      ],
    };
    const r = scorePlateDrift([stableRowSample(0), grid], DIMS);
    expect(r.hardDrift).toBe(true);
    expect(r.transitions.some((t) => t.kind === 'row_cluster_change')).toBe(true);
  });

  it('flags bbox jump > 50% frame width (camera cut)', () => {
    const s2 = stableRowSample(1, 800); // whole row shifted 800px right
    const r = scorePlateDrift([stableRowSample(0), s2], DIMS);
    expect(r.hardDrift).toBe(true);
    expect(r.transitions.some((t) => t.kind === 'bbox_jump')).toBe(true);
  });

  it('flags character re-id mismatch (speaker swap)', () => {
    const s0 = stableRowSample(0);
    const s1 = stableRowSample(1);
    s1.faces[2].characterId = 'stranger';
    const r = scorePlateDrift([s0, s1], DIMS);
    expect(r.hardDrift).toBe(true);
    expect(r.transitions.some((t) => t.kind === 'character_reid_mismatch')).toBe(true);
  });

  it('returns stable for <2 samples', () => {
    const r = scorePlateDrift([stableRowSample(0)], DIMS);
    expect(r.layoutStable).toBe(true);
    expect(r.sampleCount).toBe(1);
  });
});

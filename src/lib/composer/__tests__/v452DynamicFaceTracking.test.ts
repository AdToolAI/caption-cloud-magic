/**
 * V452 — Dynamic face tracking contract.
 *
 * Locks the invariants that make dynamic cropping safe inside the frozen
 * v400 pipeline:
 *   1. SIZE stays the frozen static crop's authority — tracking only moves.
 *   2. Identity is static: unresolved samples interpolate, never re-detect.
 *   3. A geometrically still track stays behaviourally identical to the
 *      legacy fixed crop (`moving === false`).
 *   4. Preclip renderer and mux reprojection sample the SAME path function.
 *   5. Any path change changes the signature (→ no stale preclip reuse).
 */
import { describe, expect, it } from 'vitest';
import {
  buildDynamicCameraPath,
  cameraPathSignature,
  isDynamicCameraPath,
  mouthRoiSamples,
  sampleCameraPath,
  staticCameraPath,
  type TrackSample,
} from '../../../../supabase/functions/_shared/dynamic-camera-path';
import { sampleCameraPathRuntime } from '../cameraPathRuntime';

const SRC = { srcWidth: 1920, srcHeight: 1080 };
const CROP = { x: 700, y: 300, size: 400, outputSize: 720 };
const base = { staticCrop: CROP, ...SRC, startSec: 0, endSec: 3 };

function faceAt(t: number, cx: number, cy: number): TrackSample {
  return { t, box: [cx - 90, cy - 110, cx + 90, cy + 110], mouth: [cx, cy + 60] };
}

describe('V452 dynamic camera path', () => {
  it('never changes the crop size — the static crop stays the size authority', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(1.5, 1100, 520), faceAt(3, 1300, 560)],
    });
    for (const k of path.keyframes) expect(k.size).toBe(CROP.size);
  });

  it('follows the assigned face when it moves', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(1.5, 1100, 500), faceAt(3, 1300, 500)],
    });
    expect(path.moving).toBe(true);
    expect(isDynamicCameraPath(path)).toBe(true);
    const first = sampleCameraPath(path, 0)!;
    const last = sampleCameraPath(path, 3)!;
    expect(last.x).toBeGreaterThan(first.x);
  });

  it('stays static (legacy-identical) when the face does not move', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(1.5, 900, 500), faceAt(3, 900, 500)],
    });
    expect(path.moving).toBe(false);
    expect(isDynamicCameraPath(path)).toBe(false);
  });

  it('falls back to the static crop when nothing is trackable', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [
        { t: 0, box: null, mouth: null },
        { t: 3, box: null, mouth: null },
      ],
    });
    expect(path.moving).toBe(false);
    expect(path.reason).toBe('static_fallback');
    expect(sampleCameraPath(path, 1)).toEqual({ x: CROP.x, y: CROP.y, size: CROP.size });
  });

  it('interpolates unresolved samples instead of dropping identity', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), { t: 1.5, box: null, mouth: null }, faceAt(3, 1300, 500)],
    });
    const mid = sampleCameraPath(path, 1.5)!;
    const a = sampleCameraPath(path, 0)!;
    const b = sampleCameraPath(path, 3)!;
    expect(mid.x).toBeGreaterThanOrEqual(Math.min(a.x, b.x));
    expect(mid.x).toBeLessThanOrEqual(Math.max(a.x, b.x));
  });

  it('keeps preclip render and mux reprojection on identical geometry', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(1.5, 1100, 560), faceAt(3, 1300, 500)],
    });
    for (const t of [0, 0.4, 1.1, 1.5, 2.7, 3, 4]) {
      expect(sampleCameraPathRuntime(path, t)).toEqual(sampleCameraPath(path, t));
    }
  });

  it('changes its signature whenever the geometry changes', () => {
    const a = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(3, 1300, 500)],
    });
    const b = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(3, 1000, 500)],
    });
    expect(a.signature).not.toBe(b.signature);
    expect(cameraPathSignature(a)).toBe(a.signature);
    expect(staticCameraPath(base).signature).not.toBe(a.signature);
  });

  it('exposes mouth ROI samples in preclip-normalized space (telemetry only)', () => {
    const path = buildDynamicCameraPath({
      ...base,
      samples: [faceAt(0, 900, 500), faceAt(3, 1300, 500)],
    });
    const roi = mouthRoiSamples(path);
    expect(roi.length).toBeGreaterThan(0);
    for (const r of roi) {
      expect(r.centerX).toBeGreaterThanOrEqual(0);
      expect(r.centerX).toBeLessThanOrEqual(1);
      expect(r.centerY).toBeGreaterThanOrEqual(0);
      expect(r.centerY).toBeLessThanOrEqual(1);
    }
  });
});

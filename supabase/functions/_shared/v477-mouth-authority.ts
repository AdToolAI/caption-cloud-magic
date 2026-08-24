/**
 * V477 — LANDMARK AUTHORITY (PURE)
 * ---------------------------------------------------------------------------
 * Evidence: `docs/v476-t8-conformance-measurement.md`.
 *
 * V476 proved two independent defects in T8:
 *   1. the plate identity snapshot carries NO mouth landmarks
 *      (`plate_identity.mouths = [null, null, null, null]`), so the pre-clip
 *      geometry always fell back to the 0.78 pose estimate
 *      (`preclip_geometry_mouth_source = "pose_estimate"` in every S01 pass),
 *   2. while the per-pass face track measured a real mouth landmark in 6/6
 *      samples of every pass (measured ratio inside the face box 0.734–0.781).
 *
 * The measurement existed — it was simply produced AFTER the crop had been
 * computed and was therefore discarded. This module turns the tracked mouth
 * into the ONE authoritative anchor.
 *
 * Robustness: the authority is the component-wise MEDIAN of all measured mouth
 * points of the turn, which is insensitive to a single mis-detected frame.
 *
 * PURE: no I/O, no thresholds, no side effects.
 */

export const V477_MOUTH_AUTHORITY_VERSION = "v477";

export interface V477TrackSample {
  t?: number | null;
  box?: [number, number, number, number] | number[] | null;
  mouth?: [number, number] | number[] | null;
}

export interface V477MouthAuthority {
  /** Authoritative mouth point in PLATE pixels, or null when unmeasured. */
  mouth: [number, number] | null;
  /** How many samples carried a real mouth landmark. */
  measured: number;
  /** How many samples were inspected. */
  total: number;
  /**
   * Measured mouth height inside the tracked face box, as a fraction of the
   * face box height (median). Telemetry only — never a calibration input.
   */
  faceRatio: number | null;
  reason: string;
  version: string;
}

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pointOf(sample: V477TrackSample): [number, number] | null {
  const m = sample?.mouth;
  if (!Array.isArray(m) || m.length !== 2) return null;
  const x = finite(m[0]);
  const y = finite(m[1]);
  return x === null || y === null ? null : [x, y];
}

/**
 * PURE — derives the authoritative mouth point from the measured face track.
 * Returns `mouth: null` when the track produced no usable landmark; the caller
 * must then keep the existing pose-estimate fallback (0.78 face ratio).
 */
export function resolveTrackMouthAuthority(
  samples: V477TrackSample[] | null | undefined,
): V477MouthAuthority {
  const list = Array.isArray(samples) ? samples : [];
  const points: Array<[number, number]> = [];
  const ratios: number[] = [];

  for (const s of list) {
    const p = pointOf(s);
    if (!p) continue;
    points.push(p);
    const b = s?.box;
    if (Array.isArray(b) && b.length === 4) {
      const y1 = finite(b[1]);
      const y2 = finite(b[3]);
      if (y1 !== null && y2 !== null && y2 - y1 > 1) {
        ratios.push((p[1] - y1) / (y2 - y1));
      }
    }
  }

  if (points.length === 0) {
    return {
      mouth: null,
      measured: 0,
      total: list.length,
      faceRatio: null,
      reason: list.length === 0 ? "v477_no_track" : "v477_no_mouth_landmark",
      version: V477_MOUTH_AUTHORITY_VERSION,
    };
  }

  return {
    mouth: [
      Math.round(median(points.map((p) => p[0]))),
      Math.round(median(points.map((p) => p[1]))),
    ],
    measured: points.length,
    total: list.length,
    faceRatio: ratios.length > 0 ? Number(median(ratios).toFixed(4)) : null,
    reason: "v477_track_landmark",
    version: V477_MOUTH_AUTHORITY_VERSION,
  };
}

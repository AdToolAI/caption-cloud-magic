// ─────────────────────────────────────────────────────────────────────────────
// V513-T0 — SHADOW MOTION TELEMETRY (observation only)
//
// Derives motion descriptors from the EXISTING v477 pre-track samples.
// Hard constraints of this gate:
//   • No provider / Rekognition / Lambda calls — pure function over samples.
//   • No thresholds, no gates, no selectors, no adaptive sampling.
//   • Zero runtime consumers: the result is attached additively to the pass as
//     `_v513_motion_telemetry` and read by nobody.
//   • Every persisted number is a finite JSON value; `reason` is capped at 200
//     characters.
// ─────────────────────────────────────────────────────────────────────────────

export type V513TelemetryStatus =
  | "ok"
  | "no_plate_box"
  | "track_failed"
  | "insufficient_samples";

export interface V513MotionTelemetry {
  v: 513;
  status: V513TelemetryStatus;
  reason: string | null;
  /** Total samples returned by the v477 track (0 when unavailable). */
  samples_total: number;
  /** Samples carrying a usable face box. */
  samples_valid: number;
  /** Samples carrying a mouth landmark. */
  samples_with_mouth: number;
  /** Observed track window in plate-absolute seconds. */
  window_sec: number;
  /** Face-box centroid travel, normalised by the plate short side. */
  centroid_travel_norm: number;
  centroid_max_step_norm: number;
  /** Mouth landmark travel, normalised by the plate short side. */
  mouth_travel_norm: number;
  mouth_max_step_norm: number;
  /** Face short-side size, normalised by the plate short side. */
  face_size_norm_min: number;
  face_size_norm_max: number;
  face_size_norm_mean: number;
  /** Measurement latency reported by the track, in ms. */
  track_latency_ms: number;
}

const REASON_MAX = 200;

function cap(reason: unknown): string | null {
  if (reason === null || reason === undefined) return null;
  const s = typeof reason === "string" ? reason : String(reason);
  const t = s.trim();
  if (!t) return null;
  return t.length > REASON_MAX ? t.slice(0, REASON_MAX) : t;
}

/** Coerce to a finite, JSON-safe number rounded to 4 decimals. */
function fin(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Number(n.toFixed(4));
}

function base(status: V513TelemetryStatus, reason: unknown): V513MotionTelemetry {
  return {
    v: 513,
    status,
    reason: cap(reason),
    samples_total: 0,
    samples_valid: 0,
    samples_with_mouth: 0,
    window_sec: 0,
    centroid_travel_norm: 0,
    centroid_max_step_norm: 0,
    mouth_travel_norm: 0,
    mouth_max_step_norm: 0,
    face_size_norm_min: 0,
    face_size_norm_max: 0,
    face_size_norm_mean: 0,
    track_latency_ms: 0,
  };
}

export interface V513Input {
  /** The assignment-locked plate face box, or null when none was available. */
  plateBox: [number, number, number, number] | null | undefined;
  /** The EXISTING v477 pre-track result (null when it threw or was skipped). */
  track:
    | { ok?: boolean; reason?: string; samples?: unknown[]; latencyMs?: number }
    | null
    | undefined;
  /** True when the v477 track call threw. */
  threw?: boolean;
  /** Error text when the v477 track call threw. */
  threwReason?: string | null;
  plateWidth: number;
  plateHeight: number;
}

type Box = [number, number, number, number];

function asBox(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const b = value.slice(0, 4).map((v) => Number(v));
  if (!b.every((v) => Number.isFinite(v))) return null;
  if (!(b[2] > 0) || !(b[3] > 0)) return null;
  return b as Box;
}

function asPoint(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/**
 * Pure, side-effect-free shadow telemetry. Never throws.
 */
export function buildV513MotionTelemetry(input: V513Input): V513MotionTelemetry {
  try {
    if (input.threw) {
      return base("track_failed", input.threwReason ?? "v477_track_threw");
    }
    if (!asBox(input.plateBox ?? null)) {
      return base("no_plate_box", "no_assignment_locked_plate_box");
    }
    const track = input.track ?? null;
    if (!track || track.ok !== true) {
      return base("track_failed", track?.reason ?? "track_unavailable");
    }

    const rawSamples = Array.isArray(track.samples) ? track.samples : [];
    const total = rawSamples.length;
    const latency = fin(track.latencyMs, 0);

    const shortSide = Math.min(
      Number(input.plateWidth) || 0,
      Number(input.plateHeight) || 0,
    );
    const norm = Number.isFinite(shortSide) && shortSide > 0 ? shortSide : 0;

    const valid: Array<{ t: number; box: Box; mouth: [number, number] | null }> = [];
    for (const s of rawSamples) {
      const rec = s as Record<string, unknown> | null;
      if (!rec) continue;
      const box = asBox(rec.box);
      if (!box) continue;
      const t = Number(rec.t);
      valid.push({
        t: Number.isFinite(t) ? t : 0,
        box,
        mouth: asPoint(rec.mouth),
      });
    }
    valid.sort((a, b) => a.t - b.t);

    if (valid.length < 2 || norm <= 0) {
      const out = base(
        "insufficient_samples",
        valid.length < 2 ? `valid_samples=${valid.length}` : "plate_dims_invalid",
      );
      out.samples_total = fin(total);
      out.samples_valid = fin(valid.length);
      out.samples_with_mouth = fin(valid.filter((v) => v.mouth).length);
      out.track_latency_ms = latency;
      return out;
    }

    let centroidTravel = 0;
    let centroidMaxStep = 0;
    let mouthTravel = 0;
    let mouthMaxStep = 0;
    let sizeMin = Number.POSITIVE_INFINITY;
    let sizeMax = 0;
    let sizeSum = 0;
    let prevCentroid: [number, number] | null = null;
    let prevMouth: [number, number] | null = null;
    let mouthCount = 0;

    for (const s of valid) {
      const cx = s.box[0] + s.box[2] / 2;
      const cy = s.box[1] + s.box[3] / 2;
      if (prevCentroid) {
        const d = Math.hypot(cx - prevCentroid[0], cy - prevCentroid[1]) / norm;
        centroidTravel += d;
        if (d > centroidMaxStep) centroidMaxStep = d;
      }
      prevCentroid = [cx, cy];

      if (s.mouth) {
        mouthCount += 1;
        if (prevMouth) {
          const d = Math.hypot(s.mouth[0] - prevMouth[0], s.mouth[1] - prevMouth[1]) / norm;
          mouthTravel += d;
          if (d > mouthMaxStep) mouthMaxStep = d;
        }
        prevMouth = s.mouth;
      }

      const faceShort = Math.min(s.box[2], s.box[3]) / norm;
      if (faceShort < sizeMin) sizeMin = faceShort;
      if (faceShort > sizeMax) sizeMax = faceShort;
      sizeSum += faceShort;
    }

    const windowSec = Math.max(0, valid[valid.length - 1].t - valid[0].t);

    return {
      v: 513,
      status: "ok",
      reason: cap(track.reason),
      samples_total: fin(total),
      samples_valid: fin(valid.length),
      samples_with_mouth: fin(mouthCount),
      window_sec: fin(windowSec),
      centroid_travel_norm: fin(centroidTravel),
      centroid_max_step_norm: fin(centroidMaxStep),
      mouth_travel_norm: fin(mouthTravel),
      mouth_max_step_norm: fin(mouthMaxStep),
      face_size_norm_min: fin(Number.isFinite(sizeMin) ? sizeMin : 0),
      face_size_norm_max: fin(sizeMax),
      face_size_norm_mean: fin(sizeSum / valid.length),
      track_latency_ms: latency,
    };
  } catch (err) {
    return base("track_failed", err instanceof Error ? err.message : String(err));
  }
}

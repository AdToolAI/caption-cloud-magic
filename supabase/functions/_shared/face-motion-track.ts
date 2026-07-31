/**
 * face-motion-track (v327) — Motion-tolerant lip-sync geometry.
 *
 * Why this exists
 * ────────────────────────────────────────────────────────────────────────
 * Until v326 every Sync.so dispatch assumed the speaker's face sits at ONE
 * fixed position for the whole plate: `uploadBoundingBoxesJson` filled every
 * frame with the same box and `pass-face-preclip` cut one static square that
 * the mux later overlays back at exactly that rect. That holds as long as the
 * prompt-side camera lock keeps the subject nailed in place — but as soon as
 * a character walks, steps toward camera or turns away, the mouth leaves the
 * box and Sync.so silently no-ops (or morphs a neighbour).
 *
 * v327 adds a measured face TRAJECTORY per speaker:
 *   - the client samples N frames of the rendered plate (canvas capture) and
 *     uploads them as JPEGs (server-side ffmpeg/Replicate frame grabs stay
 *     forbidden — see face-frame-extract.ts),
 *   - `report-plate-motion-track` runs AWS Rekognition DetectFaces per frame
 *     and chains detections into per-slot trajectories,
 *   - scenes whose speakers barely move stay classified `static` and run the
 *     untouched legacy path (preclip + fixed box + overlay + freeze tiles),
 *   - `moving` speakers are dispatched on the FULL PLATE with per-frame,
 *     interpolated bounding boxes and no crop overlay at all — growing the
 *     preclip rect instead would enlarge the mux overlay and desync the
 *     frame-0 silent-face freeze tiles in DialogStitchVideo.
 *
 * Everything here is fail-open: no track, stale track or unusable geometry
 * always degrades to the pre-v327 static behaviour.
 */

export const MOTION_TRACK_VERSION = "v327";

/** Drift (share of plate width) below which a speaker counts as static. */
export const STATIC_DRIFT_PCT = 0.06;
/** Relative face-size change below which a speaker counts as static. */
export const STATIC_SCALE_DELTA = 0.12;
/** Tracks older than this are ignored (plate could have been re-rendered). */
export const TRACK_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type MotionClass = "static" | "moving";
export type BboxMode = "static" | "tracked";

export interface TrackPoint {
  /** Seconds into the plate. */
  t: number;
  /** Plate pixel space [x1, y1, x2, y2]. */
  bbox: [number, number, number, number];
}

export interface SlotTrack {
  slot: number;
  motion_class: MotionClass;
  max_drift_pct: number;
  max_scale_delta: number;
  points: TrackPoint[];
}

export interface MotionTrack {
  version: string;
  created_at: string;
  plate_url: string;
  dims: { width: number; height: number };
  samples: number;
  slots: SlotTrack[];
  /** Set when the measurement itself degraded (kept for forensics). */
  degraded_reason?: string | null;
}

export interface DetectedFrameFace {
  bbox: [number, number, number, number];
  confidence: number;
}

/* ── Geometry helpers ─────────────────────────────────────────────────── */

export function boxCenter(b: [number, number, number, number]): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function boxWidth(b: [number, number, number, number]): number {
  return Math.max(1, b[2] - b[0]);
}

/**
 * Chain per-frame detections into per-slot trajectories.
 *
 * Frame 0 defines the slots (row-major, matching `sortFacesRowMajor` in
 * plate-face-detect). Later frames are linked by nearest center — a link is
 * only accepted when the center moved less than `maxLinkDistPx`, otherwise the
 * sample is dropped for that slot (better a sparser track than a swapped one).
 */
export function buildSlotTracks(params: {
  frames: Array<{ t: number; faces: DetectedFrameFace[] }>;
  imgWidth: number;
  imgHeight: number;
  expectedSlots?: number;
}): SlotTrack[] {
  const frames = [...params.frames].sort((a, b) => a.t - b.t);
  if (frames.length === 0) return [];

  // Row-major ordering on the first usable frame defines the slots.
  const seedFrame = frames.find((f) => f.faces.length > 0);
  if (!seedFrame) return [];
  const seed = [...seedFrame.faces].sort((a, b) => {
    const ay = boxCenter(a.bbox)[1] / Math.max(1, params.imgHeight);
    const by = boxCenter(b.bbox)[1] / Math.max(1, params.imgHeight);
    if (Math.abs(ay - by) > 0.1) return ay - by;
    return boxCenter(a.bbox)[0] - boxCenter(b.bbox)[0];
  });

  const maxLinkDistPx = Math.max(40, params.imgWidth * 0.22);
  const tracks: SlotTrack[] = seed.map((f, slot) => ({
    slot,
    motion_class: "static",
    max_drift_pct: 0,
    max_scale_delta: 0,
    points: [{ t: seedFrame.t, bbox: f.bbox }],
  }));

  for (const frame of frames) {
    if (frame.t === seedFrame.t) continue;
    const taken = new Set<number>();
    for (const track of tracks) {
      const last = track.points[track.points.length - 1];
      const [lcx, lcy] = boxCenter(last.bbox);
      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      frame.faces.forEach((f, idx) => {
        if (taken.has(idx)) return;
        const [cx, cy] = boxCenter(f.bbox);
        const d = Math.hypot(cx - lcx, cy - lcy);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0 && bestDist <= maxLinkDistPx) {
        taken.add(bestIdx);
        track.points.push({ t: frame.t, bbox: frame.faces[bestIdx].bbox });
      }
    }
  }

  for (const track of tracks) {
    const metrics = classifyMotion(track.points, params.imgWidth);
    track.motion_class = metrics.motion_class;
    track.max_drift_pct = metrics.max_drift_pct;
    track.max_scale_delta = metrics.max_scale_delta;
  }
  return tracks;
}

export function classifyMotion(
  points: TrackPoint[],
  imgWidth: number,
): { motion_class: MotionClass; max_drift_pct: number; max_scale_delta: number } {
  if (points.length < 2) {
    return { motion_class: "static", max_drift_pct: 0, max_scale_delta: 0 };
  }
  const w = Math.max(1, imgWidth);
  const [cx0, cy0] = boxCenter(points[0].bbox);
  const w0 = boxWidth(points[0].bbox);
  let maxDrift = 0;
  let maxScale = 0;
  for (const p of points) {
    const [cx, cy] = boxCenter(p.bbox);
    maxDrift = Math.max(maxDrift, Math.hypot(cx - cx0, cy - cy0) / w);
    maxScale = Math.max(maxScale, Math.abs(boxWidth(p.bbox) - w0) / w0);
  }
  const moving = maxDrift > STATIC_DRIFT_PCT || maxScale > STATIC_SCALE_DELTA;
  return {
    motion_class: moving ? "moving" : "static",
    max_drift_pct: Number(maxDrift.toFixed(4)),
    max_scale_delta: Number(maxScale.toFixed(4)),
  };
}

/** Linear interpolation of the trajectory at an arbitrary timestamp. */
export function sampleTrackAt(
  points: TrackPoint[],
  t: number,
): [number, number, number, number] | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0].bbox;
  if (t <= points[0].t) return points[0].bbox;
  const last = points[points.length - 1];
  if (t >= last.t) return last.bbox;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (t <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const r = (t - a.t) / span;
      return [
        Math.round(a.bbox[0] + (b.bbox[0] - a.bbox[0]) * r),
        Math.round(a.bbox[1] + (b.bbox[1] - a.bbox[1]) * r),
        Math.round(a.bbox[2] + (b.bbox[2] - a.bbox[2]) * r),
        Math.round(a.bbox[3] + (b.bbox[3] - a.bbox[3]) * r),
      ];
    }
  }
  return last.bbox;
}

/**
 * Per-frame boxes for a MOVING speaker.
 *
 * Frames outside the speaker's voiced windows stay `null` — that is the v201
 * morph-bleed guard and it is deliberately preserved here.
 */
export function buildTrackedPerFrameBoxes(params: {
  points: TrackPoint[];
  frameCount: number;
  fps: number;
  voicedWindowsSec?: Array<[number, number]>;
  clampWidth: number;
  clampHeight: number;
  /** Extra px margin around the interpolated face box (default 6 % of width). */
  padPx?: number;
}): Array<[number, number, number, number] | null> {
  const total = Math.max(1, Math.round(params.frameCount));
  const fps = params.fps > 0 ? params.fps : 30;
  const out: Array<[number, number, number, number] | null> = new Array(total).fill(null);
  if (params.points.length === 0) return out;

  const windows = (params.voicedWindowsSec ?? [])
    .map(([s, e]) => [
      Math.max(0, Math.floor(s * fps)),
      Math.min(total - 1, Math.ceil(e * fps)),
    ] as [number, number])
    .filter(([s, e]) => e >= s);

  const inWindow = (i: number) =>
    windows.length === 0 ? true : windows.some(([s, e]) => i >= s && i <= e);

  for (let i = 0; i < total; i++) {
    if (!inWindow(i)) continue;
    const box = sampleTrackAt(params.points, i / fps);
    if (!box) continue;
    const pad = params.padPx ?? Math.round(Math.max(4, (box[2] - box[0]) * 0.06));
    const x1 = Math.max(0, Math.min(params.clampWidth - 2, box[0] - pad));
    const y1 = Math.max(0, Math.min(params.clampHeight - 2, box[1] - pad));
    const x2 = Math.max(x1 + 2, Math.min(params.clampWidth, box[2] + pad));
    const y2 = Math.max(y1 + 2, Math.min(params.clampHeight, box[3] + pad));
    out[i] = [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)];
  }
  return out;
}

/* ── Track validity ───────────────────────────────────────────────────── */

export function parseMotionTrack(raw: unknown): MotionTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<MotionTrack>;
  if (t.version !== MOTION_TRACK_VERSION) return null;
  if (!Array.isArray(t.slots) || t.slots.length === 0) return null;
  if (!t.dims || !Number.isFinite(Number(t.dims.width)) || !Number.isFinite(Number(t.dims.height))) {
    return null;
  }
  return t as MotionTrack;
}

/**
 * A track is only usable when it was measured on the very plate we are about
 * to dispatch and is recent enough. Everything else → static legacy path.
 */
export function isTrackUsable(
  track: MotionTrack | null,
  plateUrl: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!track) return false;
  if (!plateUrl) return false;
  if (stripQuery(track.plate_url) !== stripQuery(plateUrl)) return false;
  const created = Date.parse(track.created_at ?? "");
  if (!Number.isFinite(created)) return false;
  if (nowMs - created > TRACK_MAX_AGE_MS) return false;
  return true;
}

export function slotTrackFor(track: MotionTrack | null, slot: number): SlotTrack | null {
  if (!track) return null;
  const found = track.slots.find((s) => Number(s.slot) === Number(slot));
  if (!found || !Array.isArray(found.points) || found.points.length < 2) return null;
  return found;
}

function stripQuery(url: string): string {
  const s = String(url ?? "");
  const q = s.indexOf("?");
  return q >= 0 ? s.slice(0, q) : s;
}

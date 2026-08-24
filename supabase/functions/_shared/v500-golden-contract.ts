/**
 * V500-A — GOLDEN CONTRACT (frozen fixture, read-only)
 * ---------------------------------------------------------------------------
 * Source of truth: the known-good v400 homepage run
 *   scene   c934a823-47de-49b7-a62e-a116b49ca3b2  (4 speakers, lip_sync_status
 *           = "done", dialog_shots.version 5, all 4 passes status "done")
 *
 * Every number below is transcribed verbatim from that run's persisted pass
 * state (`composer_scenes.dialog_shots.passes[*]`, probes `_v105_probe` /
 * `_v106_probe`). Nothing here is inferred from documentation — the v400 prose
 * spec is explicitly NOT the authority; the run that actually worked is.
 *
 * This module is data only. It is imported by the V500 conformance tests so a
 * future change to the lip-sync engine must justify itself against the run
 * that is known to have produced correct lip-sync.
 */

export const V500_GOLDEN_SCENE_ID = "c934a823-47de-49b7-a62e-a116b49ca3b2";
export const V500_GOLDEN_PLATE = { width: 1284, height: 718 } as const;

export interface V500GoldenPass {
  idx: number;
  speakerIdx: number;
  /** Plate-space face bbox [x1, y1, x2, y2] the pass was framed with. */
  plateBbox: [number, number, number, number];
  /** Plate-space face centre the crop was built around. */
  coords: [number, number];
  /** The FROZEN square crop of the pass (plate pixels → 720 output). */
  crop: { x: number; y: number; size: number; outputSize: number };
  /** `preclip_anchor` as persisted by the golden run. */
  anchor: "face_center" | "mouth";
  /** `preclip_mouth_offset_px` as persisted by the golden run. */
  mouthOffsetPx: number;
  /** `plate_mouth` of the identity mapping — null means: never measured. */
  plateMouth: [number, number] | null;
  /** Number of camera-path keyframes persisted (0 = no path existed at all). */
  cameraPathKeyframes: number;
  fps: number;
  frameCount: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  /** T10 dispatch shape. */
  dispatch: {
    model: string;
    retryVariant: string;
    asdMode: string;
    syncMode: string;
    inputSpace: string;
    videoKind: string;
    optionKeys: string[];
    pipeline: string;
    speakers: number;
  };
  outcome: "done";
}

const DISPATCH = {
  model: "sync-3",
  retryVariant: "bbox-url-pro",
  asdMode: "bounding_boxes_url",
  syncMode: "cut_off",
  inputSpace: "clip",
  videoKind: "preclip",
  optionKeys: ["sync_mode", "active_speaker_detection"],
  pipeline: "v204_preclip_bbox_clipspace",
  speakers: 4,
} as const;

export const V500_GOLDEN_PASSES: V500GoldenPass[] = [
  {
    idx: 0,
    speakerIdx: 0,
    plateBbox: [809, 159, 867, 231],
    coords: [838, 195],
    crop: { x: 728, y: 84, size: 220, outputSize: 720 },
    anchor: "face_center",
    mouthOffsetPx: 0,
    plateMouth: null,
    cameraPathKeyframes: 0,
    fps: 30,
    frameCount: 55,
    startSec: 0,
    endSec: 1.831,
    durationSec: 1.831,
    dispatch: { ...DISPATCH, optionKeys: [...DISPATCH.optionKeys] },
    outcome: "done",
  },
  {
    idx: 1,
    speakerIdx: 1,
    plateBbox: [355, 157, 427, 257],
    coords: [391, 207],
    crop: { x: 266, y: 82, size: 250, outputSize: 720 },
    anchor: "face_center",
    mouthOffsetPx: 0,
    plateMouth: null,
    cameraPathKeyframes: 0,
    fps: 30,
    frameCount: 49,
    startSec: 1.981,
    endSec: 3.614,
    durationSec: 1.633,
    dispatch: { ...DISPATCH, optionKeys: [...DISPATCH.optionKeys] },
    outcome: "done",
  },
  {
    idx: 2,
    speakerIdx: 2,
    plateBbox: [663, 169, 715, 235],
    coords: [689, 202],
    crop: { x: 578, y: 92, size: 220, outputSize: 720 },
    anchor: "face_center",
    mouthOffsetPx: 0,
    plateMouth: null,
    cameraPathKeyframes: 0,
    fps: 30,
    frameCount: 66,
    startSec: 3.764,
    endSec: 5.953,
    durationSec: 2.189,
    dispatch: { ...DISPATCH, optionKeys: [...DISPATCH.optionKeys] },
    outcome: "done",
  },
  {
    idx: 3,
    speakerIdx: 3,
    plateBbox: [1067, 197, 1109, 253],
    coords: [1088, 225],
    crop: { x: 976, y: 114, size: 222, outputSize: 720 },
    anchor: "face_center",
    mouthOffsetPx: 0,
    plateMouth: null,
    cameraPathKeyframes: 0,
    fps: 30,
    frameCount: 49,
    startSec: 6.103,
    endSec: 7.736,
    durationSec: 1.633,
    dispatch: { ...DISPATCH, optionKeys: [...DISPATCH.optionKeys] },
    outcome: "done",
  },
];

/** Face height as a fraction of the crop (identical in the 720 preclip). */
export function goldenFaceShare(p: V500GoldenPass): number {
  return (p.plateBbox[3] - p.plateBbox[1]) / p.crop.size;
}

/** Face height in PRECLIP pixels (plate height scaled to the 720 output). */
export function goldenFaceSizePx(p: V500GoldenPass): number {
  return (p.plateBbox[3] - p.plateBbox[1]) * (p.crop.outputSize / p.crop.size);
}

/**
 * Normalised mouth height inside the golden preclip, derived with the SAME
 * face ratio the engine uses when no landmark exists (`FACE_MOUTH_Y_RATIO`).
 * The golden run never measured a mouth (`plateMouth = null`), so this is the
 * only defensible reconstruction of where the mouth actually sat.
 */
export function goldenMouthHeight(p: V500GoldenPass, faceRatio: number): number {
  const y1 = p.plateBbox[1];
  const h = p.plateBbox[3] - p.plateBbox[1];
  return (y1 + h * faceRatio - p.crop.y) / p.crop.size;
}

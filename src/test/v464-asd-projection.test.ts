/**
 * V464-B regression fixtures — per-frame ASD registration.
 *
 * The fixtures are the REAL frozen geometry of the two audited cohorts:
 *   S01  (scene be60d106…, 4× provider NOOP) — dynamic camera path, moving head
 *   GOLD (scene c934a823…, 4× provider MOVED) — static crop, static head
 *
 * Acceptance (V464-B):
 *   - S01: per-frame boxes ≠ constant anchor box, mouth containment repaired
 *   - GOLD: unchanged good behaviour (constant box stays allowed)
 *   - bounds, frame count and plate-coordinate leakage are guarded
 */
import { describe, it, expect } from "vitest";
import {
  buildPerFrameAsdBoxes,
  validateAsdRegistration,
  projectPlateBoxToPreclip,
  sampleTrackAt,
  type Box,
  type PlateTrackSample,
} from "../../supabase/functions/_shared/v464-asd-projection";
import s01Path from "./fixtures/v464-s01-pass0-camera-path.json";

// ── S01 pass 0 (frozen production values) ────────────────────────────────────
const S01_CROP = { x: 181, y: 160, size: 165, outputSize: 720 };
const S01_PLATE_BOX: Box = [226, 166, 300, 273];
const S01_WIRE_BOX: Box = [170, 0, 545, 511]; // what production actually sent
const S01_FRAMES = 71;
const S01_FPS = 30;

/**
 * Plate face track reconstructed from the frozen camera-path keyframes: each
 * keyframe carries the measured mouth (mx,my) in plate space; the face box is
 * the anchor box translated by the mouth delta (rigid head movement).
 */
const S01_TRACK: PlateTrackSample[] = (s01Path.keyframes as Array<{ t: number; mx: number; my: number }>)
  .map((k) => {
    const dx = k.mx - 286;
    const dy = k.my - 252;
    return {
      t: k.t,
      box: [
        S01_PLATE_BOX[0] + dx,
        S01_PLATE_BOX[1] + dy,
        S01_PLATE_BOX[2] + dx,
        S01_PLATE_BOX[3] + dy,
      ] as Box,
      mouth: [k.mx, k.my] as [number, number],
    };
  });

// ── GOLD pass 1 (frozen production values) ───────────────────────────────────
const GOLD_CROP = { x: 300, y: 120, size: 260, outputSize: 720 };
const GOLD_PLATE_BOX: Box = [390, 204, 470, 297];
const GOLD_WIRE_BOX: Box = [249, 232, 471, 491];
const GOLD_FRAMES = 55;

describe("V464-B — pure projection", () => {
  it("projects with the contract formula and clamps only afterwards", () => {
    const b = projectPlateBoxToPreclip([226, 166, 300, 273], S01_CROP);
    const s = 720 / 165;
    expect(b[0]).toBe(Math.round((226 - 181) * s));
    expect(b[1]).toBe(Math.round((166 - 160) * s));
    expect(b[2]).toBe(Math.round((300 - 181) * s));
    expect(b[3]).toBe(Math.round((273 - 160) * s));
  });

  it("interpolates the track in time instead of snapping to a keyframe", () => {
    const t: PlateTrackSample[] = [
      { t: 0, box: [0, 0, 100, 100], mouth: [50, 78] },
      { t: 1, box: [100, 0, 200, 100], mouth: [150, 78] },
    ];
    expect(sampleTrackAt(t, 0.5).box).toEqual([50, 0, 150, 100]);
    expect(sampleTrackAt(t, -5).box).toEqual([0, 0, 100, 100]);
    expect(sampleTrackAt(t, 9).box).toEqual([100, 0, 200, 100]);
  });
});

describe("V464-B — S01 (dynamic camera path + moving head)", () => {
  const built = buildPerFrameAsdBoxes({
    frameCount: S01_FRAMES,
    fps: S01_FPS,
    staticCrop: S01_CROP,
    cameraPath: s01Path as never,
    faceTrack: S01_TRACK,
    preclipStartSec: 0,
    anchorPlateBox: S01_PLATE_BOX,
    anchorDispatchBox: S01_WIRE_BOX,
    voicedWindowsSec: [[0, 2.342]],
  });

  it("does not emit a constant anchor box", () => {
    expect(built.registration).toBe("per_frame");
    expect(built.varying).toBe(true);
    expect(built.boxTravelPx).toBeGreaterThan(10);
    const unique = new Set(built.frameBoxes.map((b) => b.join(",")));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("keeps exactly one box slot per dispatched frame", () => {
    expect(built.boxes).toHaveLength(S01_FRAMES);
    expect(built.frameBoxes).toHaveLength(S01_FRAMES);
    expect(built.boxes.every((b) => b !== null)).toBe(true);
  });

  it("stays inside the final 720×720 preclip space", () => {
    for (const b of built.frameBoxes) {
      expect(b[0]).toBeGreaterThanOrEqual(0);
      expect(b[1]).toBeGreaterThanOrEqual(0);
      expect(b[2]).toBeLessThanOrEqual(720);
      expect(b[3]).toBeLessThanOrEqual(720);
      expect(b[2]).toBeGreaterThan(b[0]);
      expect(b[3]).toBeGreaterThan(b[1]);
    }
  });

  it("repairs mouth containment versus the frozen constant box", () => {
    const inNew = built.frameMouths.filter((m, i) => {
      const b = built.frameBoxes[i];
      return m[0] >= b[0] && m[0] <= b[2] && m[1] >= b[1] && m[1] <= b[3];
    }).length;
    const inOld = built.frameMouths.filter((m) =>
      m[0] >= S01_WIRE_BOX[0] && m[0] <= S01_WIRE_BOX[2] &&
      m[1] >= S01_WIRE_BOX[1] && m[1] <= S01_WIRE_BOX[3]
    ).length;
    expect(inNew).toBe(S01_FRAMES);
    expect(inNew).toBeGreaterThan(inOld);
  });

  it("passes the pre-dispatch registration gate", () => {
    const v = validateAsdRegistration({ built, frameCount: S01_FRAMES, outputSize: 720 });
    expect(v.ok).toBe(true);
    expect(v.containmentRate).toBe(1);
    expect(v.worstMarginPx).toBeGreaterThanOrEqual(0);
  });
});

describe("V464-B — moving head with a STATIC crop", () => {
  const moving: PlateTrackSample[] = [
    { t: 0, box: [226, 166, 300, 273], mouth: [263, 249] },
    { t: 1.0, box: [256, 166, 330, 273], mouth: [293, 249] },
    { t: 2.0, box: [286, 170, 360, 277], mouth: [323, 253] },
  ];
  const built = buildPerFrameAsdBoxes({
    frameCount: 60,
    fps: 30,
    staticCrop: S01_CROP,
    cameraPath: null,
    faceTrack: moving,
    preclipStartSec: 0,
    anchorPlateBox: S01_PLATE_BOX,
    anchorDispatchBox: S01_WIRE_BOX,
    voicedWindowsSec: [[0, 2]],
  });

  it("follows the face track even when the crop is frozen", () => {
    expect(built.cropSource).toBe("static");
    expect(built.trackSource).toBe("face_track");
    expect(built.varying).toBe(true);
    expect(built.frameBoxes[59][0]).toBeGreaterThan(built.frameBoxes[0][0]);
    expect(validateAsdRegistration({ built, frameCount: 60, outputSize: 720 }).ok).toBe(true);
  });
});

describe("V464-B — GOLD (static head + static crop) stays unchanged", () => {
  const staticTrack: PlateTrackSample[] = [
    { t: 0, box: GOLD_PLATE_BOX, mouth: [430, 277] },
    { t: 0.9, box: GOLD_PLATE_BOX, mouth: [430, 277] },
    { t: 1.8, box: GOLD_PLATE_BOX, mouth: [430, 277] },
  ];
  const built = buildPerFrameAsdBoxes({
    frameCount: GOLD_FRAMES,
    fps: 30,
    staticCrop: GOLD_CROP,
    cameraPath: null,
    faceTrack: staticTrack,
    preclipStartSec: 0,
    anchorPlateBox: GOLD_PLATE_BOX,
    anchorDispatchBox: GOLD_WIRE_BOX,
    voicedWindowsSec: [[0, 1.8]],
  });

  it("keeps a constant box when nothing moves", () => {
    expect(built.varying).toBe(false);
    expect(built.trackTravelPx).toBe(0);
    expect(new Set(built.frameBoxes.map((b) => b.join(",")))).toHaveProperty("size", 1);
  });

  it("reproduces the frozen GOLD wire box", () => {
    expect(built.frameBoxes[0]).toEqual(GOLD_WIRE_BOX);
    expect(built.boxes).toHaveLength(GOLD_FRAMES);
    expect(validateAsdRegistration({ built, frameCount: GOLD_FRAMES, outputSize: 720 }).ok).toBe(true);
  });
});

describe("V464-B — invariants that block a dispatch", () => {
  it("rejects a constant box while the track really moves", () => {
    const built = buildPerFrameAsdBoxes({
      frameCount: 30,
      fps: 30,
      staticCrop: S01_CROP,
      cameraPath: null,
      faceTrack: null,
      preclipStartSec: 0,
      anchorPlateBox: S01_PLATE_BOX,
      anchorDispatchBox: S01_WIRE_BOX,
      voicedWindowsSec: [[0, 1]],
    });
    expect(built.registration).toBe("anchor_constant");
    // Simulated evidence of movement without a usable track → fail closed.
    const moved = { ...built, trackTravelPx: 40 };
    const v = validateAsdRegistration({ built: moved, frameCount: 30, outputSize: 720 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("constant_box_on_moving_track");
  });

  it("rejects a sequence whose mouth leaves the box", () => {
    const built = buildPerFrameAsdBoxes({
      frameCount: 30,
      fps: 30,
      staticCrop: S01_CROP,
      cameraPath: null,
      faceTrack: null,
      preclipStartSec: 0,
      anchorPlateBox: S01_PLATE_BOX,
      anchorDispatchBox: [0, 0, 40, 40] as Box,
      voicedWindowsSec: [[0, 1]],
    });
    const v = validateAsdRegistration({ built, frameCount: 30, outputSize: 720 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("mouth_outside_box");
  });

  it("never lets raw plate coordinates reach the wire", () => {
    const built = buildPerFrameAsdBoxes({
      frameCount: 10,
      fps: 30,
      staticCrop: S01_CROP,
      cameraPath: null,
      faceTrack: S01_TRACK,
      preclipStartSec: 0,
      anchorPlateBox: S01_PLATE_BOX,
      anchorDispatchBox: S01_WIRE_BOX,
      voicedWindowsSec: [[0, 0.3]],
    });
    for (const b of built.frameBoxes) expect(b).not.toEqual(S01_PLATE_BOX);
  });

  it("masks silent frames to null and keeps the frame count exact", () => {
    const built = buildPerFrameAsdBoxes({
      frameCount: 60,
      fps: 30,
      staticCrop: S01_CROP,
      cameraPath: null,
      faceTrack: S01_TRACK,
      preclipStartSec: 0,
      anchorPlateBox: S01_PLATE_BOX,
      anchorDispatchBox: S01_WIRE_BOX,
      voicedWindowsSec: [[0, 0.5]],
    });
    expect(built.boxes).toHaveLength(60);
    expect(built.boxes.filter((b) => b === null).length).toBeGreaterThan(0);
    expect(built.boxes.slice(0, 10).every((b) => b !== null)).toBe(true);
  });
});

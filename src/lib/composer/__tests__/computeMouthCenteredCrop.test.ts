import { describe, it, expect } from "vitest";
import { computeMouthCenteredCrop } from "../computeMouthCenteredCrop";

describe("computeMouthCenteredCrop (v247)", () => {
  it("centers on mouth when landmark is present, not face-bbox center", () => {
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [500, 200, 700, 500], // 200x300 face
        center: [600, 350],
        mouth: [600, 440], // mouth sits low in the face bbox
      },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.anchor).toBe("mouth");
    const cy = r.crop.y + r.crop.size / 2;
    expect(Math.abs(cy - 440)).toBeLessThanOrEqual(1);
    expect(r.mouthOffsetPx).toBeLessThanOrEqual(1);
  });

  it("falls back to face-center when mouth landmark missing", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [400, 200, 600, 400], center: [500, 300] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.anchor).toBe("face_center");
    const cx = r.crop.x + r.crop.size / 2;
    expect(Math.abs(cx - 500)).toBeLessThanOrEqual(1);
  });

  it("fixes the v247 regression: face 104x108 in 1284x718 plate hits ≥40% share", () => {
    // The exact failing scene: face was ~104x108 → ~1% of plate area.
    // v247 crop should shrink around the mouth so face-share ≥ 0.40.
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [980, 300, 1084, 408],
        center: [1032, 354],
        mouth: [1032, 388],
      },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.faceShareInCrop).toBeGreaterThanOrEqual(0.35);
  });

  it("speaker on the far right stays centered on mouth (no clamp to plate center)", () => {
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [1050, 220, 1230, 460],
        center: [1140, 340],
        mouth: [1140, 410],
      },
      plateWidth: 1284,
      plateHeight: 718,
    });
    // Crop must contain the mouth; it may be clamped to plate right edge.
    expect(1140).toBeGreaterThanOrEqual(r.crop.x);
    expect(1140).toBeLessThanOrEqual(r.crop.x + r.crop.size);
    expect(410).toBeGreaterThanOrEqual(r.crop.y);
    expect(410).toBeLessThanOrEqual(r.crop.y + r.crop.size);
  });

  it("respects minSize floor for tiny faces", () => {
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [640, 350, 660, 370],
        center: [650, 360],
        mouth: [650, 366],
      },
      plateWidth: 1284,
      plateHeight: 718,
      minSize: 128,
    });
    expect(r.crop.size).toBeGreaterThanOrEqual(128);
  });

  it("does not exceed plate dimensions", () => {
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [100, 100, 900, 900],
        center: [500, 500],
        mouth: [500, 700],
      },
      plateWidth: 1000,
      plateHeight: 1000,
    });
    expect(r.crop.size).toBeLessThanOrEqual(1000);
    expect(r.crop.x).toBeGreaterThanOrEqual(0);
    expect(r.crop.y).toBeGreaterThanOrEqual(0);
    expect(r.crop.x + r.crop.size).toBeLessThanOrEqual(1000);
    expect(r.crop.y + r.crop.size).toBeLessThanOrEqual(1000);
  });

  it("mouth near top edge shrinks size but keeps mouth inside crop", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [500, 0, 700, 80], center: [600, 40], mouth: [600, 30] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.crop.y).toBe(0);
    expect(30).toBeLessThanOrEqual(r.crop.y + r.crop.size);
  });

  it("returns outputSize verbatim (default 720)", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [400, 200, 600, 400], center: [500, 300], mouth: [500, 360] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.crop.outputSize).toBe(720);
  });

  it("larger targetFaceShare yields tighter crop", () => {
    const base = { bbox: [500, 200, 700, 500] as [number, number, number, number], center: [600, 350] as [number, number], mouth: [600, 420] as [number, number] };
    const loose = computeMouthCenteredCrop({ face: base, plateWidth: 1284, plateHeight: 718, targetFaceShare: 0.20 });
    const tight = computeMouthCenteredCrop({ face: base, plateWidth: 1284, plateHeight: 718, targetFaceShare: 0.60 });
    expect(tight.crop.size).toBeLessThan(loose.crop.size);
    expect(tight.faceShareInCrop).toBeGreaterThan(loose.faceShareInCrop);
  });

  it("flags clamped=true when crop cannot center on anchor", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [10, 300, 190, 500], center: [100, 400], mouth: [50, 460] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.clamped).toBe(true);
  });

  it("throws on invalid plate dimensions", () => {
    expect(() =>
      computeMouthCenteredCrop({
        face: { bbox: [0, 0, 100, 100], center: [50, 50] },
        plateWidth: 0,
        plateHeight: 100,
      }),
    ).toThrow();
  });

  it("throws on invalid targetFaceShare", () => {
    expect(() =>
      computeMouthCenteredCrop({
        face: { bbox: [0, 0, 100, 100], center: [50, 50] },
        plateWidth: 500,
        plateHeight: 500,
        targetFaceShare: 1.5,
      }),
    ).toThrow();
  });
});

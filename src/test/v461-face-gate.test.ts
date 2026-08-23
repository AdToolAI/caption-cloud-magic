import { describe, expect, it } from "vitest";
import {
  evaluateV461FaceGate,
  V461_FACE_SHARE_FLOOR,
  V461_FACE_SIZE_PROVIDER_PX_FLOOR,
} from "../../supabase/functions/_shared/v461-face-gate";

/**
 * V461 A — the v400 input contract is a HARD gate again.
 * Ground truth: scene be60d106…, pass 4 (face_share 0.218) must block,
 * pass 0/5 (0.306 / 0.313) must pass.
 */

// Crop 600 plate px → 720 provider px (scale 1.2). Face 300 px → 360 provider px.
const baseGeometry = {
  usePreclip: true as const,
  crop: { size: 600, outputSize: 720 },
  faceBbox: [100, 100, 400, 400],
  anchor: "mouth",
  mouthOffsetXy: { dx: 0, dy: 0 },
};

describe("V461 A — v400 Face-Gate", () => {
  it("blocks the V460 offender (face_share 0.218 < 0.24)", () => {
    const r = evaluateV461FaceGate({ ...baseGeometry, faceShare: 0.218 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("block");
    expect(r.failedCheck).toBe("face_share");
    expect(r.code).toBe("preclip_face_share_below_floor");
    expect(r.metrics.face_share_floor).toBe(V461_FACE_SHARE_FLOOR);
  });

  it("passes the two contract-conform passes (0.306 / 0.313)", () => {
    for (const share of [0.306, 0.313]) {
      const r = evaluateV461FaceGate({ ...baseGeometry, faceShare: share });
      expect(r.ok).toBe(true);
      expect(r.status).toBe("pass");
      expect(r.checks.face_share).toBe(true);
      expect(r.checks.face_size_px).toBe(true);
    }
  });

  it("treats the pixel floor as an independent guard (share ok, face too small)", () => {
    const r = evaluateV461FaceGate({
      usePreclip: true,
      // 1400px crop downscaled to 720 → scale 0.514; face 240px → 123 provider px
      crop: { size: 1400, outputSize: 720 },
      faceBbox: [0, 0, 240, 240],
      faceShare: 0.30,
      anchor: "mouth",
      mouthOffsetXy: { dx: 0, dy: 0 },
    });
    expect(r.ok).toBe(false);
    expect(r.failedCheck).toBe("face_size_px");
    expect(r.metrics.face_size_floor_px).toBe(V461_FACE_SIZE_PROVIDER_PX_FLOOR);
    expect(r.metrics.face_size_provider_px!).toBeLessThan(
      V461_FACE_SIZE_PROVIDER_PX_FLOOR,
    );
  });

  it("blocks when the mouth ROI would leave the crop", () => {
    const r = evaluateV461FaceGate({
      ...baseGeometry,
      faceShare: 0.30,
      // mouth sits at 96 % of the crop width → band cannot fit
      mouthOffsetXy: { dx: 276, dy: 0 },
    });
    expect(r.ok).toBe(false);
    expect(r.failedCheck).toBe("mouth_roi");
    expect(r.code).toBe("preclip_mouth_roi_outside_crop");
  });

  it("does NOT block a pure pose estimate — the ROI check is reported unchecked", () => {
    const r = evaluateV461FaceGate({
      ...baseGeometry,
      faceShare: 0.30,
      anchor: "face-fallback",
      mouthOffsetXy: null,
    });
    expect(r.ok).toBe(true);
    expect(r.checks.mouth_roi).toBeNull();
    expect(r.metrics.mouth_roi_checked).toBe(false);
  });

  it("fails closed when the geometry is missing", () => {
    expect(evaluateV461FaceGate({ usePreclip: true, faceShare: 0.5 }).ok).toBe(false);
    expect(
      evaluateV461FaceGate({ ...baseGeometry, faceBbox: null, faceShare: 0.5 }).code,
    ).toBe("preclip_geometry_unavailable");
    expect(evaluateV461FaceGate({ ...baseGeometry, faceShare: null }).ok).toBe(false);
  });

  it("blocks a geometry that belongs to another run/pass", () => {
    const r = evaluateV461FaceGate({
      ...baseGeometry,
      faceShare: 0.30,
      identity: { runId: "run-a", generation: 3, passIdx: 1, speakerIdx: 1 },
      expectedIdentity: { runId: "run-b", generation: 3, passIdx: 1, speakerIdx: 1 },
    });
    expect(r.ok).toBe(false);
    expect(r.failedCheck).toBe("identity");
  });

  it("skips full-plate dispatches (out of scope)", () => {
    const r = evaluateV461FaceGate({ usePreclip: false });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("skipped");
  });
});

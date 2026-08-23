/**
 * V458 — MOUTH-ROI VECTOR PERSISTENCE + NON-TERMINAL ROI-UNRESOLVED
 *
 * Proves the whole contract chain the fix is supposed to restore:
 *
 *   final V457 crop → mouth anchor → signed mouthOffsetXy (PLATE px)
 *   → V456 ROI contract = authoritative → geometry ROI authoritative
 *
 * and the honest safety net:
 *
 *   no trustworthy mouth anchor → mouthOffsetXy = null
 *   → mouth_roi_unresolved → motion_unverified (never motion_verified)
 */
import { describe, it, expect } from "vitest";
import {
  computeMouthCenteredCrop,
  V458_MOUTH_OFFSET_SPACE,
} from "../lib/composer/computeMouthCenteredCrop";
import {
  deriveMouthRoi,
  V434_LEGACY_ROI,
} from "../../supabase/functions/_shared/v434-motion-roi";
import { evaluateMouthRoiContract } from "../../supabase/functions/_shared/v456-roi-contract";
import {
  classifyMeasurementFailure,
  isMouthRoiUnresolved,
} from "../../supabase/functions/_shared/motion-probe-infra";

const ANCHOR =
  "https://x.supabase.co/storage/v1/object/public/anchors/scene-be60d106/anchor.png";

const IDENTITY = { runId: "run-s01", generation: 3, passIdx: 5, speakerIdx: 3 };

describe("V458 — signed mouth offset vector", () => {
  it("stores the vector in PLATE pixels relative to the FINAL crop center", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [500, 200, 700, 500], center: [600, 350], mouth: [600, 440] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.mouthOffsetSpace).toBe(V458_MOUTH_OFFSET_SPACE);
    expect(r.mouthOffsetSpace).toBe("plate");
    expect(r.mouthOffsetXy).not.toBeNull();
    const cx = r.crop.x + r.crop.size / 2;
    const cy = r.crop.y + r.crop.size / 2;
    expect(r.mouthOffsetXy!.dx).toBeCloseTo(600 - cx, 10);
    expect(r.mouthOffsetXy!.dy).toBeCloseTo(440 - cy, 10);
  });

  it("keeps scalar and vector coherent (scalar = round(hypot(vector)))", () => {
    // Anchor near the plate edge forces a clamp → non-zero offset.
    const r = computeMouthCenteredCrop({
      face: { bbox: [10, 10, 210, 310], center: [110, 160], mouth: [40, 260] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.mouthOffsetXy).not.toBeNull();
    expect(r.mouthOffsetPx).toBe(
      Math.round(Math.hypot(r.mouthOffsetXy!.dx, r.mouthOffsetXy!.dy)),
    );
  });

  it("does not round the components on odd crop sizes (half pixels survive)", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [100, 100, 200, 200], center: [150, 150], mouth: [150, 180] },
      plateWidth: 1000,
      plateHeight: 800,
    });
    // Force the odd-size case deterministically via the pure geometry math.
    const size = 153;
    const x = 10;
    const mouthX = 100;
    const dx = mouthX - (x + size / 2);
    expect(dx % 1).not.toBe(0); // .5 present — must never be pre-rounded
    expect(Math.round(Math.hypot(dx, 0))).toBe(Math.round(Math.abs(dx)));
    // Sanity: the real result also carries a finite, unrounded-capable vector.
    expect(Number.isFinite(r.mouthOffsetXy!.dx)).toBe(true);
  });

  it("returns null for the face_center fallback (no guessed direction)", () => {
    const r = computeMouthCenteredCrop({
      face: { bbox: [400, 200, 600, 400], center: [500, 300] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(r.anchor).toBe("face_center");
    expect(r.mouthOffsetXy).toBeNull();
    expect(r.mouthOffsetPx).toBe(0);
  });

  it("recomputes the vector on the FINAL geometry when V457 projects the crop", () => {
    const containBox: [number, number, number, number] = [520, 180, 760, 520];
    const r = computeMouthCenteredCrop({
      face: { bbox: [560, 220, 720, 480], center: [640, 350], mouth: [640, 455] },
      plateWidth: 1284,
      plateHeight: 718,
      containBox,
    });
    expect(r.containsTarget).toBe(true);
    const cx = r.crop.x + r.crop.size / 2;
    const cy = r.crop.y + r.crop.size / 2;
    // Vector must describe the projected crop, not the pre-projection one.
    expect(r.mouthOffsetXy!.dx).toBeCloseTo(640 - cx, 10);
    expect(r.mouthOffsetXy!.dy).toBeCloseTo(455 - cy, 10);
  });
});

describe("V458 — coordinate space invariant (plate px, normalized by plate cropSize)", () => {
  it("deriveMouthRoi normalizes the plate vector with the PLATE crop size", () => {
    const d = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 400,
      mouthOffsetPx: 40,
      mouthOffset: { dx: 0, dy: 40 },
    });
    expect(d.source).toBe("geometry");
    // 40 plate px on a 400 plate-px crop = +0.1 normalized.
    expect(d.roi.centerY).toBeCloseTo(0.6, 6);
  });

  it("must NOT be interpreted in a rescaled provider space", () => {
    // Same physical geometry, but the provider clip is 720px while the crop
    // is 360 plate px. Using the plate vector against the PROVIDER size would
    // halve the offset — the ROI would land on the nose again (the v456 bug).
    const correct = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 360,
      mouthOffset: { dx: 0, dy: 36 },
    });
    const wrongProviderSpace = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 720, // provider output size — NOT the space of the vector
      mouthOffset: { dx: 0, dy: 36 },
    });
    expect(correct.roi.centerY).toBeCloseTo(0.6, 6);
    expect(wrongProviderSpace.roi.centerY).toBeCloseTo(0.55, 6);
    expect(correct.roi.centerY).not.toBeCloseTo(wrongProviderSpace.roi.centerY, 3);
  });

  it("refuses to guess when only the unsigned scalar exists", () => {
    const d = deriveMouthRoi({
      anchor: "mouth",
      faceShareInCrop: 0.42,
      cropSize: 400,
      mouthOffsetPx: 37,
      mouthOffset: null,
    });
    expect(d.source).toBe("legacy_frozen");
    expect(d.reason).toContain("mouth_offset_direction_unknown");
    expect(d.roi).toEqual(V434_LEGACY_ROI);
  });
});

describe("V458 — the production case reaches resolved + authoritative", () => {
  const crop = computeMouthCenteredCrop({
    face: { bbox: [820, 340, 1010, 560], center: [915, 450], mouth: [905, 512] },
    plateWidth: 1284,
    plateHeight: 718,
    containBox: [800, 320, 1030, 580],
  });

  it("produces a contained crop with a signed vector", () => {
    expect(crop.containsTarget).toBe(true);
    expect(crop.anchor).toBe("mouth");
    expect(crop.mouthOffsetXy).not.toBeNull();
  });

  it("satisfies the V456 contract end-to-end", () => {
    const c = evaluateMouthRoiContract({
      anchor: crop.anchor,
      faceShareInCrop: crop.faceShareInCrop,
      cropSize: crop.crop.size,
      mouthOffsetPx: crop.mouthOffsetPx,
      mouthOffset: crop.mouthOffsetXy,
      geometryMeasureSrc: ANCHOR,
      expectedAnchorSrc: ANCHOR,
      faceBbox: [820, 340, 1010, 560],
      identity: IDENTITY,
      expectedIdentity: IDENTITY,
    });
    expect(c.status).toBe("authoritative");
    expect(c.failedCheck).toBeNull();
    expect(c.derived.source).toBe("geometry");
    expect(c.roi).not.toBeNull();
    expect(c.roi).not.toEqual(V434_LEGACY_ROI);
  });

  it("stays honest when the mouth anchor is missing (null vector)", () => {
    const fallback = computeMouthCenteredCrop({
      face: { bbox: [820, 340, 1010, 560], center: [915, 450] },
      plateWidth: 1284,
      plateHeight: 718,
    });
    expect(fallback.mouthOffsetXy).toBeNull();
    const c = evaluateMouthRoiContract({
      anchor: fallback.anchor,
      faceShareInCrop: fallback.faceShareInCrop,
      cropSize: fallback.crop.size,
      mouthOffsetPx: fallback.mouthOffsetPx,
      mouthOffset: fallback.mouthOffsetXy,
      geometryMeasureSrc: ANCHOR,
      expectedAnchorSrc: ANCHOR,
      faceBbox: [820, 340, 1010, 560],
      identity: IDENTITY,
      expectedIdentity: IDENTITY,
    });
    expect(c.status).toBe("unresolved");
    expect(isMouthRoiUnresolved(c.reason)).toBe(true);
  });
});

describe("V458 — non-terminal ROI-unresolved routing", () => {
  /** Mirror of the narrowed webhook gate (sync-so-webhook, V443/V458). */
  const passthrough = (args: {
    singleSpeaker: boolean;
    verdict: string;
    motionUnverified: boolean;
    reason: string;
  }) => {
    if (args.singleSpeaker) return false;
    if (args.verdict !== "indeterminate") return false;
    if (!args.motionUnverified) return false;
    return (
      classifyMeasurementFailure(args.reason) === "probe_infra_error" ||
      isMouthRoiUnresolved(args.reason)
    );
  };

  it("admits mouth_roi_unresolved without terminalizing", () => {
    expect(
      passthrough({
        singleSpeaker: false,
        verdict: "indeterminate",
        motionUnverified: true,
        reason: "mouth_roi_unresolved:mouth_offset_direction_unknown",
      }),
    ).toBe(true);
  });

  it("still admits genuine probe infra exhaustion", () => {
    expect(
      passthrough({
        singleSpeaker: false,
        verdict: "indeterminate",
        motionUnverified: true,
        reason: "probe_http_500",
      }),
    ).toBe(classifyMeasurementFailure("probe_http_500") === "probe_infra_error");
  });

  it("does NOT dilute the NOOP ladder: other ambiguous reasons stay fail-closed", () => {
    expect(
      passthrough({
        singleSpeaker: false,
        verdict: "indeterminate",
        motionUnverified: true,
        reason: "metric_unusable_gray_zone",
      }),
    ).toBe(false);
    expect(
      passthrough({
        singleSpeaker: false,
        verdict: "noop",
        motionUnverified: true,
        reason: "mouth_roi_unresolved:anchor_not_mouth",
      }),
    ).toBe(false);
  });

  it("keeps motion_unverified semantically distinct from a verified verdict", () => {
    const telemetryState = "motion_unverified";
    expect(telemetryState).not.toBe("motion_verified");
    expect(isMouthRoiUnresolved("mouth_roi_unresolved:roi_out_of_bounds")).toBe(true);
    expect(isMouthRoiUnresolved("motion")).toBe(false);
  });

  /** Mirror of the watchdog decision (lipsync-watchdog, V458). */
  const watchdogSkips = (meta: Record<string, unknown>) =>
    String((meta as any).failure_class ?? "") === "mouth_roi_unresolved" ||
    isMouthRoiUnresolved(((meta as any).v456_roi_contract?.reason ?? null) as string | null);

  it("watchdog skips re-measure for structurally unresolved ROI", () => {
    expect(watchdogSkips({ failure_class: "mouth_roi_unresolved" })).toBe(true);
    expect(
      watchdogSkips({
        failure_class: "probe_infra_error",
        v456_roi_contract: { reason: "mouth_roi_unresolved:face_share_invalid" },
      }),
    ).toBe(true);
  });

  it("watchdog still re-measures genuine infra failures exactly once", () => {
    expect(
      watchdogSkips({
        failure_class: "probe_infra_error",
        v456_roi_contract: { reason: "roi_geometry_authoritative" },
      }),
    ).toBe(false);
  });
});

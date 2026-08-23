/**
 * V456 GATE 2 — FROZEN-FIXTURE REGRESSION SUITE
 *
 * The fixtures below are the FROZEN Gate-1 evidence of scene
 * be60d106-6908-4002-95d1-2bd01c5cfa6c (passes 0/1/5): the geometry that made
 * the pipeline terminalize six good clips as `sync_noop_unrecoverable`.
 *
 * No threshold is asserted or changed here (3.6827 / 15.4057 stay frozen and
 * live in the classifier); this suite only proves WHICH band is authoritative
 * and WHAT happens when the contract cannot be satisfied.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateMouthRoiContract,
  FACE_MOUTH_Y_RATIO,
  looksLikePlateSource,
  MOUTH_ROI_UNRESOLVED,
  resolveMouthAnchorPoseAware,
} from "./v456-roi-contract.ts";
import { isMouthRoiUnresolved, classifyMeasurementFailure } from "./motion-probe-infra.ts";
import { V434_LEGACY_ROI } from "./v434-motion-roi.ts";

const ANCHOR = "https://x.supabase.co/storage/v1/object/public/anchors/scene-be60d106/anchor.png";
const PLATE_SRC = "https://x.supabase.co/storage/v1/object/public/plates/be60d106.mp4#hydration=live";

/** The exact geometry S01 dispatched with (Gate-1 DB dump). */
const S01_BROKEN = {
  anchor: "face" as const,
  faceShareInCrop: 0,
  cropSize: 272,
  mouthOffsetPx: 0,
  mouthOffset: null,
  geometryMeasureSrc: PLATE_SRC,
  expectedAnchorSrc: ANCHOR,
  faceBbox: [820, 340, 1010, 560],
  identity: { runId: "run-s01", generation: 3, passIdx: 5, speakerIdx: 3 },
  expectedIdentity: { runId: "run-s01", generation: 3, passIdx: 5, speakerIdx: 3 },
};

/** The same pass AFTER the Gate-2 repair (anchor source + mouth anchor). */
const S01_REPAIRED = {
  ...S01_BROKEN,
  anchor: "mouth" as const,
  faceShareInCrop: 0.31,
  mouthOffsetPx: 44,
  mouthOffset: { dx: 0, dy: 44 },
  geometryMeasureSrc: ANCHOR,
};

Deno.test("v456: frozen S01 geometry is REJECTED — plate source is not an anchor", () => {
  const c = evaluateMouthRoiContract(S01_BROKEN);
  assertEquals(c.status, "unresolved");
  assertEquals(c.failedCheck, "anchor_source");
  assertEquals(c.reason, `${MOUTH_ROI_UNRESOLVED}:plate_source_rejected`);
  assert(looksLikePlateSource(PLATE_SRC));
});

Deno.test("v456: face_share = 0 never degrades into the legacy cheek ROI", () => {
  const c = evaluateMouthRoiContract({ ...S01_BROKEN, geometryMeasureSrc: ANCHOR });
  assertEquals(c.status, "unresolved");
  assertEquals(c.failedCheck, "face_share");
  assertEquals(c.roi, null);
  // Legacy band is still reported — as REGRESSION EVIDENCE, never as authority.
  assertEquals(c.legacyRoi, V434_LEGACY_ROI);
});

Deno.test("v456: repaired S01 geometry becomes authoritative and targets the mouth", () => {
  const c = evaluateMouthRoiContract(S01_REPAIRED);
  assertEquals(c.status, "authoritative");
  assertEquals(c.failedCheck, null);
  assert(c.roi !== null);
  // The mouth band must sit BELOW the frozen v404 cheek band (centerY 0.60)
  // — this is precisely the registration error Gate 1 proved.
  assert(c.roi!.centerY > V434_LEGACY_ROI.centerY, `roi.centerY=${c.roi!.centerY}`);
  assertEquals(Object.values(c.checks).every(Boolean), true);
});

Deno.test("v456: anchor drift between generations is rejected", () => {
  const c = evaluateMouthRoiContract({
    ...S01_REPAIRED,
    geometryMeasureSrc: ANCHOR.replace("anchor.png", "anchor-old.png"),
  });
  assertEquals(c.status, "unresolved");
  assertEquals(c.failedCheck, "anchor_source");
});

Deno.test("v456: identity drift (rerender generation) is rejected", () => {
  const c = evaluateMouthRoiContract({
    ...S01_REPAIRED,
    expectedIdentity: { ...S01_REPAIRED.expectedIdentity, generation: 4 },
  });
  assertEquals(c.status, "unresolved");
  assertEquals(c.failedCheck, "identity");
});

Deno.test("v456: missing face bbox is unresolved, not a NOOP", () => {
  const c = evaluateMouthRoiContract({ ...S01_REPAIRED, faceBbox: null });
  assertEquals(c.failedCheck, "face_bbox");
  assert(isMouthRoiUnresolved(c.reason));
});

Deno.test("v456: unresolved contract is NOT retried and NOT a clip verdict", () => {
  const c = evaluateMouthRoiContract(S01_BROKEN);
  // `measured_ambiguous` = no probe-infra re-measure loop; the webhook maps it
  // to `motion_unverified` via `isMouthRoiUnresolved`, so it never terminalizes.
  assertEquals(classifyMeasurementFailure(c.reason), "measured_ambiguous");
  assert(isMouthRoiUnresolved(c.reason));
});

Deno.test("v456: pose-aware mouth fallback — landmark wins, profile shifts sideways", () => {
  const bbox = [100, 100, 300, 340];
  const withLm = resolveMouthAnchorPoseAware({ bbox, landmark: [210, 290] });
  assertEquals(withLm?.source, "landmark");
  assertEquals(withLm?.mouth, [210, 290]);

  const frontal = resolveMouthAnchorPoseAware({ bbox, landmark: null, yawDeg: 0 })!;
  assertEquals(frontal.source, "pose_estimate");
  assertEquals(frontal.mouth[0], 200);
  assertEquals(frontal.mouth[1], 100 + 240 * FACE_MOUTH_Y_RATIO);

  const profile = resolveMouthAnchorPoseAware({ bbox, landmark: null, yawDeg: 45 })!;
  assert(profile.mouth[0] > frontal.mouth[0], "yaw must shift the mouth anchor");
  assertEquals(profile.mouth[1], frontal.mouth[1]);

  assertEquals(resolveMouthAnchorPoseAware({ bbox: null, landmark: null }), null);
});

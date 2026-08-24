import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateV500CoreContract,
  V500_FACE_SHARE_BAND,
  V500_FACE_SHARE_OBSERVED,
  V500_NOT_REQUIRED,
} from "./v500-core-contract.ts";
import {
  goldenFaceShare,
  goldenFaceSizePx,
  goldenMouthHeight,
  V500_GOLDEN_PASSES,
} from "./v500-golden-contract.ts";

Deno.test("V500-B1 — every golden pass is conform to the core contract", () => {
  for (const p of V500_GOLDEN_PASSES) {
    const res = evaluateV500CoreContract({
      faceShareInCrop: goldenFaceShare(p),
      faceSizePx: goldenFaceSizePx(p),
      anchor: p.anchor,
      cameraPathKeyframes: p.cameraPathKeyframes,
      mouthHeightInPreclip: goldenMouthHeight(p, 0.78),
      targetFaces: 1,
      dispatch: {
        model: p.dispatch.model,
        retryVariant: p.dispatch.retryVariant,
        asdMode: p.dispatch.asdMode,
        syncMode: p.dispatch.syncMode,
        inputSpace: p.dispatch.inputSpace,
        videoKind: p.dispatch.videoKind,
      },
    });
    assertEquals(res.violations, [], `pass ${p.idx}`);
    assert(res.conform);
  }
});

Deno.test("V500-B1 — static crop, face_center anchor and any mouth height are allowed", () => {
  const res = evaluateV500CoreContract({
    faceShareInCrop: 0.277,
    anchor: "face_center",
    cameraPathKeyframes: 1,
    mouthHeightInPreclip: 0.50,
    targetFaces: 1,
  });
  assertEquals(res.violations, []);
  assertEquals(V500_NOT_REQUIRED.mouthTargetHeight, false);
  assertEquals(V500_NOT_REQUIRED.dynamicCameraPath, false);
});

Deno.test("V500-B1 — S01 face_share sits inside the golden band", () => {
  const res = evaluateV500CoreContract({ faceShareInCrop: 0.277 });
  assertEquals(res.violations, []);
  assert(V500_FACE_SHARE_OBSERVED.min < 0.277 && 0.277 < V500_FACE_SHARE_OBSERVED.max);
});

Deno.test("V500-B1 — violations fire on the things that really mattered", () => {
  const res = evaluateV500CoreContract({
    faceShareInCrop: V500_FACE_SHARE_BAND.min - 0.05,
    faceSizePx: 100,
    targetFaces: 4,
    dispatch: { model: "sync-2", asdMode: "coords", syncMode: "loop" },
  });
  assertEquals(res.conform, false);
  assert(res.violations.some((v) => v.startsWith("face_share_below_band")));
  assert(res.violations.some((v) => v.startsWith("face_px_below_floor")));
  assert(res.violations.some((v) => v.startsWith("target_faces_not_one")));
  assert(res.violations.some((v) => v.startsWith("dispatch_model")));
  assert(res.violations.some((v) => v.startsWith("dispatch_asdMode")));
  assert(res.violations.some((v) => v.startsWith("dispatch_syncMode")));
});

/**
 * Deno sanity tests for the frozen lip-sync contract.
 *
 * These assertions duplicate the values on purpose. If someone edits
 * `lipsync-frozen-contract.ts`, this test fails and forces the change to be
 * a conscious decision instead of a side effect.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  INVARIANTS,
  LIPSYNC_CONTRACT_VERSION,
  PRECLIP,
  PROVIDER,
  REPROJECTION_MASK,
  WATCHDOG_MS,
} from "./lipsync-frozen-contract.ts";

Deno.test("contract version is v400", () => {
  assertEquals(LIPSYNC_CONTRACT_VERSION, "v400");
});

Deno.test("preclip geometry is frozen", () => {
  assertEquals(PRECLIP.targetFaceShare, 0.42);
  assertEquals(PRECLIP.minCropSizePx, 128);
  assertEquals(PRECLIP.minCropSizeDefaultPx, 96);
  assertEquals(PRECLIP.outputSizePx, 720);
  assertEquals(PRECLIP.nativeOutputMinPx, 720);
  assertEquals(PRECLIP.nativeOutputMaxPx, 1280);
  assertEquals(PRECLIP.legacyFallbackOutputPx, 512);
});

Deno.test("reprojection mask is frozen", () => {
  assertEquals(REPROJECTION_MASK.opaqueCorePct, 30);
  assertEquals(REPROJECTION_MASK.transparentEdgePct, 78);
  assertEquals(REPROJECTION_MASK.faceOverlayOuterFactor, 2.2);
  assertEquals(REPROJECTION_MASK.faceOverlayCoreFactor, 0.6);
});

Deno.test("watchdog timings are frozen", () => {
  assertEquals(WATCHDOG_MS.staleProvider, 600_000);
  assertEquals(WATCHDOG_MS.stalePreflight, 240_000);
  assertEquals(WATCHDOG_MS.staleHard, 1_500_000);
  assertEquals(WATCHDOG_MS.staleDispatchRecovery, 30_000);
  assertEquals(WATCHDOG_MS.staleAudioMux, 360_000);
  assertEquals(WATCHDOG_MS.recoveryCooldown, 90_000);
});

Deno.test("provider contract is frozen", () => {
  assertEquals(PROVIDER.apiBase, "https://api.sync.so/v2");
  assertEquals(PROVIDER.model, "sync-3");
  assertEquals(PROVIDER.syncMode, "cut_off");
  assertEquals(PROVIDER.asdAutoDetect, false);
  assertEquals(PROVIDER.concurrencyCap, 4);
});

Deno.test("invariants are frozen", () => {
  assertEquals(INVARIANTS.geometryAnchorField, "reference_image_url");
  assertEquals(INVARIANTS.runEntrypoint, "beginSceneRun");
  assertEquals(INVARIANTS.runGuardDiscardCode, "run_guard_discarded");
  assertEquals(INVARIANTS.slotOrdering, "row-major");
});

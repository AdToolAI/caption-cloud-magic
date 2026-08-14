/**
 * v431 / G1 — regression guard for the SceneCard lip-sync reset rollback.
 *
 * The bug this locks down: on a server error the scene object was rolled back
 * but the three pending markers stayed at their optimistic values, so the card
 * kept rendering "Lip-Sync aus / Engine auto" for the rest of the TTL window.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  captureLipSyncResetSnapshot,
  buildOptimisticLipSyncReset,
  applyOptimisticResetMarkers,
  restoreResetMarkersFromSnapshot,
  buildStaleResetPatch,
  applyResetMarkersFromServerRow,
} from "@/lib/video-composer/lipSyncResetFlow";
import {
  getLipSyncPending,
  getDialogModePending,
  getEngineOverridePending,
  clearLipSyncPending,
  clearDialogModePending,
  clearEngineOverridePending,
} from "@/lib/video-composer/lipSyncPending";

const SCENE_ID = "scene-reset-test";

const scene = {
  id: SCENE_ID,
  lipSyncStatus: "processing",
  lipSyncAppliedAt: "2026-08-14T10:00:00Z",
  lipSyncSourceClipUrl: "https://cdn/base.mp4",
  clipUrl: "https://cdn/lipsynced.mp4",
  processedVideoUrl: "https://cdn/lipsynced.mp4",
  baseVideoUrl: "https://cdn/base.mp4",
  twoshotStage: "muxing",
  dialogShots: [{ id: "a" }],
  lipSyncWithVoiceover: true,
  dialogMode: true,
  engineOverride: "cinematic-sync",
  clipError: null,
  replicatePredictionId: "pred-1",
};

describe("lip-sync reset rollback (v431 G1)", () => {
  beforeEach(() => {
    clearLipSyncPending(SCENE_ID);
    clearDialogModePending(SCENE_ID);
    clearEngineOverridePending(SCENE_ID);
  });

  it("optimistic patch turns lip-sync off and restores the base plate", () => {
    const patch = buildOptimisticLipSyncReset(scene, "lipsync_reset_by_user");
    expect(patch.lipSyncStatus).toBe("canceled");
    expect(patch.clipUrl).toBe(scene.baseVideoUrl);
    expect(patch.processedVideoUrl).toBeNull();
    expect(patch.lipSyncWithVoiceover).toBe(false);
    expect(patch.dialogMode).toBe(false);
    expect(patch.engineOverride).toBe("auto");
    expect(patch.dialogShots).toBeNull();
    expect(patch.twoshotStage).toBeNull();
    expect(patch.lipSyncAppliedAt).toBeNull();
    expect(patch.replicatePredictionId).toBeNull();
  });

  it("snapshot covers every field the optimistic patch mutates", () => {
    const snapshot = captureLipSyncResetSnapshot(scene);
    const patch = buildOptimisticLipSyncReset(scene, "lipsync_reset_by_user");
    for (const key of Object.keys(patch)) {
      expect(Object.prototype.hasOwnProperty.call(snapshot, key)).toBe(true);
    }
  });

  it("rollback restores scene fields AND the pending markers", () => {
    const snapshot = captureLipSyncResetSnapshot(scene);
    applyOptimisticResetMarkers(SCENE_ID);

    // Optimistic state as the presentation layer sees it.
    expect(getLipSyncPending(SCENE_ID)).toBe(false);
    expect(getDialogModePending(SCENE_ID)).toBe(false);
    expect(getEngineOverridePending(SCENE_ID)).toBe("auto");

    // Server failed → full rollback.
    restoreResetMarkersFromSnapshot(SCENE_ID, snapshot);

    expect(getLipSyncPending(SCENE_ID)).toBe(true);
    expect(getDialogModePending(SCENE_ID)).toBe(true);
    expect(getEngineOverridePending(SCENE_ID)).toBe("cinematic-sync");
    expect(snapshot.clipUrl).toBe(scene.clipUrl);
    expect(snapshot.processedVideoUrl).toBe(scene.processedVideoUrl);
    expect(snapshot.lipSyncStatus).toBe("processing");
  });

  it("rollback defaults a missing engineOverride to auto", () => {
    const snapshot = captureLipSyncResetSnapshot({ ...scene, engineOverride: undefined });
    restoreResetMarkersFromSnapshot(SCENE_ID, snapshot);
    expect(getEngineOverridePending(SCENE_ID)).toBe("auto");
  });

  it("stale_reset seeds scene + markers from the fresh server row, not the snapshot", () => {
    const snapshot = captureLipSyncResetSnapshot(scene);
    applyOptimisticResetMarkers(SCENE_ID);

    const serverRow = {
      lip_sync_status: "queued",
      lip_sync_applied_at: null,
      lip_sync_source_clip_url: "https://cdn/base-v2.mp4",
      clip_url: "https://cdn/base-v2.mp4",
      processed_video_url: null,
      twoshot_stage: "audio_prep",
      dialog_shots: [{ id: "b" }],
      lip_sync_with_voiceover: true,
      dialog_mode: true,
      engine_override: "auto",
      clip_error: null,
      replicate_prediction_id: null,
    };

    const patch = buildStaleResetPatch(serverRow);
    applyResetMarkersFromServerRow(SCENE_ID, serverRow);

    // Server truth, explicitly NOT the stale snapshot.
    expect(patch.clipUrl).toBe("https://cdn/base-v2.mp4");
    expect(patch.clipUrl).not.toBe(snapshot.clipUrl);
    expect(patch.twoshotStage).toBe("audio_prep");
    expect(getLipSyncPending(SCENE_ID)).toBe(true);
    expect(getDialogModePending(SCENE_ID)).toBe(true);
    // snapshot said "cinematic-sync" — the server row wins.
    expect(getEngineOverridePending(SCENE_ID)).toBe("auto");
  });
});

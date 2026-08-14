/**
 * v431 / G1 — shared client contract for the "cancel / fully reset lip-sync"
 * buttons in SceneCard.
 *
 * Both buttons do the same thing: optimistically flip the local scene into a
 * "lip-sync off, base plate restored" state, then call
 * `cancel-dialog-lipsync(reset: true)`.
 *
 * The subtle part is the failure path. Besides the scene fields we also write
 * three *pending markers* (lipSync / dialogMode / engineOverride). Those
 * markers override the scene value inside the presentation layer for a short
 * TTL, so rolling back only the scene object leaves the card stuck showing
 * "Lip-Sync aus / Engine auto" even though the DB and the scene object are
 * correct again. Every rollback must therefore restore the markers too.
 *
 * For `stale_reset` the server state is *newer* than the client snapshot, so
 * the old snapshot must not be re-asserted as truth: the caller refetches the
 * row and seeds both the scene fields and the markers from that fresh row.
 */

import {
  markLipSyncPending,
  markDialogModePending,
  markEngineOverridePending,
} from "@/lib/video-composer/lipSyncPending";

export interface LipSyncResetSnapshot {
  lipSyncStatus: unknown;
  lipSyncAppliedAt: unknown;
  lipSyncSourceClipUrl: unknown;
  clipUrl: unknown;
  processedVideoUrl: unknown;
  twoshotStage: unknown;
  dialogShots: unknown;
  lipSyncWithVoiceover: boolean;
  dialogMode: boolean;
  engineOverride: string | undefined;
  clipError: unknown;
  replicatePredictionId: unknown;
}

/** Server row shape (snake_case) used when recovering from `stale_reset`. */
export interface LipSyncResetServerRow {
  lip_sync_status?: unknown;
  lip_sync_applied_at?: unknown;
  lip_sync_source_clip_url?: unknown;
  clip_url?: unknown;
  processed_video_url?: unknown;
  twoshot_stage?: unknown;
  dialog_shots?: unknown;
  lip_sync_with_voiceover?: boolean | null;
  dialog_mode?: boolean | null;
  engine_override?: string | null;
  clip_error?: unknown;
  replicate_prediction_id?: unknown;
}

/** The exact set of columns the stale-reset refetch has to read. */
export const LIPSYNC_RESET_REFETCH_COLUMNS =
  "lip_sync_status,lip_sync_applied_at,lip_sync_source_clip_url,clip_url,processed_video_url,twoshot_stage,dialog_shots,lip_sync_with_voiceover,dialog_mode,engine_override,clip_error,replicate_prediction_id";

/** Snapshot of everything the optimistic update touches, for rollback. */
export function captureLipSyncResetSnapshot(scene: any): LipSyncResetSnapshot {
  return {
    lipSyncStatus: scene?.lipSyncStatus, // legacy-mapping-allowed: optimistic rollback snapshot
    lipSyncAppliedAt: scene?.lipSyncAppliedAt,
    lipSyncSourceClipUrl: scene?.lipSyncSourceClipUrl,
    clipUrl: scene?.clipUrl,
    processedVideoUrl: scene?.processedVideoUrl ?? null,
    twoshotStage: scene?.twoshotStage, // legacy-mapping-allowed: optimistic rollback snapshot
    dialogShots: scene?.dialogShots,
    lipSyncWithVoiceover: scene?.lipSyncWithVoiceover === true,
    dialogMode: scene?.dialogMode === true,
    engineOverride: scene?.engineOverride,
    clipError: scene?.clipError,
    replicatePredictionId: scene?.replicatePredictionId,
  };
}

/** The optimistic "lip-sync off, base plate restored" patch. */
export function buildOptimisticLipSyncReset(
  scene: any,
  clipError: "lipsync_reset_by_user" | "lipsync_canceled_by_user",
): Record<string, unknown> {
  return {
    lipSyncStatus: "canceled",
    lipSyncAppliedAt: null,
    lipSyncSourceClipUrl: null,
    clipUrl: scene?.baseVideoUrl ?? scene?.clipUrl,
    processedVideoUrl: null,
    twoshotStage: null,
    dialogShots: null,
    lipSyncWithVoiceover: false,
    dialogMode: false,
    engineOverride: "auto",
    clipError,
    replicatePredictionId: null,
  };
}

/** Markers matching the optimistic patch above. */
export function applyOptimisticResetMarkers(sceneId: string): void {
  markLipSyncPending(sceneId, false);
  markDialogModePending(sceneId, false);
  markEngineOverridePending(sceneId, "auto");
}

/**
 * Restore the pending markers from the pre-click snapshot. MUST run together
 * with the scene-object rollback, otherwise the presentation layer keeps
 * showing the optimistic "off" state for the rest of the TTL window.
 */
export function restoreResetMarkersFromSnapshot(
  sceneId: string,
  snapshot: LipSyncResetSnapshot,
): void {
  markLipSyncPending(sceneId, snapshot.lipSyncWithVoiceover === true);
  markDialogModePending(sceneId, snapshot.dialogMode === true);
  markEngineOverridePending(sceneId, snapshot.engineOverride ?? "auto");
}

/**
 * `stale_reset` recovery: the freshly loaded server row — not the stale local
 * snapshot — becomes the truth for both the scene fields and the markers.
 */
export function buildStaleResetPatch(row: LipSyncResetServerRow): Record<string, unknown> {
  return {
    lipSyncStatus: row.lip_sync_status ?? null,
    lipSyncAppliedAt: row.lip_sync_applied_at ?? null,
    lipSyncSourceClipUrl: row.lip_sync_source_clip_url ?? null,
    clipUrl: row.clip_url ?? null,
    processedVideoUrl: row.processed_video_url ?? null,
    twoshotStage: row.twoshot_stage ?? null,
    dialogShots: row.dialog_shots ?? null,
    lipSyncWithVoiceover: row.lip_sync_with_voiceover === true,
    dialogMode: row.dialog_mode === true,
    engineOverride: row.engine_override ?? "auto",
    clipError: row.clip_error ?? null,
    replicatePredictionId: row.replicate_prediction_id ?? null,
  };
}

export function applyResetMarkersFromServerRow(
  sceneId: string,
  row: LipSyncResetServerRow,
): void {
  markLipSyncPending(sceneId, row.lip_sync_with_voiceover === true);
  markDialogModePending(sceneId, row.dialog_mode === true);
  markEngineOverridePending(sceneId, row.engine_override ?? "auto");
}

/**
 * isRealizedScene — Single-source-of-truth guard for "this scene's master clip
 * is actually ready and not in a failed state". Used to gate ALL lip-sync /
 * audio-prep work (client + UI progress) so a failed master plate never kicks
 * off a phantom lip-sync run.
 *
 * Accepts both DB-snake_case (composer_scenes row) and app-camelCase
 * (ComposerScene type) — fields are read in both shapes.
 */
/**
 * Recovery/info markers written by server-side self-heal paths. These are NOT
 * terminal errors — they signal the pipeline transiently reset the scene and
 * expects the auto-trigger to pick it up on the next tick. Treating them as
 * hard failures deadlocks the scene on "Lip-Sync wird gestartet…".
 */
const RECOVERY_CLIP_ERROR_MARKERS: readonly string[] = [
  'audio_plan_not_ready_self_heal',
  'auto-reset: stale audio prep',
  'auto-reset: talking_head_master_invalid_for_cinematic_sync',
  'syncso_concurrency_deferred',
  'watchdog_stuck_lipsync_refunded',
];

function isRecoveryClipError(clipError: unknown): boolean {
  if (typeof clipError !== 'string' || clipError.length === 0) return false;
  return RECOVERY_CLIP_ERROR_MARKERS.some((m) => clipError.startsWith(m));
}

export function isRealizedScene(scene: any): boolean {
  if (!scene) return false;

  const clipStatus = scene.clip_status ?? scene.clipStatus ?? null;
  const clipUrl = scene.clip_url ?? scene.clipUrl ?? null;
  const clipError = scene.clip_error ?? scene.clipError ?? null;
  const twoshotStage = scene.twoshot_stage ?? scene.twoshotStage ?? null;
  const lipSyncStatus = scene.lip_sync_status ?? scene.lipSyncStatus ?? null;

  if (clipStatus !== 'ready') return false;
  if (typeof clipUrl !== 'string' || clipUrl.length === 0) return false;
  // Only block on hard failures — recovery/info markers are transient.
  if (clipError && !isRecoveryClipError(clipError)) return false;
  if (twoshotStage === 'failed' || twoshotStage === 'audio_mux_failed') return false;
  if (lipSyncStatus === 'failed' || lipSyncStatus === 'canceled') return false;

  return true;
}

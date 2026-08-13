/**
 * isRealizedScene — Single-source-of-truth guard for "this scene's master clip
 * is actually ready". Downstream audio/lip-sync failures do not invalidate or
 * hide a successfully rendered plate.
 *
 * v430 Step 5E — reads pipeline_state via sceneState() instead of clip_status.
 */
import { sceneState, isRealizedState } from './sceneState';

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

  const clipUrl = scene.clip_url ?? scene.clipUrl ?? null;
  const clipError = scene.clip_error ?? scene.clipError ?? null;

  if (typeof clipUrl !== 'string' || clipUrl.length === 0) return false;
  if (!isRealizedState(sceneState(scene))) return false;
  // Only block on hard failures — recovery/info markers are transient.
  if (clipError && !isRecoveryClipError(clipError)) return false;

  return true;
}

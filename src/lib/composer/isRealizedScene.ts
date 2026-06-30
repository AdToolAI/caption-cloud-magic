/**
 * isRealizedScene — Single-source-of-truth guard for "this scene's master clip
 * is actually ready and not in a failed state". Used to gate ALL lip-sync /
 * audio-prep work (client + UI progress) so a failed master plate never kicks
 * off a phantom lip-sync run.
 *
 * Accepts both DB-snake_case (composer_scenes row) and app-camelCase
 * (ComposerScene type) — fields are read in both shapes.
 */
export function isRealizedScene(scene: any): boolean {
  if (!scene) return false;

  const clipStatus = scene.clip_status ?? scene.clipStatus ?? null;
  const clipUrl = scene.clip_url ?? scene.clipUrl ?? null;
  const clipError = scene.clip_error ?? scene.clipError ?? null;
  const twoshotStage = scene.twoshot_stage ?? scene.twoshotStage ?? null;
  const lipSyncStatus = scene.lip_sync_status ?? scene.lipSyncStatus ?? null;

  if (clipStatus !== 'ready') return false;
  if (typeof clipUrl !== 'string' || clipUrl.length === 0) return false;
  if (clipError) return false;
  if (twoshotStage === 'failed' || twoshotStage === 'audio_mux_failed') return false;
  if (lipSyncStatus === 'failed' || lipSyncStatus === 'canceled') return false;

  return true;
}

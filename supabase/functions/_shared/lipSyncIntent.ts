// Server-side mirror of src/lib/video-composer/lipSyncIntent.ts
// Edge Functions cannot import from src/; keep this in sync.

const OPT_IN_ENGINES = new Set(['cinematic-sync', 'sync-segments', 'native-dialogue']);

export function isLipSyncIntentionalRow(row: any): boolean {
  if (!row) return false;
  if (row.lip_sync_with_voiceover === true) return true;
  if (row.dialog_mode === true) return true;
  return OPT_IN_ENGINES.has(String(row.engine_override ?? ''));
}

export function isLipSyncIntentionalPayload(scene: any): boolean {
  if (!scene) return false;
  if (scene.lipSyncWithVoiceover === true || scene.lip_sync_with_voiceover === true) return true;
  if (scene.dialogMode === true || scene.dialog_mode === true) return true;
  const eo = String(scene.engineOverride ?? scene.engine_override ?? '');
  return OPT_IN_ENGINES.has(eo);
}

/**
 * lipSyncIntent — Single Source of Truth for "does this Composer scene
 * actually want Sync.so lip-sync?".
 *
 * Rule: lip-sync only runs when the user explicitly opted in via one of:
 *   • the `Lip-Sync AN/AUS` toggle on the scene card (`lipSyncWithVoiceover`)
 *   • the dialog studio (`dialogMode`)
 *   • manually picking Cinematic-Sync / Sync-Segments / Native-Dialogue in
 *     the engine picker (`engineOverride`)
 *
 * NO implicit heuristic (dialog+cast+provider, etc.) may trigger lip-sync.
 * NEVER derive lip-sync intent from anything else — always call this helper.
 */

export interface LipSyncSceneCamel {
  lipSyncWithVoiceover?: boolean | null;
  engineOverride?: string | null;
  dialogMode?: boolean | null;
}

export interface LipSyncSceneSnake {
  lip_sync_with_voiceover?: boolean | null;
  engine_override?: string | null;
  dialog_mode?: boolean | null;
}

const OPT_IN_ENGINES = new Set(['cinematic-sync', 'sync-segments', 'native-dialogue']);

export function isLipSyncIntentional(scene: LipSyncSceneCamel | null | undefined): boolean {
  if (!scene) return false;
  if (scene.lipSyncWithVoiceover === true) return true;
  if (scene.dialogMode === true) return true;
  return OPT_IN_ENGINES.has(String(scene.engineOverride ?? ''));
}

export function isLipSyncIntentionalRow(row: LipSyncSceneSnake | null | undefined): boolean {
  if (!row) return false;
  if (row.lip_sync_with_voiceover === true) return true;
  if (row.dialog_mode === true) return true;
  return OPT_IN_ENGINES.has(String(row.engine_override ?? ''));
}

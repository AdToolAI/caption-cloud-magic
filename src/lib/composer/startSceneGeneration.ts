/**
 * startSceneGeneration — Adapter auf den Baseline-Pfad vom 27.07.2026.
 *
 * Der v377 "Single-Run-Vertrag" (`composer-start-scene-generation`) ist Teil
 * des Post-Juli-Umbaus und wurde beim chirurgischen Rollback stillgelegt. Die
 * Baseline startet einen Clip-Render genau so, wie es der Juli-Stand tat:
 * direkter Aufruf von `compose-video-clips`.
 *
 * Diese Datei bleibt bestehen, damit die bestehenden UI-Komponenten (ClipsTab,
 * SceneCard, SceneDialogStudio, AnchorPreviewGate, FaceMapReviewDialog,
 * SceneClipProgress) unverändert weiterlaufen — sie ist jetzt ein dünner
 * Adapter ohne eigene Run-Semantik.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SceneRunInfo {
  generation: number;
  run_id: string;
}

export interface StartSceneGenerationResult {
  runs: Record<string, SceneRunInfo>;
  /** Raw `compose-video-clips` response body. */
  compose: any;
}

export class SceneGenerationStartError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SceneGenerationStartError';
    this.code = code;
  }
}

function requireIds(sceneIds: string[]): string[] {
  const ids = sceneIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) {
    throw new SceneGenerationStartError(
      'no_persisted_scene',
      'Die Szene wurde noch nicht gespeichert.',
    );
  }
  return ids;
}

export async function startSceneGeneration(params: {
  sceneIds: string[];
  /** Body forwarded verbatim to `compose-video-clips`. */
  compose: Record<string, unknown>;
  reason?: string;
  useExistingRun?: boolean;
}): Promise<StartSceneGenerationResult> {
  requireIds(params.sceneIds);

  const { data, error } = await supabase.functions.invoke('compose-video-clips', {
    body: params.compose,
  });

  if (error) {
    throw new SceneGenerationStartError(
      'dispatch_failed',
      error.message || 'Der Render konnte nicht gestartet werden.',
    );
  }

  return { runs: {}, compose: data };
}

/**
 * Erste Etappe des früheren Split-Starts. Auf dem Baseline-Pfad gibt es keine
 * serverseitige Run-Akquise mehr — die Funktion bleibt als No-op erhalten,
 * damit "alle Clips generieren" unverändert aufrufbar ist.
 */
export async function prepareSceneRuns(params: {
  sceneIds: string[];
  reason?: string;
}): Promise<Record<string, SceneRunInfo>> {
  requireIds(params.sceneIds);
  return {};
}

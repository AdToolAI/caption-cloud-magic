/**
 * startSceneGeneration — v377 client entry point.
 *
 * There is exactly ONE way to start a paid clip render: the server function
 * `composer-start-scene-generation`. It acquires the scene run atomically
 * (generation bump + fresh run id under a row lock), tears the previous run
 * down, and only then dispatches `compose-video-clips`.
 *
 * Why the client may no longer do this in two steps: "reset, then render" as
 * two separate requests is a convention, and every call site that forgot it
 * silently kept the previous run alive. That is how a scene ended up with
 * three simultaneously open plate attempts under the same generation while the
 * lip-sync chain cut preclips from the previous day's plate.
 *
 * This function THROWS when the run could not be acquired or the old run could
 * not be invalidated. Callers must not fall back to dispatching directly.
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

function messageForCode(code: string, fallback?: string): string {
  switch (code) {
    case 'run_acquire_failed':
      return 'Der vorherige Lauf dieser Szene konnte nicht sauber beendet werden. Es wurde nichts gestartet und nichts berechnet.';
    case 'reset_failed':
      return 'Die alten Daten dieser Szene konnten nicht vollständig entfernt werden. Der neue Lauf wurde deshalb nicht gestartet.';
    case 'dispatch_failed':
      return 'Der Render konnte nicht gestartet werden. Die Szene wurde zurückgesetzt und kann erneut gestartet werden.';
    case 'forbidden':
      return 'Diese Szene gehört nicht zu deinem Projekt.';
    default:
      return fallback || 'Die Generierung konnte nicht gestartet werden.';
  }
}

async function callStart(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke(
    'composer-start-scene-generation',
    { body },
  );
  if (error) {
    throw new SceneGenerationStartError(
      'invoke_failed',
      error.message || messageForCode('invoke_failed'),
    );
  }
  if (!data || (data as any).ok !== true) {
    const code = String((data as any)?.error ?? 'unknown');
    throw new SceneGenerationStartError(
      code,
      messageForCode(code, (data as any)?.message),
    );
  }
  return data;
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
  /**
   * Set when the run was already acquired via `prepareSceneRuns()`. Skips the
   * reset and dispatches against the existing run.
   */
  useExistingRun?: boolean;
}): Promise<StartSceneGenerationResult> {
  const data = await callStart({
    scene_ids: requireIds(params.sceneIds),
    compose: params.compose,
    reason: params.reason ?? 'user_regenerate',
    use_existing_run: params.useExistingRun === true,
  });
  return {
    runs: (data.runs ?? {}) as Record<string, SceneRunInfo>,
    compose: data.compose,
  };
}

/**
 * First leg of the split start, for "alle Clips generieren".
 *
 * That flow renders fresh scene anchors between reset and dispatch, so the
 * purge must happen BEFORE the anchors exist — otherwise it deletes the very
 * anchors the new run needs. This acquires the run (generation bump + fresh
 * run id + full teardown) and returns; the caller must finish with
 * `startSceneGeneration({ useExistingRun: true })`.
 */
export async function prepareSceneRuns(params: {
  sceneIds: string[];
  reason?: string;
}): Promise<Record<string, SceneRunInfo>> {
  const data = await callStart({
    scene_ids: requireIds(params.sceneIds),
    prepare_only: true,
    reason: params.reason ?? 'user_regenerate_all',
  });
  return (data.runs ?? {}) as Record<string, SceneRunInfo>;
}


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

export async function startSceneGeneration(params: {
  sceneIds: string[];
  /** Body forwarded verbatim to `compose-video-clips`. */
  compose: Record<string, unknown>;
  reason?: string;
}): Promise<StartSceneGenerationResult> {
  const sceneIds = params.sceneIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (sceneIds.length === 0) {
    throw new SceneGenerationStartError(
      'no_persisted_scene',
      'Die Szene wurde noch nicht gespeichert.',
    );
  }

  const { data, error } = await supabase.functions.invoke(
    'composer-start-scene-generation',
    {
      body: {
        scene_ids: sceneIds,
        compose: params.compose,
        reason: params.reason ?? 'user_regenerate',
      },
    },
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

  return {
    runs: ((data as any).runs ?? {}) as Record<string, SceneRunInfo>,
    compose: (data as any).compose,
  };
}

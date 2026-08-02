/**
 * scene-run — v377 "Single-Run-Vertrag".
 *
 * v373–v376 modelled the "hard restart" contract correctly but anchored it in
 * the FRONTEND: every caller was expected to await `composer-hard-reset-scene`
 * before dispatching a render. A convention that each new call site can ignore
 * is not a guarantee — and it was ignored (the anchor-preview confirm path
 * dispatched straight into `compose-video-clips`, and `useSceneGenerate`
 * swallowed a failing reset and rendered anyway). Result, proven on scene
 * 6bf4e815… : three simultaneously OPEN plate attempts under generation 1 and
 * derived audio state from the previous day still in the pipeline.
 *
 * v377 moves the contract to where it cannot be bypassed:
 *   - `composer_start_scene_run()` (DB, SECURITY DEFINER) locks the scene row,
 *     bumps the generation and mints a fresh `active_run_id` in ONE
 *     transaction. The generation bump tombstones every open attempt through
 *     the existing `supersede_plate_attempts` trigger.
 *   - A partial unique index allows at most ONE open attempt per scene.
 *   - Every provider callback must prove `scene_id + generation + run_id`.
 *
 * Nothing else may start a paid render.
 */

type SupabaseLike = { rpc: (fn: string, args: Record<string, unknown>) => any };

export interface SceneRun {
  generation: number;
  runId: string;
  projectId: string;
}

/**
 * Atomically begins a new generation run for `sceneId`.
 *
 * Throws when the scene is gone or the lock/bump could not be committed —
 * the caller MUST treat that as "do not dispatch". A failed invalidation that
 * silently continues is exactly the defect this version removes.
 */
export async function startSceneRun(
  supabase: SupabaseLike,
  sceneId: string,
): Promise<SceneRun> {
  const { data, error } = await supabase.rpc("composer_start_scene_run", {
    _scene_id: sceneId,
  });
  if (error) {
    throw new Error(`start_run_failed:${(error as any).message ?? "unknown"}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.run_id || !row?.generation) {
    throw new Error("start_run_failed:empty_result");
  }
  return {
    generation: Number(row.generation),
    runId: String(row.run_id),
    projectId: String(row.project_id ?? ""),
  };
}

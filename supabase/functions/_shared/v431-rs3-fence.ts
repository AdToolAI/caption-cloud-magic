/**
 * v431 RS3 §6 — Pre-Reset-Fence für die Mux-/Stitch-Entry-Points.
 *
 * Existiert für die Szene ein aktueller RS3-Reset-Marker (`run_id` +
 * `plate_generation` passend) und gehört der Callback-Job nicht zu dieser
 * `reset_id`, dann ist der Callback ein `pre_reset_attempt`:
 * kein Fan-in, kein Mux-Dispatch, keine Scene-Mutation, keine Resurrection.
 *
 * Die Entscheidung liegt vollständig in `composer_rs3_fence_verdict` — dieser
 * Helper ist nur der Transport. Fail-open bei RPC-Fehlern: der Fence darf
 * niemals einen gesunden Lauf blockieren, wenn er selbst nicht antwortet.
 */
export interface Rs3FenceVerdict {
  fenced: boolean;
  reason: string;
  resetId?: string | null;
}

export async function rs3FenceVerdict(
  admin: any,
  sceneId: string | null | undefined,
  pipelineJobId: string | null | undefined,
): Promise<Rs3FenceVerdict> {
  if (!sceneId) return { fenced: false, reason: "no_scene" };
  try {
    const { data, error } = await admin.rpc("composer_rs3_fence_verdict", {
      _scene_id: sceneId,
      _pipeline_job_id: pipelineJobId ?? null,
    });
    if (error) {
      console.warn("[rs3-fence] verdict_failed", JSON.stringify({
        scene_id: sceneId,
        error: error.message,
      }));
      return { fenced: false, reason: "verdict_unavailable" };
    }
    const row: any = data ?? {};
    const verdict: Rs3FenceVerdict = {
      fenced: row?.fenced === true,
      reason: String(row?.reason ?? "unknown"),
      resetId: row?.reset_id ?? null,
    };
    if (verdict.fenced) {
      console.warn("[rs3-fence] pre_reset_attempt", JSON.stringify({
        scene_id: sceneId,
        pipeline_job_id: pipelineJobId ?? null,
        reason: verdict.reason,
        reset_id: verdict.resetId,
      }));
    }
    return verdict;
  } catch (e) {
    console.warn("[rs3-fence] verdict_threw", JSON.stringify({
      scene_id: sceneId,
      error: (e as Error).message,
    }));
    return { fenced: false, reason: "verdict_threw" };
  }
}

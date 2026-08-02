/**
 * v351 — Safe lip-sync reset helpers.
 *
 * Writing `dialog_shots: null` directly is destructive while Sync.so passes
 * are still in flight: the webhook resolves a job via
 * `dialog_shots.passes[].job_id`, so a wiped state makes it log
 * `no_scene_match` and the concurrency slot is never released. With 4 slots
 * total, a few of those leaks park every following dispatch on
 * `deferred / rate_limited` ("Wartet auf Sync.so-Slot… 4/3").
 *
 * Use `resetSceneLipSync()` instead: when active passes exist it routes
 * through the `reset-lipsync-scene` edge function, which cancels the
 * provider jobs, frees the slots and refunds credits before clearing state.
 */
import { supabase } from '@/integrations/supabase/client';

const ACTIVE_PASS_STATES = ['queued', 'rendering', 'retrying', 'pending', 'dispatched'];

export function hasActiveSyncPasses(dialogShots: unknown): boolean {
  const ds = (dialogShots ?? null) as any;
  if (!ds || typeof ds !== 'object') return false;
  if (typeof ds.sync_job_id === 'string' && ds.sync_job_id.length > 0) return true;
  const passes = Array.isArray(ds.passes) ? ds.passes : [];
  return passes.some(
    (p: any) =>
      typeof p?.job_id === 'string' &&
      p.job_id.length > 0 &&
      ACTIVE_PASS_STATES.includes(String(p?.status ?? '')),
  );
}

/**
 * Clear the lip-sync state of a scene without leaking Sync.so slots.
 * `extraUpdate` is applied to `composer_scenes` in both branches.
 */
export async function resetSceneLipSync(
  sceneId: string,
  dialogShots: unknown,
  extraUpdate: Record<string, unknown> = {},
): Promise<void> {
  if (hasActiveSyncPasses(dialogShots)) {
    try {
      await supabase.functions.invoke('reset-lipsync-scene', {
        body: { scene_id: sceneId },
      });
      if (Object.keys(extraUpdate).length > 0) {
        await supabase
          .from('composer_scenes')
          .update({ ...extraUpdate, updated_at: new Date().toISOString() })
          .eq('id', sceneId);
      }
      return;
    } catch (e) {
      console.warn('[lipsyncReset] reset-lipsync-scene failed, falling back to direct clear', e);
    }
  }

  await supabase
    .from('composer_scenes')
    .update({
      dialog_shots: null,
      ...extraUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sceneId);
}

/**
 * v373/v377 — standalone hard reset of a scene job.
 *
 * Cancels running provider jobs, frees slots, refunds credits, deletes every
 * artifact and bumps the generation.
 *
 * NOTE: this is NO LONGER the way to prepare a new render. Starting a render
 * goes through `startSceneGeneration()`, which performs reset and dispatch as
 * one server-side operation — "reset here, render there" was exactly the
 * bypassable convention that let stale runs survive. Use this function only to
 * abandon a scene without starting anything new.
 *
 * Returns a typed result; callers must NOT treat a failure as "continue".
 */
export interface HardResetResult {
  ok: boolean;
  generation: number | null;
  refundDecision: string | null;
  warnings: string[];
  error?: string;
}

export async function hardResetSceneJob(
  sceneId: string,
  reason = 'user_regenerate',
): Promise<HardResetResult> {
  if (!/^[0-9a-f-]{36}$/i.test(sceneId)) {
    return { ok: false, generation: null, refundDecision: null, warnings: [], error: 'invalid_scene_id' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('composer-hard-reset-scene', {
      body: { scene_id: sceneId, reason },
    });
    if (error) {
      console.warn('[lipsyncReset] hard reset failed', sceneId, error);
      return {
        ok: false,
        generation: null,
        refundDecision: null,
        warnings: [],
        error: error.message ?? 'invoke_failed',
      };
    }
    const d = (data ?? {}) as any;
    return {
      ok: d.ok === true,
      generation: typeof d.generation === 'number' ? d.generation : null,
      refundDecision: d.refund_decision ?? null,
      warnings: Array.isArray(d.warnings) ? d.warnings : [],
      error: d.ok === true ? undefined : String(d.error ?? 'reset_failed'),
    };
  } catch (e) {
    console.warn('[lipsyncReset] hard reset crash', sceneId, e);
    return {
      ok: false,
      generation: null,
      refundDecision: null,
      warnings: [],
      error: (e as Error).message,
    };
  }
}



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

/**
 * Phase 5.6 — Composer Undo-History Hook
 *
 * Lightweight wrapper around the `composer_undo_stack` table.
 * - `pushEntry()` records a "before" snapshot before a destructive action
 *   (delete scene, regenerate clip, reorder, prompt rewrite, …) so the user
 *   can Cmd+Z to revert it. Optional `creditsCharged` + `refundable` flags
 *   trigger a wallet refund on undo via the `composer-undo` edge function.
 * - `undoLast()` invokes the edge function and returns a toast-friendly
 *   summary. The dashboard re-fetches scenes from the DB after success.
 * - `useUndoCount()` (subscription-light polling) returns how many entries
 *   are stackable so a "↶ Undo (3)" badge can render.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ComposerUndoActionType =
  | 'delete-scene'
  | 'regenerate-clip'
  | 'reorder-scenes'
  | 'prompt-rewrite'
  | 'change-source'
  | 'apply-style'
  | 'fast-preview'
  | 'variant-grid'
  | 'custom';

export interface PushEntryParams {
  projectId: string;
  sceneId?: string | null;
  actionType: ComposerUndoActionType;
  label?: string;
  /** Snake-case row snapshot of the scene BEFORE the change. */
  beforeState?: Record<string, unknown> | null;
  /** Optional snake-case AFTER snapshot (for diagnostics). */
  afterState?: Record<string, unknown> | null;
  creditsCharged?: number;
  refundable?: boolean;
}

export function useComposerHistory(projectId: string | undefined) {
  const [count, setCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!projectId) {
      setCount(0);
      return;
    }
    const { count: c } = await supabase
      .from('composer_undo_stack')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);
    setCount(c ?? 0);
  }, [projectId]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const pushEntry = useCallback(async (params: PushEntryParams) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return;
      const { error } = await supabase.from('composer_undo_stack').insert([{
        project_id: params.projectId,
        scene_id: params.sceneId ?? undefined,
        user_id: userId,
        action_type: params.actionType,
        label: params.label ?? undefined,
        before_state: (params.beforeState ?? null) as never,
        after_state: (params.afterState ?? null) as never,
        credits_charged: params.creditsCharged ?? 0,
        refundable: params.refundable ?? false,
      }]);
      if (error) {
        console.warn('[useComposerHistory] push failed:', error);
        return;
      }
      refreshCount();
    } catch (err) {
      console.warn('[useComposerHistory] push exception:', err);
    }
  }, [refreshCount]);

  const undoLast = useCallback(async (onRestored?: () => void | Promise<void>) => {
    if (!projectId) return;
    if (count === 0) {
      toast({ title: 'Nichts zum Rückgängigmachen', description: 'Der Verlauf ist leer.' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('composer-undo', {
        body: { projectId },
      });
      if (error) throw error;
      if (data?.restored) {
        toast({
          title: '↶ Rückgängig',
          description: data.refunded > 0
            ? `${data.actionType} wiederhergestellt · ${data.refunded} Credits refundiert.`
            : `${data.actionType} wiederhergestellt.`,
        });
        await onRestored?.();
      } else {
        toast({ title: 'Nichts zum Rückgängigmachen', description: data?.reason ?? '' });
      }
      refreshCount();
    } catch (err) {
      toast({
        title: 'Undo fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [projectId, count, refreshCount]);

  return { pushEntry, undoLast, count, refreshCount };
}

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DriftCheckResult {
  driftScore: number;
  label: string;
  recommendation: 'ok' | 'soft-repair' | 'hard-repair';
}

export interface DriftHistoryEntry {
  id: string;
  project_id: string;
  anchor_scene_id: string | null;
  candidate_scene_id: string | null;
  anchor_image_url: string | null;
  candidate_image_url: string | null;
  drift_score: number | null;
  label: string | null;
  recommendation: string | null;
  repaired: boolean;
  repair_action: string | null;
  created_at: string;
}

/**
 * Runs the `detect-scene-drift` edge function for a single scene pair.
 * Persists the score on the candidate scene and (when projectId is given)
 * inserts a history row in composer_drift_checks.
 */
export function useContinuityDrift() {
  const [checkingPairId, setCheckingPairId] = useState<string | null>(null);

  const checkDrift = useCallback(
    async (params: {
      anchorImageUrl: string;
      candidateImageUrl: string;
      sceneId: string;
      anchorSceneId?: string;
      projectId?: string;
    }): Promise<DriftCheckResult | null> => {
      setCheckingPairId(params.sceneId);
      try {
        const { data, error } = await supabase.functions.invoke(
          'detect-scene-drift',
          { body: params }
        );
        if (error) throw error;
        if (typeof data?.driftScore !== 'number') {
          throw new Error('Kein gültiger Drift-Score');
        }
        return {
          driftScore: data.driftScore,
          label: data.label ?? '',
          recommendation: data.recommendation ?? 'ok',
        };
      } catch (err: any) {
        // Try to surface the actual edge-function error body for debugging
        let msg = err instanceof Error ? err.message : 'Drift-Check fehlgeschlagen';
        try {
          const ctx = err?.context;
          if (ctx?.body) {
            const text = typeof ctx.body === 'string' ? ctx.body : await ctx.text?.();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                if (parsed?.error) msg = `${msg} — ${parsed.error}`;
              } catch {
                msg = `${msg} — ${text.slice(0, 160)}`;
              }
            }
          }
        } catch {
          // ignore
        }
        console.error('[useContinuityDrift] error:', err);
        toast.error(msg);
        return null;
      } finally {
        setCheckingPairId(null);
      }
    },
    []
  );

  /** Batch-runs drift checks in parallel (capped concurrency). */
  const checkDriftBatch = useCallback(
    async (
      items: Array<{
        anchorImageUrl: string;
        candidateImageUrl: string;
        sceneId: string;
        anchorSceneId?: string;
        projectId?: string;
      }>,
      concurrency = 3
    ): Promise<Array<{ sceneId: string; result: DriftCheckResult | null }>> => {
      const out: Array<{ sceneId: string; result: DriftCheckResult | null }> = [];
      let i = 0;
      const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (i < items.length) {
          const idx = i++;
          const it = items[idx];
          try {
            const { data, error } = await supabase.functions.invoke(
              'detect-scene-drift',
              { body: it }
            );
            if (error) throw error;
            out.push({
              sceneId: it.sceneId,
              result: typeof data?.driftScore === 'number'
                ? {
                    driftScore: data.driftScore,
                    label: data.label ?? '',
                    recommendation: data.recommendation ?? 'ok',
                  }
                : null,
            });
          } catch (err) {
            console.error('[checkDriftBatch] item failed:', err);
            out.push({ sceneId: it.sceneId, result: null });
          }
        }
      });
      await Promise.all(workers);
      return out;
    },
    []
  );

  /** Loads the drift-check history for a project. */
  const fetchHistory = useCallback(
    async (projectId: string, limit = 50): Promise<DriftHistoryEntry[]> => {
      const { data, error } = await (supabase as any)
        .from('composer_drift_checks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('[fetchHistory] error:', error);
        return [];
      }
      return (data ?? []) as unknown as DriftHistoryEntry[];
    },
    []
  );

  /** Toggles continuity_locked + lock_reference_url on a composer scene. */
  const setSceneLock = useCallback(
    async (
      sceneId: string,
      locked: boolean,
      lockReferenceUrl?: string | null
    ): Promise<boolean> => {
      const payload: Record<string, unknown> = { continuity_locked: locked };
      if (locked) payload.lock_reference_url = lockReferenceUrl ?? null;
      else payload.lock_reference_url = null;
      const { error } = await (supabase as any)
        .from('composer_scenes')
        .update(payload)
        .eq('id', sceneId);
      if (error) {
        toast.error('Lock konnte nicht gespeichert werden');
        console.error('[setSceneLock] error:', error);
        return false;
      }
      return true;
    },
    []
  );

  return { checkDrift, checkDriftBatch, fetchHistory, setSceneLock, checkingPairId };
}

export function driftSeverity(score: number | null | undefined): {
  level: 'ok' | 'minor' | 'warn' | 'broken';
  color: string;
  bg: string;
  label: string;
} {
  if (score == null)
    return { level: 'ok', color: 'text-muted-foreground', bg: 'bg-muted/40', label: '—' };
  // New, more forgiving rubric — only flags actual continuity breaks, not
  // intentional cuts between different shots/subjects.
  if (score <= 25)
    return {
      level: 'ok',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      label: 'Konsistent',
    };
  if (score <= 55)
    return {
      level: 'minor',
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/30',
      label: 'Akzeptabel',
    };
  if (score <= 75)
    return {
      level: 'warn',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      label: 'Drift',
    };
  return {
    level: 'broken',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    label: 'Bruch',
  };
}

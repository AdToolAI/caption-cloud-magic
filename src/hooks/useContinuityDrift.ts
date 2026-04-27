import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DriftCheckResult {
  driftScore: number;
  label: string;
  recommendation: 'ok' | 'soft-repair' | 'hard-repair';
}

/**
 * Runs the `detect-scene-drift` edge function for a single scene pair.
 * Persists the score to composer_scenes.continuity_drift_score on the
 * "next" (candidate) scene.
 */
export function useContinuityDrift() {
  const [checkingPairId, setCheckingPairId] = useState<string | null>(null);

  const checkDrift = useCallback(
    async (params: {
      anchorImageUrl: string;
      candidateImageUrl: string;
      sceneId: string;
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Drift-Check fehlgeschlagen';
        console.error('[useContinuityDrift] error:', err);
        toast.error(msg);
        return null;
      } finally {
        setCheckingPairId(null);
      }
    },
    []
  );

  return { checkDrift, checkingPairId };
}

export function driftSeverity(score: number | null | undefined): {
  level: 'ok' | 'minor' | 'warn' | 'broken';
  color: string;
  bg: string;
  label: string;
} {
  if (score == null)
    return { level: 'ok', color: 'text-muted-foreground', bg: 'bg-muted/40', label: '—' };
  if (score <= 15)
    return {
      level: 'ok',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      label: 'Konsistent',
    };
  if (score <= 35)
    return {
      level: 'minor',
      color: 'text-sky-400',
      bg: 'bg-sky-500/10 border-sky-500/30',
      label: 'Akzeptabel',
    };
  if (score <= 65)
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

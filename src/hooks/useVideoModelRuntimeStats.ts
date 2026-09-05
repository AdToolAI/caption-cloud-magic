import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ModelRuntimeStat {
  model: string;
  sample_size: number;
  p50_seconds: number;
  p90_seconds: number;
}

/**
 * Median/P90 runtime per video model, measured from our own completed runs.
 * Never hardcoded marketing values — models without enough samples simply
 * return nothing, and the UI then shows only the elapsed time.
 */
export function useVideoModelRuntimeStats() {
  return useQuery({
    queryKey: ['video-model-runtime-stats'],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ModelRuntimeStat>> => {
      const { data, error } = await (supabase as any).rpc('video_model_runtime_stats');
      if (error || !data) return {};
      const map: Record<string, ModelRuntimeStat> = {};
      for (const row of data as ModelRuntimeStat[]) map[row.model] = row;
      return map;
    },
  });
}

/** "~4 min" / "~45 sec" — rounded, language-neutral numeric part. */
export function formatRuntimeEstimate(seconds: number): string {
  if (seconds < 90) return `~${Math.max(5, Math.round(seconds / 5) * 5)} sec`;
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

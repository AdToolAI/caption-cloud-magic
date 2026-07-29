/**
 * Live view of a running autopilot production.
 *
 * Polling instead of realtime: the run is minutes long, a 4s poll is cheap and
 * survives tab sleep/wake without socket reconnection edge cases.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProductionRow {
  id: string;
  stage: string;
  status: string;
  progress: number;
  final_video_url: string | null;
  error_message: string | null;
  spent_credits: number | null;
  refunded_credits: number | null;
}

export interface ProductionSceneRow {
  id: string;
  scene_index: number;
  beat: string;
  duration_seconds: number;
  status: string;
  anchor_url: string | null;
  anchor_score: number | null;
  anchor_attempts: number;
  video_url: string | null;
  lipsync_url: string | null;
  voiceover_url: string | null;
  error_message: string | null;
  /** v297: Anzahl der Produktionsanläufe für diese Szene (1 oder 2). */
  attempt: number | null;
  /** v297: 'still', wenn die Szene als Standbild gerettet wurde. */
  fallback_kind: string | null;
}


export interface DirectorLogRow {
  id: string;
  stage: string;
  role: string;
  severity: string;
  message: string;
  scene_index: number | null;
  created_at: string;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function useAutopilotProduction(productionId: string | null, enabled: boolean) {
  const [production, setProduction] = useState<ProductionRow | null>(null);
  const [scenes, setScenes] = useState<ProductionSceneRow[]>([]);
  const [log, setLog] = useState<DirectorLogRow[]>([]);
  const timer = useRef<number | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!productionId) return null;

    const [prod, sceneRows, logRows] = await Promise.all([
      supabase
        .from('autopilot_productions')
        .select('id, stage, status, progress, final_video_url, error_message, spent_credits, refunded_credits')
        .eq('id', productionId)
        .maybeSingle(),
      supabase
        .from('autopilot_production_scenes')
        .select(
          'id, scene_index, beat, duration_seconds, status, anchor_url, anchor_score, anchor_attempts, video_url, lipsync_url, voiceover_url, error_message',
        )
        .eq('production_id', productionId)
        .order('scene_index', { ascending: true }),
      supabase
        .from('autopilot_director_log')
        .select('id, stage, role, severity, message, scene_index, created_at')
        .eq('production_id', productionId)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    if (prod.data) setProduction(prod.data as ProductionRow);
    if (sceneRows.data) setScenes(sceneRows.data as ProductionSceneRow[]);
    if (logRows.data) setLog(logRows.data as DirectorLogRow[]);

    return (prod.data as ProductionRow | null) ?? null;
  }, [productionId]);

  useEffect(() => {
    if (!productionId || !enabled) return;

    let cancelled = false;

    const tick = async () => {
      const row = await fetchOnce();
      if (cancelled) return;
      if (row && TERMINAL.has(row.status)) return;
      timer.current = window.setTimeout(tick, 4000);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [productionId, enabled, fetchOnce]);

  const isRunning = production ? !TERMINAL.has(production.status) : false;

  return { production, scenes, log, isRunning, refresh: fetchOnce };
}

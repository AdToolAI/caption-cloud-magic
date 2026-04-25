// Compare Lab — React Hook for fan-out + polling + judge orchestration
//
// Manages a single compare run: triggers compare-lab-generate, polls
// compare_lab_outputs via realtime + interval fallback, and exposes
// a callJudge() helper to invoke compare-lab-judge once all outputs
// are completed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CompareEngine = 'sora' | 'kling' | 'seedance' | 'wan' | 'hailuo' | 'luma';

export interface CompareLabOutput {
  id: string;
  run_id: string;
  engine: CompareEngine;
  model: string;
  generation_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  video_url: string | null;
  thumbnail_url: string | null;
  cost_euros: number;
  duration_seconds: number | null;
  error_message: string | null;
  user_rating: number | null;
  user_note: string | null;
  is_user_winner: boolean;
  is_ai_pick: boolean;
  ai_judge_score: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface CompareLabRun {
  id: string;
  prompt: string;
  engines: CompareEngine[];
  duration_seconds: number;
  aspect_ratio: string;
  status: string;
  total_cost_euros: number;
  currency: string;
  ai_judge_winner_engine: string | null;
  ai_judge_reasoning: string | null;
  ai_judge_scores: unknown;
  user_winner_engine: string | null;
  created_at: string;
  completed_at: string | null;
}

interface StartArgs {
  prompt: string;
  engines: CompareEngine[];
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  sourceImageUrl?: string;
  composerSceneId?: string;
}

export function useCompareLab() {
  const [run, setRun] = useState<CompareLabRun | null>(null);
  const [outputs, setOutputs] = useState<CompareLabOutput[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isJudging, setIsJudging] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const refreshOutputs = useCallback(async (runId: string) => {
    const { data: outs } = await supabase
      .from('compare_lab_outputs')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (outs) setOutputs(outs as unknown as CompareLabOutput[]);

    // Also re-fetch the run row to pick up generation_id linkages
    const { data: latestRun } = await supabase
      .from('compare_lab_runs')
      .select('*')
      .eq('id', runId)
      .single();
    if (latestRun) setRun(latestRun as unknown as CompareLabRun);
  }, []);

  // Sync output status with ai_video_generations table (most engines update there async)
  const syncFromGenerations = useCallback(async (runId: string) => {
    const { data: outs } = await supabase
      .from('compare_lab_outputs')
      .select('id, generation_id, status, video_url')
      .eq('run_id', runId);
    if (!outs) return;

    for (const o of outs) {
      if (!o.generation_id) continue;
      if (o.status === 'completed' || o.status === 'failed') continue;

      const { data: gen } = await supabase
        .from('ai_video_generations')
        .select('status, video_url, thumbnail_url, error_message')
        .eq('id', o.generation_id)
        .single();

      if (gen && (gen.status === 'completed' || gen.status === 'failed')) {
        await supabase
          .from('compare_lab_outputs')
          .update({
            status: gen.status,
            video_url: gen.video_url,
            thumbnail_url: gen.thumbnail_url,
            error_message: gen.error_message,
            completed_at: new Date().toISOString(),
          })
          .eq('id', o.id);
      }
    }
    await refreshOutputs(runId);
  }, [refreshOutputs]);

  const subscribe = useCallback((runId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`compare-lab-${runId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'compare_lab_outputs', filter: `run_id=eq.${runId}` },
        () => refreshOutputs(runId)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'compare_lab_runs', filter: `id=eq.${runId}` },
        () => refreshOutputs(runId)
      )
      .subscribe();

    channelRef.current = channel;

    // Polling fallback every 6s for ai_video_generations sync
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => syncFromGenerations(runId), 6000);
  }, [refreshOutputs, syncFromGenerations]);

  const start = useCallback(async (args: StartArgs) => {
    setIsStarting(true);
    setOutputs([]);
    setRun(null);
    try {
      const { data, error } = await supabase.functions.invoke('compare-lab-generate', {
        body: {
          prompt: args.prompt,
          engines: args.engines,
          durationSeconds: args.durationSeconds ?? 5,
          aspectRatio: args.aspectRatio ?? '16:9',
          sourceImageUrl: args.sourceImageUrl,
          composerSceneId: args.composerSceneId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const runId: string = data.runId;
      await refreshOutputs(runId);
      subscribe(runId);
      toast.success(`Compare Lab gestartet — ${args.engines.length} Engines parallel`);
      return runId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast.error(`Start fehlgeschlagen: ${msg}`);
      throw err;
    } finally {
      setIsStarting(false);
    }
  }, [refreshOutputs, subscribe]);

  const loadRun = useCallback(async (runId: string) => {
    await refreshOutputs(runId);
    subscribe(runId);
  }, [refreshOutputs, subscribe]);

  const callJudge = useCallback(async (runId: string) => {
    setIsJudging(true);
    try {
      const { data, error } = await supabase.functions.invoke('compare-lab-judge', {
        body: { runId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`AI-Judge: ${data.winnerEngine} gewinnt`);
      await refreshOutputs(runId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`AI-Judge fehlgeschlagen: ${msg}`);
    } finally {
      setIsJudging(false);
    }
  }, [refreshOutputs]);

  const setUserWinner = useCallback(async (runId: string, engine: string) => {
    await supabase
      .from('compare_lab_outputs')
      .update({ is_user_winner: false })
      .eq('run_id', runId);
    await supabase
      .from('compare_lab_outputs')
      .update({ is_user_winner: true })
      .eq('run_id', runId)
      .eq('engine', engine);
    await supabase
      .from('compare_lab_runs')
      .update({ user_winner_engine: engine })
      .eq('id', runId);
    await refreshOutputs(runId);
    toast.success(`Winner: ${engine}`);
  }, [refreshOutputs]);

  const rateOutput = useCallback(async (outputId: string, rating: number, note?: string) => {
    await supabase
      .from('compare_lab_outputs')
      .update({ user_rating: rating, user_note: note ?? null })
      .eq('id', outputId);
    if (run) await refreshOutputs(run.id);
  }, [run, refreshOutputs]);

  const allCompleted = outputs.length > 0 && outputs.every((o) => o.status === 'completed' || o.status === 'failed');
  const completedCount = outputs.filter((o) => o.status === 'completed').length;

  return {
    run,
    outputs,
    isStarting,
    isJudging,
    allCompleted,
    completedCount,
    start,
    loadRun,
    callJudge,
    setUserWinner,
    rateOutput,
  };
}

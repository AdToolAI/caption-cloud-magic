/**
 * useRenderQueueJob — subscribe to a single render_queue row.
 *
 * Returns real-time status/position/ETA for a given job. Founders are marked
 * with `isFounder=true` so the UI can badge them "Priority".
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RenderQueueJobLive {
  id: string;
  status: 'queued' | 'processing' | 'rendering' | 'completed' | 'failed' | 'cancelled' | string;
  priority: number;
  isFounder: boolean;
  estimatedWorkers: number;
  position: number | null;   // 1 = next, 0 = currently running
  etaSeconds: number | null;
  errorMessage: string | null;
  outputUrl: string | null;
  createdAt: string;
  startedAt: string | null;
}

const AVG_RENDER_SECONDS = 90;

async function fetchJob(jobId: string): Promise<RenderQueueJobLive | null> {
  const { data: job } = await supabase
    .from('render_queue')
    .select('id,status,priority,is_founder,estimated_workers,estimated_duration_sec,created_at,started_at,error_message,output_url')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return null;

  let position: number | null = null;
  let etaSeconds: number | null = null;

  if (job.status === 'queued') {
    const { count } = await supabase
      .from('render_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .or(`priority.lt.${job.priority},and(priority.eq.${job.priority},created_at.lt.${job.created_at})`);
    position = (count ?? 0) + 1;
    etaSeconds = position * (job.estimated_duration_sec || AVG_RENDER_SECONDS);
  } else if (job.status === 'processing' || job.status === 'rendering') {
    position = 0;
    etaSeconds = job.estimated_duration_sec || AVG_RENDER_SECONDS;
  }

  return {
    id: job.id,
    status: job.status,
    priority: job.priority ?? 5,
    isFounder: !!job.is_founder,
    estimatedWorkers: job.estimated_workers ?? 5,
    position,
    etaSeconds,
    errorMessage: job.error_message ?? null,
    outputUrl: job.output_url ?? null,
    createdAt: job.created_at,
    startedAt: job.started_at ?? null,
  };
}

export function useRenderQueueJob(jobId: string | null | undefined) {
  const [job, setJob] = useState<RenderQueueJobLive | null>(null);
  const [loading, setLoading] = useState(!!jobId);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const refresh = () => {
      fetchJob(jobId)
        .then((j) => { if (!cancelled) { setJob(j); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    };

    refresh();

    // Realtime: watch this row + poll every 5s as fallback (queue positions
    // change when *other* users' jobs move — realtime alone would miss those).
    const channel = supabase
      .channel(`render_queue_job_${jobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'render_queue', filter: `id=eq.${jobId}` },
        () => refresh(),
      )
      .subscribe();

    const poll = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [jobId]);

  return { job, loading };
}

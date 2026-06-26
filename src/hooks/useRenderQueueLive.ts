/**
 * useRenderQueueLive — lightweight live feed of in-flight render jobs.
 * Polls `composer_scenes` filtered by clip_status (RLS scopes to the
 * current user via `owns_composer_project`). Used by `/queue`.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type QueueStatus =
  | 'pending'
  | 'queued'
  | 'generating'
  | 'composing'
  | 'lipsync'
  | 'failed'
  | 'completed';

export interface QueueRow {
  id: string;
  project_id: string;
  scene_type: string;
  clip_source: string | null;
  clip_status: string;
  duration_seconds: number | null;
  clip_url: string | null;
  updated_at: string;
  created_at: string;
  project_name?: string | null;
}

const LIVE_STATUSES = ['pending', 'queued', 'generating', 'composing', 'lipsync'];

export function useRenderQueueLive(pollMs = 5000) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [recent, setRecent] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    const [live, done] = await Promise.all([
      supabase
        .from('composer_scenes')
        .select('id, project_id, scene_type, clip_source, clip_status, duration_seconds, clip_url, updated_at, created_at')
        .in('clip_status', LIVE_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('composer_scenes')
        .select('id, project_id, scene_type, clip_source, clip_status, duration_seconds, clip_url, updated_at, created_at')
        .in('clip_status', ['completed', 'failed'])
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);

    if (!live.error) setRows((live.data as QueueRow[]) ?? []);
    if (!done.error) setRecent((done.data as QueueRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
    const id = setInterval(fetchRows, pollMs);
    return () => clearInterval(id);
  }, [fetchRows, pollMs]);

  return { rows, recent, loading, refresh: fetchRows };
}

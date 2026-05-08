import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SceneAudioClip } from '@/components/video-composer/SoundDesignPanel';

const RELOAD_EVENT = 'composer:scene-audio-clips-changed';

export function emitSceneAudioClipsChanged(projectId?: string | null) {
  try {
    window.dispatchEvent(new CustomEvent(RELOAD_EVENT, { detail: { projectId } }));
  } catch { /* noop */ }
}

/** Loads ambient/sfx/foley clips for a composer project. Re-loads on
 *  the `composer:scene-audio-clips-changed` event AND via a Realtime
 *  subscription on `scene_audio_clips` filtered by project_id. */
export function useSceneAudioClips(projectId?: string | null) {
  const [clips, setClips] = useState<SceneAudioClip[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      console.info('[useSceneAudioClips] no projectId — skip load');
      setClips([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('scene_audio_clips')
      .select('*')
      .eq('project_id', projectId)
      .in('kind', ['ambient', 'sfx', 'foley', 'voiceover'])
      .order('created_at', { ascending: true });
    if (error) console.error('[useSceneAudioClips] load error', error);
    const rows = (data as SceneAudioClip[]) || [];
    console.info(`[useSceneAudioClips] projectId=${projectId} loaded N=${rows.length}`);
    setClips(rows);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.projectId || detail.projectId === projectId) load();
    };
    window.addEventListener(RELOAD_EVENT, handler);
    return () => window.removeEventListener(RELOAD_EVENT, handler);
  }, [projectId, load]);

  // Realtime subscription so external inserts (e.g. another tab running the
  // sound-design pipeline) propagate into the preview without manual refresh.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`scene_audio_clips:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scene_audio_clips', filter: `project_id=eq.${projectId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, load]);

  return { clips, loading, reload: load };
}

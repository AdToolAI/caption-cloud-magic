import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SceneAudioClip } from '@/components/video-composer/SoundDesignPanel';

const RELOAD_EVENT = 'composer:scene-audio-clips-changed';

export function emitSceneAudioClipsChanged(projectId?: string | null) {
  try {
    window.dispatchEvent(new CustomEvent(RELOAD_EVENT, { detail: { projectId } }));
  } catch { /* noop */ }
}

/** Loads ambient/sfx/foley clips for a composer project and re-loads on
 *  the `composer:scene-audio-clips-changed` event (fired by SoundDesignPanel). */
export function useSceneAudioClips(projectId?: string | null) {
  const [clips, setClips] = useState<SceneAudioClip[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setClips([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('scene_audio_clips')
      .select('*')
      .eq('project_id', projectId)
      .in('kind', ['ambient', 'sfx', 'foley'])
      .order('created_at', { ascending: true });
    if (error) console.error('[useSceneAudioClips] load', error);
    setClips((data as SceneAudioClip[]) || []);
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

  return { clips, loading, reload: load };
}

import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SceneAudioClip } from '@/components/video-composer/SoundDesignPanel';
import type { ComposerScene } from '@/types/video-composer';

const RELOAD_EVENT = 'composer:scene-audio-clips-changed';

export function emitSceneAudioClipsChanged(projectId?: string | null) {
  try {
    window.dispatchEvent(new CustomEvent(RELOAD_EVENT, { detail: { projectId } }));
  } catch { /* noop */ }
}

/**
 * Builds virtual `SceneAudioClip` rows from a scene's locked `audioPlan` for
 * any speaker that has an `audioUrl` set. Used as a Source-of-Truth bridge so
 * the preview / Assembly tab can play the just-generated voiceover BEFORE the
 * `scene_audio_clips` DB insert has propagated through Realtime.
 *
 * Existing DB rows take precedence (matched by `url`) so we never double-play.
 */
function synthesizeAudioPlanClips(
  scenes: ComposerScene[] | undefined,
  existing: SceneAudioClip[],
): SceneAudioClip[] {
  if (!scenes?.length) return [];
  const seenUrls = new Set(existing.map((c) => c.url));
  const virtual: SceneAudioClip[] = [];
  let sceneStart = 0;
  for (const scene of scenes) {
    const plan = scene.audioPlan;
    if (plan?.speakers?.length) {
      for (let i = 0; i < plan.speakers.length; i++) {
        const sp = plan.speakers[i];
        if (!sp.audioUrl || seenUrls.has(sp.audioUrl)) continue;
        seenUrls.add(sp.audioUrl);
        virtual.push({
          id: `virtual:${scene.id}:${i}`,
          user_id: '',
          project_id: null,
          scene_id: scene.id,
          kind: 'voiceover',
          source: 'ai',
          prompt: sp.text ?? null,
          url: sp.audioUrl,
          start_offset: sceneStart + (sp.startSec ?? 0),
          duration: Math.max(0, (sp.endSec ?? 0) - (sp.startSec ?? 0)),
          volume: 1,
          ducking_enabled: true,
          cost_credits: 0,
          created_at: new Date().toISOString(),
        });
      }
    }
    sceneStart += scene.durationSeconds || 0;
  }
  return virtual;
}

/** Loads ambient/sfx/foley/voiceover clips for a composer project. Re-loads on
 *  the `composer:scene-audio-clips-changed` event AND via a Realtime
 *  subscription on `scene_audio_clips` filtered by project_id.
 *
 *  Pass `scenes` to additionally synthesize virtual voiceover clips from any
 *  scene that has a locked `audioPlan` whose audioUrl hasn't yet appeared in
 *  the `scene_audio_clips` table — eliminates the "sound briefly missing
 *  after VO generation" race. */
export function useSceneAudioClips(
  projectId?: string | null,
  scenes?: ComposerScene[],
) {
  const [dbClips, setDbClips] = useState<SceneAudioClip[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setDbClips([]);
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
    setDbClips((data as SceneAudioClip[]) || []);
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

  // Merge DB rows with virtual clips synthesized from locked audio plans.
  // The audio plan is the deterministic source-of-truth for timing; DB rows
  // are the persisted mirror. As soon as Realtime catches up, the virtual
  // entry gets deduped via its URL (see `synthesizeAudioPlanClips`).
  const clips = useMemo(() => {
    const virtual = synthesizeAudioPlanClips(scenes, dbClips);
    if (!virtual.length) return dbClips;
    return [...dbClips, ...virtual];
  }, [dbClips, scenes]);

  return { clips, loading, reload: load };
}

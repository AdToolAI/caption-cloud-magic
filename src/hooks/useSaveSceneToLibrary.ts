import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { ComposerScene } from '@/types/video-composer';

const STORAGE_KEY = 'composer:savedSceneIds';

function loadSaved(): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistSaved(ids: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* noop */
  }
}

/**
 * Save a single Motion Studio scene clip to the user's media library
 * (`video_creations` table). Idempotent — repeated calls return the existing entry.
 */
export function useSaveSceneToLibrary() {
  const [savingSceneId, setSavingSceneId] = useState<string | null>(null);
  const [savedSceneIds, setSavedSceneIds] = useState<Set<string>>(() => loadSaved());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    persistSaved(savedSceneIds);
  }, [savedSceneIds]);

  const save = useCallback(
    async (scene: ComposerScene, projectId?: string): Promise<boolean> => {
      if (!scene.clipUrl) {
        toast({
          title: 'Kein Clip vorhanden',
          description: 'Diese Szene hat noch kein gerendertes Video.',
          variant: 'destructive',
        });
        return false;
      }
      setSavingSceneId(scene.id);
      try {
        const { data, error } = await supabase.functions.invoke('save-composer-scene-to-library', {
          body: {
            project_id: projectId,
            scene_id: scene.id,
            clip_url: scene.clipUrl,
            prompt: scene.aiPrompt,
            duration_seconds: scene.durationSeconds,
            clip_source: scene.clipSource,
            clip_quality: scene.clipQuality,
          },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Speichern fehlgeschlagen');

        setSavedSceneIds((prev) => {
          const next = new Set(prev);
          next.add(scene.id);
          return next;
        });

        queryClient.invalidateQueries({ queryKey: ['video-creations'] });
        queryClient.invalidateQueries({ queryKey: ['video-history'] });
        queryClient.invalidateQueries({ queryKey: ['media-library'] });

        toast({
          title: data.already ? 'Bereits in Mediathek' : 'In Mediathek gespeichert',
          description: 'Die Szene ist jetzt als eigenständiger Clip verfügbar.',
        });
        return true;
      } catch (e) {
        console.error('[useSaveSceneToLibrary] error', e);
        toast({
          title: 'Speichern fehlgeschlagen',
          description: e instanceof Error ? e.message : 'Unbekannter Fehler',
          variant: 'destructive',
        });
        return false;
      } finally {
        setSavingSceneId(null);
      }
    },
    [toast, queryClient]
  );

  return { save, savingSceneId, savedSceneIds };
}

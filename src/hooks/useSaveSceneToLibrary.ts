import { tx } from "@/lib/i18nText";
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
          description: tx({ de: 'Diese Szene hat noch kein gerendertes Video.', en: 'This scene does not have a rendered video yet.', es: 'Esta escena aún no tiene un video renderizado.' }),
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
        if (!data?.ok) throw new Error(data?.error || tx({ de: 'Speichern fehlgeschlagen', en: 'Save failed', es: 'Guardado fallido' }));

        setSavedSceneIds((prev) => {
          const next = new Set(prev);
          next.add(scene.id);
          return next;
        });

        queryClient.invalidateQueries({ queryKey: ['video-creations'] });
        queryClient.invalidateQueries({ queryKey: ['video-history'] });
        queryClient.invalidateQueries({ queryKey: ['media-library'] });

        toast({
          title: data.already ? tx({ de: 'Bereits in Mediathek', en: 'Already in library', es: 'Ya está en la biblioteca' }) : tx({ de: 'In Mediathek gespeichert', en: 'Saved to library', es: 'Guardado en la biblioteca' }),
          description: tx({ de: 'Die Szene ist jetzt als eigenständiger Clip verfügbar.', en: 'The scene is now available as a standalone clip.', es: 'La escena ya está disponible como un clip independiente.' }),
        });
        return true;
      } catch (e) {
        console.error('[useSaveSceneToLibrary] error', e);
        toast({
          title: tx({ de: 'Speichern fehlgeschlagen', en: 'Save failed', es: 'Guardado fallido' }),
          description: e instanceof Error ? e.message : tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' }),
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

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractResult {
  lastFrameUrl: string;
}

/**
 * Hook für Frame-to-Shot Continuity (Client-Side):
 * Extrahiert per offscreen <video> + <canvas> einen Frame aus dem Clip,
 * lädt ihn in den `composer-frames` Storage-Bucket hoch und gibt eine
 * öffentliche URL zurück, die als Reference-Image für die nächste Szene
 * oder als Anker für den Continuity-Drift-Check dient.
 *
 * Vorteile gegenüber serverseitiger Extraktion:
 *   - kein Replicate / FFmpeg-Edge-Function-Aufruf nötig (keine Credits, keine API-Key)
 *   - typische Latenz <1s statt 5-15s
 *   - funktioniert für jede CORS-fähige Video-URL (inkl. unserer Storage-URLs)
 */
export function useFrameContinuity() {
  const [extractingSceneId, setExtractingSceneId] = useState<string | null>(null);

  const extractLastFrame = useCallback(
    async (params: {
      videoUrl: string;
      sceneId: string;
      projectId?: string;
      durationSeconds?: number;
    }): Promise<ExtractResult | null> => {
      const { videoUrl, sceneId, projectId, durationSeconds } = params;
      setExtractingSceneId(sceneId);

      let video: HTMLVideoElement | null = null;
      try {
        // Auth: brauchen wir für den RLS-konformen Pfad
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) {
          throw new Error('Nicht eingeloggt');
        }
        const userId = authData.user.id;

        // Offscreen video laden
        video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = videoUrl;

        await new Promise<void>((resolve, reject) => {
          const onMeta = () => resolve();
          const onErr = () =>
            reject(new Error('Video konnte nicht geladen werden (CORS?)'));
          video!.addEventListener('loadedmetadata', onMeta, { once: true });
          video!.addEventListener('error', onErr, { once: true });
          setTimeout(
            () => reject(new Error('Video-Laden hat zu lange gedauert')),
            15000
          );
        });

        // Ziel-Zeitpunkt: knapp vor Ende (oder explizit übergeben für First-Frame-Use-Case)
        const dur = video.duration || durationSeconds || 5;
        const requested =
          typeof durationSeconds === 'number' ? durationSeconds : dur - 0.05;
        const target = Math.min(Math.max(0.05, requested), Math.max(0.05, dur - 0.05));

        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => resolve();
          video!.addEventListener('seeked', onSeeked, { once: true });
          video!.addEventListener(
            'error',
            () => reject(new Error('Seek fehlgeschlagen')),
            { once: true }
          );
          try {
            video!.currentTime = target;
          } catch (e) {
            reject(e instanceof Error ? e : new Error('Seek hat geworfen'));
          }
          setTimeout(() => reject(new Error('Seek-Timeout')), 10000);
        });

        // Canvas-Render
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D Context nicht verfügbar');
        ctx.drawImage(video, 0, 0, w, h);

        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob fehlgeschlagen'))),
            'image/jpeg',
            0.88
          )
        );

        // Upload zum bucket — RLS verlangt user-id als erstes Segment
        const ts = Date.now();
        const subFolder = projectId ?? 'shared';
        const path = `${userId}/${subFolder}/last-frames/${sceneId}-${ts}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('composer-frames')
          .upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: true,
            cacheControl: '31536000',
          });
        if (upErr) throw new Error(`Upload fehlgeschlagen: ${upErr.message}`);

        const { data: pub } = supabase.storage
          .from('composer-frames')
          .getPublicUrl(path);
        const publicUrl = pub.publicUrl;

        // Best-effort: Persistieren auf composer_scenes.last_frame_url (RLS deckt user ab)
        try {
          await (supabase as any)
            .from('composer_scenes')
            .update({ last_frame_url: publicUrl })
            .eq('id', sceneId);
        } catch (persistErr) {
          console.warn('[useFrameContinuity] persist failed (ignored):', persistErr);
        }

        return { lastFrameUrl: publicUrl };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Frame-Extraktion fehlgeschlagen';
        console.error('[useFrameContinuity] error:', err);
        toast.error(msg);
        return null;
      } finally {
        if (video) {
          try {
            video.src = '';
            video.removeAttribute('src');
            video.load();
          } catch {
            // ignore
          }
        }
        setExtractingSceneId(null);
      }
    },
    []
  );

  return { extractLastFrame, extractingSceneId };
}

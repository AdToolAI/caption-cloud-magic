/**
 * Tab-unabhängiger Auto-Trigger für die Two-Shot/Cinematic-Sync Lip-Sync-Pipeline.
 *
 * Findet alle Szenen im Projekt mit:
 *   engine_override = 'cinematic-sync'
 *   clip_url        != null
 *   lip_sync_status IN (NULL, 'pending')
 *   lip_sync_applied_at IS NULL
 *
 * und feuert pro Szene `compose-twoshot-lipsync` (>=2 Sprecher) bzw.
 * `compose-lipsync-scene` (1 Sprecher). Vorher wird `lip_sync_status='running'`
 * gesetzt, damit derselbe Polling-Tick und parallele Tabs den Trigger nicht
 * doppelt auslösen.
 *
 * Pollt alle 8s, solange das Hook gemountet ist (Composer-Dashboard).
 * Identisch zur alten Logik in ClipsTab.tsx (Zeilen 276–335), aber jetzt
 * Tab-übergreifend — also auch im Voiceover-/Musik-/Export-Tab aktiv.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const POLL_INTERVAL_MS = 8_000;

function detectSpeakerCount(dialogScript: string): number {
  const set = new Set<string>();
  for (const line of String(dialogScript ?? '').split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) set.add(m[1].trim().toLowerCase());
  }
  return set.size;
}

export function useTwoShotAutoTrigger(projectId: string | undefined) {
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from('composer_scenes')
          .select('id, clip_url, engine_override, lip_sync_status, lip_sync_applied_at, dialog_script, updated_at')
          .eq('project_id', projectId);
        if (error || !data) return;

        const now = Date.now();
        const STALE_MS = 6 * 60 * 1000; // 6min: pipeline takes ~3min, double for safety

        // Stale-recovery: 'running' >6min ohne lip_sync_applied_at → reset
        const stale = (data as any[]).filter(
          (d) =>
            d.engine_override === 'cinematic-sync' &&
            d.lip_sync_status === 'running' &&
            !d.lip_sync_applied_at &&
            d.updated_at &&
            now - new Date(d.updated_at).getTime() > STALE_MS,
        );
        if (stale.length > 0) {
          console.warn(
            `[useTwoShotAutoTrigger] resetting ${stale.length} stale 'running' scenes`,
          );
          await Promise.all(
            stale.map((d) => {
              inflight.current.delete(d.id);
              return supabase
                .from('composer_scenes')
                .update({ lip_sync_status: 'pending', clip_error: 'auto-reset: stale running' })
                .eq('id', d.id);
            }),
          );
        }

        const candidates = (data as any[]).filter(
          (d) =>
            d.engine_override === 'cinematic-sync' &&
            typeof d.clip_url === 'string' &&
            d.clip_url.length > 0 &&
            (d.lip_sync_status === 'pending' || d.lip_sync_status == null) &&
            !d.lip_sync_applied_at &&
            !inflight.current.has(d.id),
        );
        if (candidates.length === 0) return;

        // Optimistischer Client-Lock — verhindert Doppel-Trigger im selben Tick.
        // Wichtig: den DB-Status NICHT hier auf 'running' setzen. Die Edge-
        // Function reserviert Credits und setzt den Status atomar selbst;
        // sonst blockiert ihre Duplicate-Run-Sperre den frisch gestarteten Job.
        candidates.forEach((d) => inflight.current.add(d.id));

        for (const d of candidates) {
          const speakers = detectSpeakerCount(d.dialog_script ?? '');
          const fnName = speakers >= 2 ? 'compose-twoshot-lipsync' : 'compose-lipsync-scene';
          console.info(
            `[useTwoShotAutoTrigger] invoking ${fnName} for scene ${d.id} (speakers=${speakers})`,
          );
          supabase.functions
            .invoke(fnName, { body: { scene_id: d.id } })
            .then(({ data: lsData, error: lsErr }) => {
              const errBody = (lsErr as any)?.context;
              const reason = lsData?.error ?? errBody?.error;
              const message = lsData?.message ?? errBody?.message;
              if (reason === 'tts_failed' || reason === 'no_voiceover') {
                toast({
                  title: 'Cinematic-Sync braucht ein Voiceover',
                  description:
                    message || 'Bitte im Voiceover-Tab eine Stimme prüfen, dann erneut versuchen.',
                  variant: 'destructive',
                });
              } else if (lsErr) {
                toast({
                  title: 'Lip-Sync fehlgeschlagen',
                  description:
                    message || (lsErr as Error).message || 'Unbekannter Fehler beim Lip-Sync.',
                  variant: 'destructive',
                });
                console.warn(
                  `[useTwoShotAutoTrigger] invoke failed for ${d.id}`,
                  lsErr,
                );
              }
            })
            .finally(() => {
              // Lock wird nicht sofort freigegeben — der nächste Poll-Tick
              // sieht entweder lip_sync_applied_at gesetzt oder lip_sync_status
              // weiterhin 'running'. Bei Failure setzt die Edge-Function selbst
              // den Status zurück.
              setTimeout(() => inflight.current.delete(d.id), 30_000);
            });
        }
      } catch (err) {
        console.warn('[useTwoShotAutoTrigger] tick error', err);
      }
    };

    // Sofort ausführen + dann im Intervall
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [projectId]);
}

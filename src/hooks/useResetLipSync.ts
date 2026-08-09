import { tx } from "@/lib/i18nText";
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * useResetLipSync — explicit user-triggered "clean restart" of a stuck/failed
 * lip-sync scene. Calls the server endpoint `reset-lipsync-scene` which:
 *  - cancels any open Sync.so jobs for this scene,
 *  - frees inflight provider slots,
 *  - refunds credits once (idempotent),
 *  - hard-resets the scene to a clean `pending` state.
 *
 * The auto-trigger (`useTwoShotAutoTrigger`) then picks up the scene as a
 * fresh candidate on its next 8 s tick and starts a brand-new run.
 */
export function useResetLipSync() {
  const [resettingId, setResettingId] = useState<string | null>(null);

  const reset = useCallback(async (sceneId: string) => {
    if (!sceneId) return;
    setResettingId(sceneId);
    try {
      const { data, error } = await supabase.functions.invoke('reset-lipsync-scene', {
        body: { scene_id: sceneId },
      });
      if (error) throw new Error(error.message ?? 'reset_failed');
      if (data?.status === 'already_applied') {
        toast({
          title: tx({ de: 'Lip-Sync bereits fertig', en: 'Lip-sync already finished', es: 'Sincronización labial ya terminada' }),
          description: tx({ de: 'Diese Szene ist bereits abgeschlossen.', en: 'This scene is already complete.', es: 'Esta escena ya está completa.' }),
        });
      } else {
        toast({
          title: 'Lip-Sync zurückgesetzt',
          description: tx({ de: 'Die Szene startet gleich automatisch einen sauberen neuen Versuch.', en: 'The scene will automatically start a clean new attempt shortly.', es: 'La escena iniciará automáticamente un nuevo intento en breve.' }),
        });
      }
    } catch (e) {
      toast({
        title: 'Reset fehlgeschlagen',
        description: (e as Error)?.message ?? 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setResettingId(null);
    }
  }, []);

  return { reset, resettingId };
}

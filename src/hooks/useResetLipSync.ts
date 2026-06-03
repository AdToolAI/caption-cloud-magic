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
          title: 'Lip-Sync bereits fertig',
          description: 'Diese Szene ist bereits abgeschlossen.',
        });
      } else {
        toast({
          title: 'Lip-Sync zurückgesetzt',
          description: 'Die Szene startet gleich automatisch einen sauberen neuen Versuch.',
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

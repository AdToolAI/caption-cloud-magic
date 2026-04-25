import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExtractResult {
  lastFrameUrl: string;
}

/**
 * Hook für Frame-to-Shot Continuity:
 * Extrahiert den letzten Frame eines Clips und liefert eine Storage-URL,
 * die als Reference-Image für die nächste Szene genutzt werden kann.
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
      setExtractingSceneId(params.sceneId);
      try {
        const { data, error } = await supabase.functions.invoke(
          'extract-video-last-frame',
          { body: params }
        );
        if (error) throw error;
        if (!data?.lastFrameUrl) throw new Error('Kein Frame zurückgegeben');
        toast.success('Letzter Frame extrahiert ✨');
        return { lastFrameUrl: data.lastFrameUrl };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Frame-Extraktion fehlgeschlagen';
        console.error('[useFrameContinuity] error:', err);
        toast.error(msg);
        return null;
      } finally {
        setExtractingSceneId(null);
      }
    },
    []
  );

  return { extractLastFrame, extractingSceneId };
}

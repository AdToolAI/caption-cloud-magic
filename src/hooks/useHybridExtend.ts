import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type HybridMode = 'forward' | 'backward' | 'bridge' | 'style-ref';
export type HybridEngine =
  | 'ai-hailuo'
  | 'ai-kling'
  | 'ai-luma'
  | 'ai-wan'
  | 'ai-seedance';

/** Engines that support `end_image` and therefore support backward extend AND bridge. */
export const HYBRID_BACKWARD_CAPABLE: HybridEngine[] = ['ai-kling', 'ai-luma'];
/** Bridge requires both start_image and end_image — same constraint as backward. */
export const HYBRID_BRIDGE_CAPABLE: HybridEngine[] = HYBRID_BACKWARD_CAPABLE;

export interface HybridExtendParams {
  projectId: string;
  sourceSceneId: string;
  mode: HybridMode;
  engine: HybridEngine;
  quality?: 'standard' | 'pro';
  prompt: string;
  durationSeconds?: number;
  /** Required when `mode === 'bridge'`: the scene the new clip should morph INTO. */
  targetSceneId?: string;
}

export interface HybridExtendResult {
  newSceneId: string;
  orderIndex: number;
  anchorImageUrl: string;
  mode: HybridMode;
}

/**
 * Block M-1 — Hybrid Production hook for Forward / Backward Extend.
 * Calls the `hybrid-extend-scene` orchestrator which:
 *   1. Extracts the anchor frame
 *   2. Inserts a new pending scene
 *   3. Triggers `compose-video-clips` to render the new clip
 *
 * The newly inserted scene appears via realtime / refetch in the storyboard;
 * the caller is responsible for refreshing project state.
 */
export function useHybridExtend() {
  const [isExtending, setIsExtending] = useState(false);

  const extendScene = useCallback(
    async (params: HybridExtendParams): Promise<HybridExtendResult | null> => {
      setIsExtending(true);
      try {
        if (
          params.mode === 'backward' &&
          !HYBRID_BACKWARD_CAPABLE.includes(params.engine)
        ) {
          toast.error(
            `Backward Extend ist nur mit ${HYBRID_BACKWARD_CAPABLE.join(', ')} möglich.`
          );
          return null;
        }
        if (params.mode === 'bridge') {
          if (!HYBRID_BRIDGE_CAPABLE.includes(params.engine)) {
            toast.error(
              `Bridge ist nur mit ${HYBRID_BRIDGE_CAPABLE.join(', ')} möglich.`
            );
            return null;
          }
          if (!params.targetSceneId) {
            toast.error('Bridge benötigt eine Ziel-Szene.');
            return null;
          }
        }

        const { data, error } = await supabase.functions.invoke(
          'hybrid-extend-scene',
          { body: params }
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.newSceneId) throw new Error('Keine neue Szene zurückgegeben');

        const successMsg =
          params.mode === 'forward'
            ? '🎬 Sequel wird gedreht…'
            : params.mode === 'backward'
            ? '⏮ Prequel wird gedreht…'
            : params.mode === 'bridge'
            ? '🌉 Crossfade wird gefilmt…'
            : '🎨 Style-Echo wird komponiert…';
        toast.success(successMsg);
        return data as HybridExtendResult;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Hybrid Extend fehlgeschlagen';
        console.error('[useHybridExtend] error:', err);
        toast.error(msg);
        return null;
      } finally {
        setIsExtending(false);
      }
    },
    []
  );

  return { extendScene, isExtending };
}

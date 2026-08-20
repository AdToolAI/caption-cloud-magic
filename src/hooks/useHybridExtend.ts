import { tx } from "@/lib/i18nText";
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
            tx({ de: `Backward Extend ist nur mit ${HYBRID_BACKWARD_CAPABLE.join(', ')} möglich.`, en: `Backward Extend is only possible with ${HYBRID_BACKWARD_CAPABLE.join(', ')}.`, es: `La extensión hacia atrás solo es posible con ${HYBRID_BACKWARD_CAPABLE.join(', ')}.` })
          );
          return null;
        }
        if (params.mode === 'bridge') {
          if (!HYBRID_BRIDGE_CAPABLE.includes(params.engine)) {
            toast.error(
              tx({ de: `Bridge ist nur mit ${HYBRID_BRIDGE_CAPABLE.join(', ')} möglich.`, en: `Bridge is only possible with ${HYBRID_BRIDGE_CAPABLE.join(', ')}.`, es: `El puente solo es posible con ${HYBRID_BRIDGE_CAPABLE.join(', ')}.` })
            );
            return null;
          }
          if (!params.targetSceneId) {
            toast.error(tx({ de: 'Bridge benötigt eine Ziel-Szene.', en: 'Bridge requires a target scene.', es: 'El puente requiere una escena de destino.' }));
            return null;
          }
        }

        const { data, error } = await supabase.functions.invoke(
          'hybrid-extend-scene',
          { body: params }
        );

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.newSceneId) throw new Error(tx({ de: tx({ de: "Keine neue Szene zurückgegeben", en: "No new scene returned", es: "No se devolvió ninguna escena nueva" }), en: 'No new scene returned', es: 'No se devolvió ninguna escena nueva' }));

        const successMsg =
          params.mode === 'forward'
            ? tx({ de: tx({ de: "🎬 Sequel wird gedreht…", en: "🎬 Shooting the sequel…", es: "🎬 Rodando la secuela…" }), en: '🎬 Shooting sequel…', es: '🎬 Rodando la secuela…' })
            : params.mode === 'backward'
            ? tx({ de: tx({ de: "⏮ Prequel wird gedreht…", en: "⏮ Shooting the prequel…", es: "⏮ Rodando la precuela…" }), en: '⏮ Shooting prequel…', es: '⏮ Rodando la precuela…' })
            : params.mode === 'bridge'
            ? tx({ de: tx({ de: "🌉 Crossfade wird gefilmt…", en: "🌉 Filming the crossfade…", es: "🌉 Filmando el crossfade…" }), en: '🌉 Filming crossfade…', es: '🌉 Filmando la transición…' })
            : tx({ de: '🎨 Style-Echo wird komponiert…', en: '🎨 Composing style echo…', es: '🎨 Componiendo el eco de estilo…' });
        toast.success(successMsg);
        return data as HybridExtendResult;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : tx({ de: 'Hybrid Extend fehlgeschlagen', en: 'Hybrid extend failed', es: 'La extensión híbrida falló' });
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

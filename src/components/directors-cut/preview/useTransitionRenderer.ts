import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getTransitionStyles } from './NativeTransitionLayer';

// All transition types now use the same dual-video CSS path

/**
 * Dual-video CSS transition renderer with canvas freeze for opacity transitions.
 */
export function useTransitionRenderer(
  baseVideoRef: React.RefObject<HTMLVideoElement | null>,
  incomingVideoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  visualTimeRef: React.RefObject<number>,
  scenes: SceneAnalysis[],
  transitions: TransitionAssignment[],
  videoFilterRef: React.RefObject<string>,
  frameCacheRef: React.RefObject<Map<string, ImageBitmap>>,
  computeFilterForTimeRef?: React.RefObject<(time: number) => string>,
) {
  const rafRef = useRef<number>();
  const wasActiveRef = useRef(false);
  const lastIncomingSeekRef = useRef<string>('');

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions),
    [scenes, transitions],
  );

  const seekIncoming = useCallback((incomingSceneId: string, scenes: SceneAnalysis[]) => {
    const incoming = incomingVideoRef.current;
    if (!incoming) return;

    const scene = scenes.find(s => s.id === incomingSceneId);
    if (!scene) return;

    const seekKey = `${incomingSceneId}`;
    if (lastIncomingSeekRef.current === seekKey) return;
    lastIncomingSeekRef.current = seekKey;

    const sourceStart = scene.original_start_time ?? scene.start_time;
    incoming.currentTime = sourceStart + 0.05;
  }, [incomingVideoRef]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (scenes.length < 2 || transitions.length === 0) {
      const incoming = incomingVideoRef.current;
      if (incoming) {
        incoming.style.opacity = '0';
        incoming.style.pointerEvents = 'none';
      }
      if (canvas) canvas.style.display = 'none';
      return;
    }

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      const base = baseVideoRef.current;
      const incoming = incomingVideoRef.current;
      if (!base || !incoming) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let found = false;

      // === PRE-SEEK: prepare incoming video before transition starts ===
      const PRE_SEEK_WINDOW = 0.5;
      for (const rt of resolvedTransitions) {
        if (time >= rt.tStart - PRE_SEEK_WINDOW && time < rt.tStart) {
          seekIncoming(rt.incomingSceneId, scenes);
          if (incoming.paused) {
            incoming.style.opacity = '0';
            incoming.play().catch(() => {});
          }
          break;
        }
      }

      // === FREEZE PHASE (offset > 0) ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        base.style.opacity = '1';
        base.style.transform = '';
        base.style.clipPath = '';
        incoming.style.opacity = '0';
        incoming.style.pointerEvents = 'none';
        if (canvas) canvas.style.display = 'none';
        found = true;
        wasActiveRef.current = true;
      }

      // === ACTIVE TRANSITION ===
      if (!found) {
        const active = findActiveTransition(time, resolvedTransitions);
        if (active) {
          const { transition: rt, progress } = active;

          seekIncoming(rt.incomingSceneId, scenes);

          if (incoming.paused) {
            incoming.play().catch(() => {});
          }

          const styles = getTransitionStyles({
            progress,
            baseType: rt.baseType,
            direction: rt.direction,
            sceneIndex: rt.sceneIndex,
            transitionDuration: rt.duration,
          });

          const syncFilter = computeFilterForTimeRef?.current
            ? computeFilterForTimeRef.current(time)
            : (videoFilterRef.current || '');

          // --- ALL TRANSITIONS: unified dual-video CSS path ---
          if (canvas) canvas.style.display = 'none';

          base.style.position = 'absolute';
          base.style.inset = '0';
          base.style.width = '100%';
          base.style.height = '100%';
          base.style.objectFit = 'contain';
          base.style.zIndex = '1';

          const baseTransitionFilter = (styles.baseStyle as any).filter || '';
          base.style.opacity = styles.baseStyle.opacity != null ? String(styles.baseStyle.opacity) : '1';
          base.style.transform = styles.baseStyle.transform || 'none';
          base.style.clipPath = styles.baseStyle.clipPath || 'none';
          base.style.filter = [syncFilter, baseTransitionFilter].filter(Boolean).join(' ') || 'none';

          // Apply incoming styles (same for all transition types)
          incoming.style.pointerEvents = 'auto';
          incoming.style.position = 'absolute';
          incoming.style.inset = '0';
          incoming.style.width = '100%';
          incoming.style.height = '100%';
          incoming.style.objectFit = 'contain';
          incoming.style.zIndex = '2';

          const incomingTransitionFilter = (styles.incomingStyle as any).filter || '';
          incoming.style.opacity = styles.incomingStyle.opacity != null ? String(styles.incomingStyle.opacity) : '1';
          incoming.style.transform = styles.incomingStyle.transform || '';
          incoming.style.clipPath = styles.incomingStyle.clipPath || '';
          incoming.style.filter = [syncFilter, incomingTransitionFilter].filter(Boolean).join(' ') || '';

          found = true;
          wasActiveRef.current = true;
        }
      }

      // === NO TRANSITION — reset everything ===
      if (!found) {
        const syncFilter = computeFilterForTimeRef?.current
          ? computeFilterForTimeRef.current(time)
          : (videoFilterRef.current || '');

        base.style.opacity = '1';
        base.style.transform = 'none';
        base.style.clipPath = 'none';
        base.style.filter = syncFilter || '';
        base.style.position = '';
        base.style.inset = '';
        base.style.zIndex = '';

        if (wasActiveRef.current) {
          wasActiveRef.current = false;
          lastIncomingSeekRef.current = '';
        }

        // Hide incoming
        if (!incoming.paused) incoming.pause();
        incoming.style.pointerEvents = 'none';
        incoming.style.opacity = '0';
        incoming.style.transform = 'none';
        incoming.style.clipPath = 'none';
        incoming.style.filter = 'none';
        incoming.style.position = '';
        incoming.style.inset = '';
        incoming.style.width = '';
        incoming.style.height = '';
        incoming.style.objectFit = '';
        incoming.style.zIndex = '';

        // Hide canvas
        if (canvas) canvas.style.display = 'none';
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, incomingVideoRef, canvasRef, videoFilterRef, frameCacheRef, seekIncoming, computeFilterForTimeRef]);
}

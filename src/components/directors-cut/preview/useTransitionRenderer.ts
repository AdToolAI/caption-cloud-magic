import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getTransitionStyles } from './NativeTransitionLayer';

/**
 * Dual-video CSS transition renderer.
 * Instead of canvas compositing (which requires CORS for frame capture),
 * this manipulates two <video> elements directly via CSS properties.
 * The base video shows the outgoing scene; the incoming video shows the next scene.
 * Transitions are rendered via opacity, transform, clipPath, and filter.
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
) {
  const rafRef = useRef<number>();
  const wasActiveRef = useRef(false);
  const lastIncomingSeekRef = useRef<string>('');

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions),
    [scenes, transitions],
  );

  // Seek the incoming video to the start of the incoming scene
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
    if (canvas) canvas.style.display = 'none';

    if (scenes.length < 2 || transitions.length === 0) {
      const incoming = incomingVideoRef.current;
      if (incoming) incoming.style.display = 'none';
      return;
    }

    const tick = () => {
      // Use TIMELINE time (visualTimeRef) — NOT video.currentTime (source time)
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
          break;
        }
      }

      // === FREEZE PHASE (offset > 0) ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        base.style.opacity = '1';
        base.style.transform = '';
        base.style.clipPath = '';
        incoming.style.display = 'none';
        found = true;
        wasActiveRef.current = true;
      }

      // === ACTIVE TRANSITION ===
      if (!found) {
        const active = findActiveTransition(time, resolvedTransitions);
        if (active) {
          const { transition: rt, progress } = active;

          seekIncoming(rt.incomingSceneId, scenes);

          // DO NOT pause or seek the base video — it is the transport clock.
          // The base content is hidden/faded by CSS during the transition.
          // Pausing it would freeze the timeline slider.

          // Start incoming video playing from the right position
          if (incoming.paused && incoming.readyState >= 2) {
            incoming.play().catch(() => {});
          }

          const styles = getTransitionStyles({
            progress,
            baseType: rt.baseType,
            direction: rt.direction,
            sceneIndex: rt.sceneIndex,
            transitionDuration: rt.duration,
          });

          // Apply base (outgoing) styles
          const baseFilter = videoFilterRef.current || '';
          const baseTransitionFilter = (styles.baseStyle as any).filter || '';
          base.style.opacity = styles.baseStyle.opacity != null ? String(styles.baseStyle.opacity) : '1';
          base.style.transform = styles.baseStyle.transform || '';
          base.style.clipPath = styles.baseStyle.clipPath || '';
          base.style.filter = [baseFilter, baseTransitionFilter].filter(Boolean).join(' ') || '';

          // Apply incoming styles
          incoming.style.display = '';
          incoming.style.position = 'absolute';
          incoming.style.inset = '0';
          incoming.style.width = '100%';
          incoming.style.height = '100%';
          incoming.style.objectFit = 'contain';
          incoming.style.zIndex = '2';

          const incomingFilter = videoFilterRef.current || '';
          const incomingTransitionFilter = (styles.incomingStyle as any).filter || '';
          incoming.style.opacity = styles.incomingStyle.opacity != null ? String(styles.incomingStyle.opacity) : '1';
          incoming.style.transform = styles.incomingStyle.transform || '';
          incoming.style.clipPath = styles.incomingStyle.clipPath || '';
          incoming.style.filter = [incomingFilter, incomingTransitionFilter].filter(Boolean).join(' ') || '';

          found = true;
          wasActiveRef.current = true;
        }
      }

      // === NO TRANSITION — deterministic baseline reset EVERY inactive frame ===
      if (!found) {
        const baseFilter = videoFilterRef.current || '';
        // Deterministic hard reset EVERY inactive frame
        base.style.opacity = '1';
        base.style.transform = 'none';
        base.style.clipPath = 'none';
        base.style.filter = baseFilter || '';
        base.style.position = '';
        base.style.inset = '';
        base.style.zIndex = '';

        if (wasActiveRef.current) {
          wasActiveRef.current = false;
          lastIncomingSeekRef.current = '';
        }

        // Always ensure incoming is hidden and fully reset
        if (!incoming.paused) incoming.pause();
        incoming.style.display = 'none';
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
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, incomingVideoRef, canvasRef, videoFilterRef, frameCacheRef, seekIncoming]);
}

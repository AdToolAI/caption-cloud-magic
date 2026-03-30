import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getTransitionStyles } from './NativeTransitionLayer';

/**
 * Dual-video CSS transition renderer with phase-based lifecycle:
 *   idle       → far from any transition, incoming hidden
 *   preparing  → within pre-seek window, incoming seeked & playing but invisible
 *   active     → transition in progress, styles applied
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
  transitionCooldownRef?: React.MutableRefObject<number>,
) {
  const rafRef = useRef<number>();
  const phaseRef = useRef<'idle' | 'preparing' | 'active'>('idle');
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

    const seekKey = incomingSceneId;
    if (lastIncomingSeekRef.current === seekKey) return;
    lastIncomingSeekRef.current = seekKey;

    const sourceStart = scene.original_start_time ?? scene.start_time;
    incoming.currentTime = sourceStart + 0.05;
  }, [incomingVideoRef]);

  // Expose a way to reset transition state (called from handleSeek/handleReset)
  useEffect(() => {
    // When scenes or transitions change, reset phase
    phaseRef.current = 'idle';
    lastIncomingSeekRef.current = '';
  }, [scenes, transitions]);

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

    const PRE_SEEK_WINDOW = 0.8; // seconds before transition to start preparing
    const IDLE_MARGIN = 1.5; // seconds away from any transition = truly idle

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      const base = baseVideoRef.current;
      const incoming = incomingVideoRef.current;
      if (!base || !incoming) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Always hide canvas — we use pure CSS dual-video
      if (canvas) canvas.style.display = 'none';

      const syncFilter = computeFilterForTimeRef?.current
        ? computeFilterForTimeRef.current(time)
        : (videoFilterRef.current || '');

      // === Check phases in priority order ===

      // Phase 1: FREEZE (offset > 0)
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        phaseRef.current = 'preparing';
        // Keep base visible, hide incoming
        base.style.opacity = '1';
        base.style.transform = '';
        base.style.clipPath = '';
        base.style.filter = syncFilter || '';
        incoming.style.opacity = '0';
        incoming.style.pointerEvents = 'none';
        // Pre-seek incoming during freeze
        seekIncoming(freezeRT.incomingSceneId, scenes);
        if (incoming.paused) {
          incoming.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Phase 2: ACTIVE TRANSITION
      const active = findActiveTransition(time, resolvedTransitions);
      if (active) {
        const { transition: rt, progress } = active;
        phaseRef.current = 'active';

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

        // Apply base styles
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

        // Apply incoming styles
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

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Phase 3: PRE-SEEK (preparing)
      for (const rt of resolvedTransitions) {
        if (time >= rt.tStart - PRE_SEEK_WINDOW && time < rt.tStart) {
          phaseRef.current = 'preparing';
          seekIncoming(rt.incomingSceneId, scenes);
          // Start playing but keep invisible
          incoming.style.opacity = '0';
          incoming.style.pointerEvents = 'none';
          if (incoming.paused) {
            incoming.play().catch(() => {});
          }
          // Base stays normal
          base.style.opacity = '1';
          base.style.transform = 'none';
          base.style.clipPath = 'none';
          base.style.filter = syncFilter || '';
          base.style.position = '';
          base.style.inset = '';
          base.style.zIndex = '';

          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      // Phase 4: IDLE — truly far from any transition
      // Only reset incoming if we were previously in a non-idle phase
      if (phaseRef.current !== 'idle') {
        // Sync base video to incoming position BEFORE hiding incoming
        // This prevents the visible jump when switching layers
        const base = baseVideoRef.current;
        if (base && incoming.currentTime > 0 && !incoming.paused) {
          const diff = Math.abs(base.currentTime - incoming.currentTime);
          if (diff > 0.05) {
            base.currentTime = incoming.currentTime;
          }
        }

        // Now clean up incoming
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

        lastIncomingSeekRef.current = '';
        
        // Signal cooldown to player to suppress boundary seek for a few frames
        if (transitionCooldownRef) {
          transitionCooldownRef.current = 30; // suppress for 30 frames (~500ms)
        }
        
        phaseRef.current = 'idle';
      }

      // Base normal styles
      base.style.opacity = '1';
      base.style.transform = 'none';
      base.style.clipPath = 'none';
      base.style.filter = syncFilter || '';
      base.style.position = '';
      base.style.inset = '';
      base.style.zIndex = '';

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, incomingVideoRef, canvasRef, videoFilterRef, frameCacheRef, seekIncoming, computeFilterForTimeRef]);
}

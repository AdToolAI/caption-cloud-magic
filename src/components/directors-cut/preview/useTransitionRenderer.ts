import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getTransitionStyles } from './NativeTransitionLayer';

export interface HandoffBoundaryMarker {
  outgoingSceneId: string;
  incomingSceneId: string;
  boundarySourceTime: number;
}

/**
 * Ping-pong dual-video CSS transition renderer.
 * 
 * Instead of fixed "base" and "incoming" roles, the two video elements
 * swap roles after each transition. This eliminates the post-transition
 * stutter caused by pause→seek→resume on the visible stream.
 * 
 * Phases:
 *   idle       → no transition nearby, standby hidden
 *   preparing  → within pre-seek window, standby seeked but PAUSED and invisible
 *   active     → transition in progress, both playing, CSS styles applied
 *   handoff    → transition ended, swap roles (no seek on visible stream!)
 */
export function useTransitionRenderer(
  videoRefA: React.RefObject<HTMLVideoElement | null>,
  videoRefB: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  visualTimeRef: React.RefObject<number>,
  scenes: SceneAnalysis[],
  transitions: TransitionAssignment[],
  videoFilterRef: React.RefObject<string>,
  frameCacheRef: React.RefObject<Map<string, ImageBitmap>>,
  computeFilterForTimeRef?: React.RefObject<(time: number) => string>,
  transitionCooldownRef?: React.MutableRefObject<number>,
  lastHandoffBoundaryRef?: React.MutableRefObject<HandoffBoundaryMarker | null>,
  transitionPhaseRef?: React.MutableRefObject<'idle' | 'preparing' | 'active' | 'handoff'>,
  activeSlotRef?: React.MutableRefObject<'A' | 'B'>,
) {
  const rafRef = useRef<number>();
  const phaseRef = useRef<'idle' | 'preparing' | 'active' | 'handoff'>('idle');
  const lastStandbySeekRef = useRef<string>('');
  
  // Track last active transition for structured boundary marking
  const lastActiveTransitionRef = useRef<{ outgoingSceneId: string; incomingSceneId: string; tEnd: number; originalBoundary: number; offsetSeconds: number } | null>(null);

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions),
    [scenes, transitions],
  );

  // Helpers to get active/standby based on current slot
  const getActive = useCallback(() => {
    const slot = activeSlotRef?.current ?? 'A';
    return slot === 'A' ? videoRefA.current : videoRefB.current;
  }, [videoRefA, videoRefB, activeSlotRef]);

  const getStandby = useCallback(() => {
    const slot = activeSlotRef?.current ?? 'A';
    return slot === 'A' ? videoRefB.current : videoRefA.current;
  }, [videoRefA, videoRefB, activeSlotRef]);

  const seekStandby = useCallback((incomingSceneId: string, scenes: SceneAnalysis[]) => {
    const standby = getStandby();
    if (!standby) return;

    const scene = scenes.find(s => s.id === incomingSceneId);
    if (!scene) return;

    const seekKey = incomingSceneId;
    if (lastStandbySeekRef.current === seekKey) return;
    lastStandbySeekRef.current = seekKey;

    const sourceStart = scene.original_start_time ?? scene.start_time;
    standby.currentTime = sourceStart + 0.05;
  }, [getStandby]);

  const setPhase = useCallback((phase: 'idle' | 'preparing' | 'active' | 'handoff') => {
    phaseRef.current = phase;
    if (transitionPhaseRef) transitionPhaseRef.current = phase;
  }, [transitionPhaseRef]);

  // Reset on scenes/transitions change
  useEffect(() => {
    setPhase('idle');
    lastStandbySeekRef.current = '';
    lastActiveTransitionRef.current = null;
  }, [scenes, transitions, setPhase]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (scenes.length < 2 || transitions.length === 0) {
      const standby = getStandby();
      if (standby) {
        standby.style.opacity = '0';
        standby.style.pointerEvents = 'none';
      }
      if (canvas) canvas.style.display = 'none';
      return;
    }

    const PRE_SEEK_WINDOW = 0.8;

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      const active = getActive();
      const standby = getStandby();
      if (!active || !standby) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (canvas) canvas.style.display = 'none';

      const syncFilter = computeFilterForTimeRef?.current
        ? computeFilterForTimeRef.current(time)
        : (videoFilterRef.current || '');

      // Mirror playbackRate during active phase
      if (phaseRef.current === 'active') {
        if (Math.abs(standby.playbackRate - active.playbackRate) > 0.01) {
          standby.playbackRate = active.playbackRate;
        }
      }

      // === PRIORITY 1: ACTIVE TRANSITION ===
      const activeTransition = findActiveTransition(time, resolvedTransitions);
      if (activeTransition) {
        const { transition: rt, progress } = activeTransition;
        
        // Track active transition with real boundary info
        lastActiveTransitionRef.current = {
          outgoingSceneId: rt.outgoingSceneId,
          incomingSceneId: rt.incomingSceneId,
          tEnd: rt.tEnd,
          originalBoundary: rt.originalBoundary,
          offsetSeconds: rt.offsetSeconds,
        };
        
        const wasNotActive = phaseRef.current !== 'active';
        setPhase('active');

        seekStandby(rt.incomingSceneId, scenes);

        // Start playing standby ONLY when entering active phase
        if (standby.paused) {
          if (wasNotActive) {
            const incomingScene = scenes.find(s => s.id === rt.incomingSceneId);
            if (incomingScene) {
              const sourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
              const expectedTime = sourceStart + 0.05;
              if (Math.abs(standby.currentTime - expectedTime) > 0.1) {
                standby.currentTime = expectedTime;
              }
            }
          }
          standby.play().catch(() => {});
        }

        const styles = getTransitionStyles({
          progress,
          baseType: rt.baseType,
          direction: rt.direction,
          sceneIndex: rt.sceneIndex,
          transitionDuration: rt.duration,
        });

        // Apply active (outgoing) styles
        active.style.position = 'absolute';
        active.style.inset = '0';
        active.style.width = '100%';
        active.style.height = '100%';
        active.style.objectFit = 'contain';
        active.style.zIndex = '1';

        const activeTransitionFilter = (styles.baseStyle as any).filter || '';
        active.style.opacity = styles.baseStyle.opacity != null ? String(styles.baseStyle.opacity) : '1';
        active.style.transform = styles.baseStyle.transform || 'none';
        active.style.clipPath = styles.baseStyle.clipPath || 'none';
        active.style.filter = [syncFilter, activeTransitionFilter].filter(Boolean).join(' ') || 'none';

        // Apply standby (incoming) styles
        standby.style.pointerEvents = 'auto';
        standby.style.position = 'absolute';
        standby.style.inset = '0';
        standby.style.width = '100%';
        standby.style.height = '100%';
        standby.style.objectFit = 'contain';
        standby.style.zIndex = '2';

        const standbyTransitionFilter = (styles.incomingStyle as any).filter || '';
        standby.style.opacity = styles.incomingStyle.opacity != null ? String(styles.incomingStyle.opacity) : '1';
        standby.style.transform = styles.incomingStyle.transform || '';
        standby.style.clipPath = styles.incomingStyle.clipPath || '';
        standby.style.filter = [syncFilter, standbyTransitionFilter].filter(Boolean).join(' ') || '';

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 2: FREEZE phase (offset > 0) ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        setPhase('preparing');
        active.style.opacity = '1';
        active.style.transform = '';
        active.style.clipPath = '';
        active.style.filter = syncFilter || '';
        standby.style.opacity = '0';
        standby.style.pointerEvents = 'none';
        seekStandby(freezeRT.incomingSceneId, scenes);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 3: Transition just ended → SWAP SLOTS (no seek on visible stream!) ===
      if (phaseRef.current === 'active') {
        // The standby video is already playing at the correct position for the new scene.
        // Simply swap roles: standby becomes active, active becomes standby.
        
        // 1. Pause the old active (outgoing) — it becomes the new standby
        if (!active.paused) active.pause();
        
        // 2. Hide the old active
        active.style.opacity = '0';
        active.style.pointerEvents = 'none';
        active.style.transform = 'none';
        active.style.clipPath = 'none';
        active.style.filter = 'none';
        active.style.position = '';
        active.style.inset = '';
        active.style.width = '';
        active.style.height = '';
        active.style.objectFit = '';
        active.style.zIndex = '';

        // 3. Show the new active (was standby) — it's already playing!
        standby.style.opacity = '1';
        standby.style.pointerEvents = 'auto';
        standby.style.transform = 'none';
        standby.style.clipPath = 'none';
        standby.style.filter = syncFilter || '';
        standby.style.position = '';
        standby.style.inset = '';
        standby.style.zIndex = '';

        // 4. Swap the slot reference
        if (activeSlotRef) {
          activeSlotRef.current = activeSlotRef.current === 'A' ? 'B' : 'A';
        }

        // 5. Mark boundary as consumed
        lastStandbySeekRef.current = '';
        if (lastHandoffBoundaryRef && lastActiveTransitionRef.current) {
          lastHandoffBoundaryRef.current = {
            outgoingSceneId: lastActiveTransitionRef.current.outgoingSceneId,
            incomingSceneId: lastActiveTransitionRef.current.incomingSceneId,
            boundarySourceTime: lastActiveTransitionRef.current.originalBoundary + lastActiveTransitionRef.current.offsetSeconds,
          };
        }

        if (transitionCooldownRef) {
          transitionCooldownRef.current = 30;
        }

        setPhase('idle');

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 4: PRE-SEEK (preparing) ===
      for (const rt of resolvedTransitions) {
        if (time >= rt.tStart - PRE_SEEK_WINDOW && time < rt.tStart) {
          setPhase('preparing');
          seekStandby(rt.incomingSceneId, scenes);
          standby.style.opacity = '0';
          standby.style.pointerEvents = 'none';
          active.style.opacity = '1';
          active.style.transform = 'none';
          active.style.clipPath = 'none';
          active.style.filter = syncFilter || '';
          active.style.position = '';
          active.style.inset = '';
          active.style.zIndex = '';

          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      // === PRIORITY 5: IDLE ===
      if (phaseRef.current === 'preparing') {
        if (!standby.paused) standby.pause();
        standby.style.pointerEvents = 'none';
        standby.style.opacity = '0';
        standby.style.transform = 'none';
        standby.style.clipPath = 'none';
        standby.style.filter = 'none';
        standby.style.position = '';
        standby.style.inset = '';
        standby.style.width = '';
        standby.style.height = '';
        standby.style.objectFit = '';
        standby.style.zIndex = '';
        lastStandbySeekRef.current = '';
        setPhase('idle');
      }

      // Active normal styles
      active.style.opacity = '1';
      active.style.transform = 'none';
      active.style.clipPath = 'none';
      active.style.filter = syncFilter || '';
      active.style.position = '';
      active.style.inset = '';
      active.style.zIndex = '';

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, videoRefA, videoRefB, canvasRef, videoFilterRef, frameCacheRef, seekStandby, computeFilterForTimeRef, lastHandoffBoundaryRef, setPhase, getActive, getStandby, activeSlotRef]);
}

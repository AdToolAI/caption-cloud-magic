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
  baseVideoUrl: string,
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

  const getSceneSourceStart = useCallback((scene: SceneAnalysis) => scene.original_start_time ?? scene.start_time, []);
  const getSceneSourceEnd = useCallback((scene: SceneAnalysis) => {
    const sourceStart = scene.original_start_time ?? scene.start_time;
    const rate = (scene as any).playbackRate ?? 1;
    return scene.original_end_time ?? (sourceStart + Math.max(0, scene.end_time - scene.start_time) * rate);
  }, []);

  const getSceneSourceUrl = useCallback((scene: SceneAnalysis) => {
    return scene.sourceMode === 'media' && scene.additionalMedia?.type === 'video' && scene.additionalMedia.url
      ? scene.additionalMedia.url
      : baseVideoUrl;
  }, [baseVideoUrl]);

  const seekStandby = useCallback((incomingSceneId: string, scenes: SceneAnalysis[], sourceTime?: number) => {
    const standby = getStandby();
    if (!standby) return;

    const scene = scenes.find(s => s.id === incomingSceneId);
    if (!scene) return;

    const targetSrc = getSceneSourceUrl(scene);
    if (targetSrc && standby.getAttribute('src') !== targetSrc && standby.currentSrc !== targetSrc) {
      standby.src = targetSrc;
    }

    const targetTime = sourceTime ?? getSceneSourceStart(scene);
    const seekKey = `${incomingSceneId}:${targetSrc}:${targetTime.toFixed(3)}`;
    if (lastStandbySeekRef.current === seekKey) return;
    lastStandbySeekRef.current = seekKey;

    standby.currentTime = Math.max(0, targetTime + 0.02);
  }, [getStandby, getSceneSourceStart, getSceneSourceUrl]);

  const setPhase = useCallback((phase: 'idle' | 'preparing' | 'active' | 'handoff') => {
    phaseRef.current = phase;
    if (transitionPhaseRef) transitionPhaseRef.current = phase;
  }, [transitionPhaseRef]);

  // Build a structural key that ignores pure duration changes
  const structuralKey = useMemo(() => {
    return transitions.map(t => `${t.sceneId}:${t.transitionType}`).join('|');
  }, [transitions]);

  // Reset only on structural changes (type or scene), not duration
  useEffect(() => {
    setPhase('idle');
    lastStandbySeekRef.current = '';
    lastActiveTransitionRef.current = null;
  }, [scenes, structuralKey, setPhase]);

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

        const elapsed = Math.max(0, time - rt.tStart);
        const halfDuration = rt.duration / 2;
        const outgoingScene = scenes.find(s => s.id === rt.outgoingSceneId);
        const incomingScene = scenes.find(s => s.id === rt.incomingSceneId);
        const incomingSourceStart = incomingScene ? getSceneSourceStart(incomingScene) : 0;
        const incomingTransitionStart = rt.placement === 'centered'
          ? Math.max(0, incomingSourceStart - halfDuration)
          : incomingSourceStart;

        seekStandby(rt.incomingSceneId, scenes, incomingTransitionStart);

        if (rt.placement === 'centered' && outgoingScene) {
          const outgoingSrc = getSceneSourceUrl(outgoingScene);
          if (outgoingSrc && active.getAttribute('src') !== outgoingSrc && active.currentSrc !== outgoingSrc) {
            active.src = outgoingSrc;
          }
          const outgoingTransitionStart = Math.max(0, getSceneSourceEnd(outgoingScene) - halfDuration);
          const outgoingRate = (outgoingScene as any).playbackRate ?? 1;
          const expectedOutgoing = outgoingTransitionStart + elapsed * outgoingRate;
          if (wasNotActive || Math.abs(active.currentTime - expectedOutgoing) > 0.25) {
            try { active.currentTime = expectedOutgoing; } catch {}
          }
          if (Math.abs(active.playbackRate - outgoingRate) > 0.01) active.playbackRate = outgoingRate;
          if (active.paused) active.play().catch(() => {});
        } else {
          // Safe edge fallback: hold outgoing clip on its cut frame while the
          // incoming clip plays from its own in-point for the full transition.
          if (outgoingScene) {
            const outgoingSrc = getSceneSourceUrl(outgoingScene);
            if (outgoingSrc && active.getAttribute('src') !== outgoingSrc && active.currentSrc !== outgoingSrc) {
              active.src = outgoingSrc;
            }
          }
          const outgoingHoldTime = Math.max(0, rt.originalBoundary - 1 / 60);
          if (wasNotActive || Math.abs(active.currentTime - outgoingHoldTime) > 0.08) {
            try { active.currentTime = outgoingHoldTime; } catch {}
          }
          if (!active.paused) active.pause();
        }

        if (incomingScene) {
          const incomingRate = (incomingScene as any).playbackRate ?? 1;
          const expectedTime = incomingTransitionStart + elapsed * incomingRate + 0.02;
          if (wasNotActive || Math.abs(standby.currentTime - expectedTime) > 0.25) {
            try { standby.currentTime = expectedTime; } catch {}
          }
          if (Math.abs(standby.playbackRate - incomingRate) > 0.01) {
            standby.playbackRate = incomingRate;
          }
        }

        // Start/keep playing incoming layer during the transition.
        if (standby.paused) {
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
        // Keep the A/B transition layer above media/image/blackscreen overlays.
        // Otherwise added clips can cover the prepared transition videos and the
        // user only sees a hard cut at the boundary.
        active.style.zIndex = '10';

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
        standby.style.zIndex = '11';

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
          const outgoingScene = scenes.find(s => s.id === rt.outgoingSceneId);
          const incomingScene = scenes.find(s => s.id === rt.incomingSceneId);

          // For uploaded/library clips the visible media overlay is not the
          // same element as the transition A/B slot. Pre-bind the outgoing slot
          // before the cut so an edge transition can hold the real last frame
          // instead of flashing black or looking like a normal jump cut.
          if (outgoingScene?.sourceMode === 'media' && outgoingScene.additionalMedia?.type === 'video') {
            const outgoingSrc = getSceneSourceUrl(outgoingScene);
            const outgoingPreTime = rt.placement === 'centered'
              ? Math.max(0, getSceneSourceEnd(outgoingScene) - rt.duration / 2)
              : Math.max(0, rt.originalBoundary - 1 / 60);
            if (outgoingSrc && active.getAttribute('src') !== outgoingSrc && active.currentSrc !== outgoingSrc) {
              active.src = outgoingSrc;
            }
            try { active.currentTime = outgoingPreTime; } catch {}
            if (!active.paused) active.pause();
            active.style.opacity = '0';
          }

          const preSeekTime = incomingScene
            ? rt.placement === 'centered'
              ? Math.max(0, getSceneSourceStart(incomingScene) - rt.duration / 2)
              : getSceneSourceStart(incomingScene)
            : undefined;
          seekStandby(rt.incomingSceneId, scenes, preSeekTime);
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
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, videoRefA, videoRefB, baseVideoUrl, canvasRef, videoFilterRef, frameCacheRef, seekStandby, computeFilterForTimeRef, lastHandoffBoundaryRef, setPhase, getActive, getStandby, activeSlotRef, getSceneSourceStart, getSceneSourceEnd, getSceneSourceUrl]);
}

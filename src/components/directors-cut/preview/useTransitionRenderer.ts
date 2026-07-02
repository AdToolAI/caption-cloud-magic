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
  resetTransitionStateRef?: React.MutableRefObject<(() => void) | null>,
  isPlayingRef?: React.MutableRefObject<boolean>,
) {
  const rafRef = useRef<number>();
  const phaseRef = useRef<'idle' | 'preparing' | 'active' | 'handoff'>('idle');
  const lastStandbySeekRef = useRef<string>('');
  // After a handoff we want to hide the old outgoing slot ONE RAF frame later,
  // so the incoming slot has definitely painted its first pixel. Without this
  // overlap frame the browser briefly shows the wrapper's black background
  // between "outgoing → opacity 0" and "incoming → first painted frame".
  const pendingHideRef = useRef<HTMLVideoElement | null>(null);

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
    pendingHideRef.current = null;
  }, [scenes, structuralKey, setPhase]);

  // Expose a reset function so the outer player can wipe stale state on
  // replay / natural end. Without this the internal phase/seek markers can
  // survive across playbacks and freeze the visible slot on scene 2.
  useEffect(() => {
    if (!resetTransitionStateRef) return;
    resetTransitionStateRef.current = () => {
      phaseRef.current = 'idle';
      if (transitionPhaseRef) transitionPhaseRef.current = 'idle';
      lastStandbySeekRef.current = '';
      lastActiveTransitionRef.current = null;
      pendingHideRef.current = null;
    };
    return () => {
      if (resetTransitionStateRef) resetTransitionStateRef.current = null;
    };
  }, [resetTransitionStateRef, transitionPhaseRef]);

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
          if (isPlayingRef?.current !== false) {
            if (active.paused) active.play().catch(() => {});
          } else if (!active.paused) {
            active.pause();
          }
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

        // Start/keep playing incoming layer during the transition — but only if
        // the user hasn't paused the player. Otherwise the RAF loop would keep
        // resurrecting playback whenever pause is pressed mid-transition.
        if (isPlayingRef?.current !== false) {
          if (standby.paused) standby.play().catch(() => {});
        } else if (!standby.paused) {
          standby.pause();
        }

        const styles = getTransitionStyles({
          progress,
          baseType: rt.baseType,
          direction: rt.direction,
          sceneIndex: rt.sceneIndex,
          transitionDuration: rt.duration,
        });

        // Apply active (outgoing) styles — layout comes from className.
        // Only manage visual/effect properties + z-index for stacking.
        active.style.zIndex = '10';

        const activeTransitionFilter = (styles.baseStyle as any).filter || '';
        active.style.opacity = styles.baseStyle.opacity != null ? String(styles.baseStyle.opacity) : '1';
        active.style.transform = styles.baseStyle.transform || 'none';
        active.style.clipPath = styles.baseStyle.clipPath || 'none';
        active.style.filter = [syncFilter, activeTransitionFilter].filter(Boolean).join(' ') || 'none';

        // Apply standby (incoming) styles
        standby.style.pointerEvents = 'auto';
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
        // The standby video is already playing at the correct position for the
        // new scene. Swap roles: standby becomes active, active becomes standby.
        //
        // IMPORTANT: We keep BOTH slots absolutely positioned (that comes from
        // the JSX `absolute inset-0` class) — do NOT clear `position/inset/
        // width/height/objectFit/zIndex` here. Clearing them triggers a reflow
        // and for one frame no <video> fills the viewport, exposing the
        // wrapper's black background as a visible flicker.

        // 1. Show the new active (was standby) FIRST so its pixels are on
        //    screen before we touch the outgoing slot. Raise its z-index above
        //    the outgoing slot so nothing can occlude it during the overlap.
        standby.style.opacity = '1';
        standby.style.pointerEvents = 'auto';
        standby.style.transform = 'none';
        standby.style.clipPath = 'none';
        standby.style.filter = syncFilter || '';
        standby.style.zIndex = '12';

        // 2. Pause the old active — it becomes the new standby.
        if (!active.paused) active.pause();
        active.style.pointerEvents = 'none';
        active.style.transform = 'none';
        active.style.clipPath = 'none';
        active.style.filter = 'none';
        // Drop its z-index BELOW the new active so it can't occlude anything
        // even for the overlap frame. Opacity stays until pendingHideRef fades it.
        active.style.zIndex = '9';
        pendingHideRef.current = active;

        // 3. Swap the slot reference
        if (activeSlotRef) {
          activeSlotRef.current = activeSlotRef.current === 'A' ? 'B' : 'A';
        }

        // 4. Mark boundary as consumed
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

      // === Deferred hide from previous handoff: fade the old outgoing slot
      // out one frame AFTER the incoming slot became visible. This guarantees
      // no black flicker between the transition end and the new scene paint.
      if (pendingHideRef.current && pendingHideRef.current !== active) {
        pendingHideRef.current.style.opacity = '0';
        pendingHideRef.current = null;
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
          // Also make sure standby is paused during pre-seek if the user paused.
          if (isPlayingRef?.current === false && !standby.paused) standby.pause();
          active.style.opacity = '1';
          active.style.transform = 'none';
          active.style.clipPath = 'none';
          active.style.filter = syncFilter || '';

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
        standby.style.zIndex = '';
        lastStandbySeekRef.current = '';
        setPhase('idle');
      }

      // Active normal styles — layout is class-driven; only touch visuals.
      active.style.opacity = '1';
      active.style.transform = 'none';
      active.style.clipPath = 'none';
      active.style.filter = syncFilter || '';
      active.style.zIndex = '';

      // If the user paused mid-tick, make sure both slots really stay paused.
      if (isPlayingRef?.current === false) {
        if (!active.paused) active.pause();
        if (!standby.paused) standby.pause();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, resolvedTransitions, visualTimeRef, videoRefA, videoRefB, baseVideoUrl, canvasRef, videoFilterRef, frameCacheRef, seekStandby, computeFilterForTimeRef, lastHandoffBoundaryRef, setPhase, getActive, getStandby, activeSlotRef, getSceneSourceStart, getSceneSourceEnd, getSceneSourceUrl, isPlayingRef]);
}

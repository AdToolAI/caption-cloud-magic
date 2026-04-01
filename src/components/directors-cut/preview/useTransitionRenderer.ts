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
 * Dual-video CSS transition renderer with phase-based lifecycle:
 *   idle       → far from any transition, incoming hidden
 *   preparing  → within pre-seek window, incoming seeked but PAUSED and invisible
 *   active     → transition in progress, incoming playing, styles applied
 *   handoff    → transition ended, both videos frozen while base syncs to incoming's frame
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
  lastHandoffBoundaryRef?: React.MutableRefObject<HandoffBoundaryMarker | null>,
  transitionPhaseRef?: React.MutableRefObject<'idle' | 'preparing' | 'active' | 'handoff'>,
) {
  const rafRef = useRef<number>();
  const phaseRef = useRef<'idle' | 'preparing' | 'active' | 'handoff'>('idle');
  const lastIncomingSeekRef = useRef<string>('');
  
  // Handoff state
  const handoffTargetTimeRef = useRef<number | null>(null);
  const handoffFrameCountRef = useRef(0);
  const handoffBaseSeekedRef = useRef(false);
  const handoffFramePresentedRef = useRef(false);
  const HANDOFF_MAX_FRAMES = 60;
  
  // Track last active transition for structured boundary marking
  const lastActiveTransitionRef = useRef<{ outgoingSceneId: string; incomingSceneId: string; tEnd: number; originalBoundary: number; offsetSeconds: number } | null>(null);

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

  const setPhase = useCallback((phase: 'idle' | 'preparing' | 'active' | 'handoff') => {
    phaseRef.current = phase;
    if (transitionPhaseRef) transitionPhaseRef.current = phase;
  }, [transitionPhaseRef]);

  // Reset on scenes/transitions change
  useEffect(() => {
    setPhase('idle');
    lastIncomingSeekRef.current = '';
    handoffTargetTimeRef.current = null;
    handoffFrameCountRef.current = 0;
    handoffBaseSeekedRef.current = false;
    handoffFramePresentedRef.current = false;
    lastActiveTransitionRef.current = null;
  }, [scenes, transitions, setPhase]);

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

    const PRE_SEEK_WINDOW = 0.8;

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      const base = baseVideoRef.current;
      const incoming = incomingVideoRef.current;
      if (!base || !incoming) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (canvas) canvas.style.display = 'none';

      const syncFilter = computeFilterForTimeRef?.current
        ? computeFilterForTimeRef.current(time)
        : (videoFilterRef.current || '');

      // Mirror playbackRate during active phase
      if (phaseRef.current === 'active') {
        if (Math.abs(incoming.playbackRate - base.playbackRate) > 0.01) {
          incoming.playbackRate = base.playbackRate;
        }
      }

      // === PRIORITY 1: ACTIVE TRANSITION ===
      const active = findActiveTransition(time, resolvedTransitions);
      if (active) {
        const { transition: rt, progress } = active;
        
        // Abort any stuck handoff
        if (phaseRef.current === 'handoff') {
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
          handoffBaseSeekedRef.current = false;
          handoffFramePresentedRef.current = false;
        }
        
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

        seekIncoming(rt.incomingSceneId, scenes);

        // Start playing incoming ONLY when entering active phase
        if (incoming.paused) {
          if (wasNotActive) {
            // Sync incoming to correct position before playing
            const incomingScene = scenes.find(s => s.id === rt.incomingSceneId);
            if (incomingScene) {
              const sourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
              const expectedTime = sourceStart + 0.05;
              if (Math.abs(incoming.currentTime - expectedTime) > 0.1) {
                incoming.currentTime = expectedTime;
              }
            }
          }
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

      // === PRIORITY 2: FREEZE phase (offset > 0) ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        if (phaseRef.current === 'handoff') {
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
          handoffBaseSeekedRef.current = false;
          handoffFramePresentedRef.current = false;
        }
        
        setPhase('preparing');
        base.style.opacity = '1';
        base.style.transform = '';
        base.style.clipPath = '';
        base.style.filter = syncFilter || '';
        incoming.style.opacity = '0';
        incoming.style.pointerEvents = 'none';
        // Pre-seek but keep paused — don't play during freeze
        seekIncoming(freezeRT.incomingSceneId, scenes);
        // Do NOT play incoming here — it stays paused until active
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 3: HANDOFF phase ===
      if (phaseRef.current === 'handoff') {
        handoffFrameCountRef.current++;
        
        // Safety init if targetTime wasn't set
        if (handoffTargetTimeRef.current === null) {
          if (!incoming.paused) incoming.pause();
          handoffTargetTimeRef.current = incoming.currentTime;
          handoffBaseSeekedRef.current = false;
          handoffFramePresentedRef.current = false;
          
          // Pause base during handoff to prevent it from drifting
          if (!base.paused) base.pause();
          
          const diff = Math.abs(base.currentTime - handoffTargetTimeRef.current);
          if (diff > 0.02) {
            base.addEventListener('seeked', () => { handoffBaseSeekedRef.current = true; }, { once: true });
            base.currentTime = handoffTargetTimeRef.current;
          } else {
            handoffBaseSeekedRef.current = true;
          }
        }

        const targetTime = handoffTargetTimeRef.current;
        const timeDiff = Math.abs(base.currentTime - targetTime);
        const baseReady = base.readyState >= 2;
        const seekConfirmed = handoffBaseSeekedRef.current;
        
        // Wait for frame to be presented after seek
        if (seekConfirmed && !handoffFramePresentedRef.current) {
          if ('requestVideoFrameCallback' in base) {
            (base as any).requestVideoFrameCallback(() => {
              handoffFramePresentedRef.current = true;
            });
          } else {
            // Fallback: trust seeked + 1 RAF
            handoffFramePresentedRef.current = true;
          }
        }
        
        // Complete handoff when:
        // 1. Seek confirmed + frame presented + ready + time close (0.05 tolerance)
        // 2. OR safety fallback
        const isReady = (seekConfirmed && handoffFramePresentedRef.current && baseReady && timeDiff < 0.05) || 
                        handoffFrameCountRef.current >= HANDOFF_MAX_FRAMES;

        if (isReady) {
          // Swap: hide incoming, show base
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
          
          // Mark boundary as consumed using REAL boundary time (not handoff target)
          if (lastHandoffBoundaryRef && lastActiveTransitionRef.current) {
            lastHandoffBoundaryRef.current = {
              outgoingSceneId: lastActiveTransitionRef.current.outgoingSceneId,
              incomingSceneId: lastActiveTransitionRef.current.incomingSceneId,
              boundarySourceTime: lastActiveTransitionRef.current.originalBoundary + lastActiveTransitionRef.current.offsetSeconds,
            };
          }
          
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
          handoffBaseSeekedRef.current = false;
          handoffFramePresentedRef.current = false;

          if (transitionCooldownRef) {
            transitionCooldownRef.current = 30;
          }

          // Resume base playback after swap
          if (base.paused) base.play().catch(() => {});

          setPhase('idle');
        } else {
          // Keep incoming visible (frozen) while base catches up
          incoming.style.opacity = '1';
          incoming.style.pointerEvents = 'none';
          incoming.style.transform = '';
          incoming.style.clipPath = '';
          incoming.style.filter = syncFilter || '';
        }

        // Base hidden during handoff
        base.style.opacity = isReady ? '1' : '0';
        base.style.transform = 'none';
        base.style.clipPath = 'none';
        base.style.filter = syncFilter || '';
        base.style.position = '';
        base.style.inset = '';
        base.style.zIndex = '';

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 4: PRE-SEEK (preparing) ===
      for (const rt of resolvedTransitions) {
        if (time >= rt.tStart - PRE_SEEK_WINDOW && time < rt.tStart) {
          setPhase('preparing');
          seekIncoming(rt.incomingSceneId, scenes);
          incoming.style.opacity = '0';
          incoming.style.pointerEvents = 'none';
          // Do NOT play incoming — keep it paused, just pre-seeked
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

      // === PRIORITY 5: IDLE ===
      // If we were active, start handoff IMMEDIATELY in the same tick
      if (phaseRef.current === 'active') {
        setPhase('handoff');
        handoffFrameCountRef.current = 0;
        handoffBaseSeekedRef.current = false;
        handoffFramePresentedRef.current = false;
        
        // Freeze BOTH videos immediately
        if (!incoming.paused) incoming.pause();
        if (!base.paused) base.pause();
        
        // Snapshot the frozen incoming time as sync target
        handoffTargetTimeRef.current = incoming.currentTime;
        
        // Initiate base seek to the frozen target
        const diff = Math.abs(base.currentTime - handoffTargetTimeRef.current);
        if (diff > 0.02) {
          base.addEventListener('seeked', () => { handoffBaseSeekedRef.current = true; }, { once: true });
          base.currentTime = handoffTargetTimeRef.current;
        } else {
          handoffBaseSeekedRef.current = true;
        }
        
        // Keep incoming visible while handoff processes
        incoming.style.opacity = '1';
        incoming.style.pointerEvents = 'none';
        incoming.style.transform = '';
        incoming.style.clipPath = '';
        incoming.style.filter = syncFilter || '';
        
        // Hide base during handoff
        base.style.opacity = '0';
        base.style.transform = 'none';
        base.style.clipPath = 'none';
        base.style.filter = syncFilter || '';
        base.style.position = '';
        base.style.inset = '';
        base.style.zIndex = '';

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // If we were preparing (but never went active), just clean up
      if (phaseRef.current === 'preparing') {
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
        setPhase('idle');
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
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, incomingVideoRef, canvasRef, videoFilterRef, frameCacheRef, seekIncoming, computeFilterForTimeRef, lastHandoffBoundaryRef, setPhase]);
}

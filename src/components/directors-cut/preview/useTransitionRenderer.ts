import { useEffect, useRef, useMemo, useCallback } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';
import { getTransitionStyles } from './NativeTransitionLayer';

/**
 * Dual-video CSS transition renderer with phase-based lifecycle:
 *   idle       → far from any transition, incoming hidden
 *   preparing  → within pre-seek window, incoming seeked & playing but invisible
 *   active     → transition in progress, styles applied
 *   handoff    → transition ended, incoming stays visible while base syncs
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
  lastHandoffBoundaryRef?: React.MutableRefObject<number | null>,
) {
  const rafRef = useRef<number>();
  const phaseRef = useRef<'idle' | 'preparing' | 'active' | 'handoff'>('idle');
  const lastIncomingSeekRef = useRef<string>('');
  
  // Handoff: snapshot-based approach
  const handoffTargetTimeRef = useRef<number | null>(null);
  const handoffFrameCountRef = useRef(0);
  const handoffBaseSeekedRef = useRef(false);
  const handoffIncomingPausedRef = useRef(false);
  const HANDOFF_MAX_FRAMES = 60; // ~1s safety fallback
  
  // Track last active transition for structured boundary marking
  const lastActiveTransitionRef = useRef<{ outgoingSceneId: string; incomingSceneId: string; tEnd: number } | null>(null);

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

  // When scenes or transitions change, reset phase
  useEffect(() => {
    phaseRef.current = 'idle';
    lastIncomingSeekRef.current = '';
    handoffTargetTimeRef.current = null;
    handoffFrameCountRef.current = 0;
    handoffBaseSeekedRef.current = false;
    handoffIncomingPausedRef.current = false;
    lastActiveTransitionRef.current = null;
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

    const PRE_SEEK_WINDOW = 0.8;

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

      // Mirror playbackRate from base to incoming during non-idle phases
      if (phaseRef.current !== 'idle') {
        if (Math.abs(incoming.playbackRate - base.playbackRate) > 0.01) {
          incoming.playbackRate = base.playbackRate;
        }
      }

      // === PRIORITY 1: Check for ACTIVE TRANSITION first ===
      // This ensures a new transition always preempts a stuck handoff
      const active = findActiveTransition(time, resolvedTransitions);
      if (active) {
        const { transition: rt, progress } = active;
        
        // If we were in handoff, abort it cleanly
        if (phaseRef.current === 'handoff') {
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
          handoffBaseSeekedRef.current = false;
          handoffIncomingPausedRef.current = false;
        }
        
        // Track the currently active transition for structured boundary marking
        lastActiveTransitionRef.current = {
          outgoingSceneId: rt.outgoingSceneId,
          incomingSceneId: rt.incomingSceneId,
          tEnd: rt.tEnd,
        };
        
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

      // === PRIORITY 2: FREEZE phase (offset > 0) ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT) {
        // If we were in handoff, abort it
        if (phaseRef.current === 'handoff') {
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
        }
        
        phaseRef.current = 'preparing';
        base.style.opacity = '1';
        base.style.transform = '';
        base.style.clipPath = '';
        base.style.filter = syncFilter || '';
        incoming.style.opacity = '0';
        incoming.style.pointerEvents = 'none';
        seekIncoming(freezeRT.incomingSceneId, scenes);
        if (incoming.paused) {
          incoming.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // === PRIORITY 3: HANDOFF phase ===
      if (phaseRef.current === 'handoff') {
        handoffFrameCountRef.current++;
        
        // First frame of handoff: freeze incoming and initiate base seek
        if (handoffTargetTimeRef.current === null) {
          // FREEZE incoming immediately — this is the key fix
          // The incoming video must stop advancing so the visible frame stays stable
          if (!incoming.paused) {
            incoming.pause();
          }
          handoffIncomingPausedRef.current = true;
          
          // Snapshot the frozen incoming time as our sync target
          handoffTargetTimeRef.current = incoming.currentTime;
          handoffBaseSeekedRef.current = false;
          
          // Initiate base seek to the frozen target
          const diff = Math.abs(base.currentTime - handoffTargetTimeRef.current);
          if (diff > 0.02) {
            // Listen for the real seeked event
            const onSeeked = () => {
              handoffBaseSeekedRef.current = true;
            };
            base.addEventListener('seeked', onSeeked, { once: true });
            base.currentTime = handoffTargetTimeRef.current;
          } else {
            // Already close enough
            handoffBaseSeekedRef.current = true;
          }
        }

        const targetTime = handoffTargetTimeRef.current;
        const timeDiff = Math.abs(base.currentTime - targetTime);
        const baseReady = base.readyState >= 2;
        const seekConfirmed = handoffBaseSeekedRef.current;
        
        // Complete handoff only when:
        // 1. Base has confirmed seeked event + readyState >= 2 + time is close
        // 2. OR safety fallback after max frames
        const isReady = (seekConfirmed && baseReady && timeDiff < 0.1) || 
                        handoffFrameCountRef.current >= HANDOFF_MAX_FRAMES;

        if (isReady) {
          // Sync base to play from the exact target time
          if (timeDiff > 0.02) {
            base.currentTime = targetTime;
          }
          
          // Now swap: hide incoming, show base
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
          
          // Mark this boundary as consumed using structured data
          if (lastHandoffBoundaryRef && lastActiveTransitionRef.current) {
            // Store the outgoing scene ID as a string marker
            // The player will match on this exact scene ID
            lastHandoffBoundaryRef.current = targetTime;
          }
          
          handoffTargetTimeRef.current = null;
          handoffFrameCountRef.current = 0;
          handoffBaseSeekedRef.current = false;
          handoffIncomingPausedRef.current = false;

          if (transitionCooldownRef) {
            transitionCooldownRef.current = 30;
          }

          phaseRef.current = 'idle';
        } else {
          // Keep incoming visible (frozen) while base catches up
          incoming.style.opacity = '1';
          incoming.style.pointerEvents = 'none';
          incoming.style.transform = '';
          incoming.style.clipPath = '';
          incoming.style.filter = syncFilter || '';
        }

        // Base styles during handoff — hidden behind incoming
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
          phaseRef.current = 'preparing';
          seekIncoming(rt.incomingSceneId, scenes);
          incoming.style.opacity = '0';
          incoming.style.pointerEvents = 'none';
          if (incoming.paused) {
            incoming.play().catch(() => {});
          }
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
      // If we were active, enter handoff instead of going directly to idle
      if (phaseRef.current === 'active') {
        phaseRef.current = 'handoff';
        handoffTargetTimeRef.current = null;
        handoffFrameCountRef.current = 0;
        // Don't clean up incoming yet — handoff handler will do it
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
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, incomingVideoRef, canvasRef, videoFilterRef, frameCacheRef, seekIncoming, computeFilterForTimeRef, lastHandoffBoundaryRef]);
}

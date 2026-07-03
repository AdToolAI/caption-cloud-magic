import { useMemo, useRef, useEffect, useState } from 'react';
import { resolveTransitions, findActiveTransition } from '@/utils/transitionResolver';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { easeTransition } from '@/lib/directors-cut/transitionEasing';

interface NativeTransitionOverlayProps {
  currentTime: number;
  visualTimeRef?: React.RefObject<number>;
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  videoUrl?: string;
}

const PREROLL_SECONDS = 1.2;

/**
 * CapCut-style dual-video transition overlay.
 *
 * Instead of blending a still-frame JPEG of the incoming scene over the
 * primary video (old behaviour), we mount a second hidden <video> element
 * playing the same source and seek it to the incoming scene ~1s before the
 * transition starts. During the transition window both videos play at the
 * same time and are GPU-blended via opacity/transform/clip-path — matching
 * the behaviour of professional NLEs.
 *
 * NO backdropFilter — only filter/opacity/clipPath/transform on GPU layers.
 */
export function NativeTransitionOverlay({
  currentTime,
  visualTimeRef,
  scenes,
  transitions,
  videoUrl,
}: NativeTransitionOverlayProps) {
  const incomingVideoRef = useRef<HTMLVideoElement | null>(null);
  const primedSceneIdRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);

  const [smoothTime, setSmoothTime] = useState(currentTime);
  const smoothRafRef = useRef<number>();

  // rAF loop reading visualTimeRef for smooth 60 fps progress
  useEffect(() => {
    const tick = () => {
      const t = visualTimeRef?.current ?? currentTime;
      setSmoothTime(t);
      smoothRafRef.current = requestAnimationFrame(tick);
    };
    smoothRafRef.current = requestAnimationFrame(tick);
    return () => { if (smoothRafRef.current) cancelAnimationFrame(smoothRafRef.current); };
  }, [currentTime, visualTimeRef]);

  const time = smoothTime;

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions as any),
    [scenes, transitions],
  );

  // Find the transition window we're either inside or approaching
  const activeOrUpcoming = useMemo(() => {
    if (resolvedTransitions.length === 0) return null;
    // Active first
    const active = findActiveTransition(time, resolvedTransitions);
    if (active) return { rt: active.transition, progress: active.progress, active: true };
    // Upcoming within preroll window
    for (const rt of resolvedTransitions) {
      const delta = rt.tStart - time;
      if (delta > 0 && delta <= PREROLL_SECONDS) {
        return { rt, progress: 0, active: false };
      }
    }
    return null;
  }, [time, resolvedTransitions]);

  // Prime the incoming video: seek to its source-start and pause
  useEffect(() => {
    const video = incomingVideoRef.current;
    if (!video || !activeOrUpcoming) {
      primedSceneIdRef.current = null;
      return;
    }
    const incomingSceneId = activeOrUpcoming.rt.incomingSceneId;
    if (primedSceneIdRef.current === incomingSceneId) return;

    const incomingScene = scenes.find(s => s.id === incomingSceneId);
    if (!incomingScene) return;

    const sourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
    try {
      video.pause();
      video.currentTime = Math.max(0, sourceStart);
      primedSceneIdRef.current = incomingSceneId;
    } catch { /* seek races are OK — we retry next frame */ }
  }, [activeOrUpcoming, scenes]);

  // Play / pause incoming video based on active state
  useEffect(() => {
    const video = incomingVideoRef.current;
    if (!video) return;
    const isActive = !!activeOrUpcoming?.active;
    if (isActive && !wasActiveRef.current) {
      video.play().catch(() => { /* autoplay blocked — ok, will show static frame */ });
      wasActiveRef.current = true;
    } else if (!isActive && wasActiveRef.current) {
      video.pause();
      wasActiveRef.current = false;
    }
  }, [activeOrUpcoming]);

  if (!activeOrUpcoming || !activeOrUpcoming.active) {
    // Keep the hidden <video> mounted (primed) but invisible so it can play
    // instantly when the transition starts. Only render when we have a URL.
    if (!videoUrl) return null;
    return (
      <video
        ref={incomingVideoRef}
        src={videoUrl}
        muted
        playsInline
        preload="auto"
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-0"
        style={{ willChange: 'opacity, transform, filter, clip-path' }}
      />
    );
  }

  const rawProgress = activeOrUpcoming.progress;
  const progress = easeTransition(rawProgress);
  const { rt } = activeOrUpcoming;
  const baseType = rt.baseType;
  const direction = rt.direction || 'left';

  // Style for the incoming video during transition
  const getIncomingStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      willChange: 'opacity, transform, filter, clip-path',
    };
    switch (baseType) {
      case 'crossfade':
      case 'dissolve':
        return { ...base, opacity: progress };
      case 'fade':
        return { ...base, opacity: progress > 0.5 ? (progress - 0.5) * 2 : 0 };
      case 'blur':
        return { ...base, opacity: progress, filter: `blur(${(1 - progress) * 8}px)` };
      case 'wipe': {
        const p = progress * 100;
        let clipPath = '';
        if (direction === 'left') clipPath = `inset(0 ${100 - p}% 0 0)`;
        else if (direction === 'right') clipPath = `inset(0 0 0 ${100 - p}%)`;
        else if (direction === 'up') clipPath = `inset(0 0 ${100 - p}% 0)`;
        else clipPath = `inset(${100 - p}% 0 0 0)`;
        return { ...base, opacity: 1, clipPath };
      }
      case 'slide':
      case 'push': {
        let transform = '';
        if (direction === 'left') transform = `translateX(${(1 - progress) * 100}%)`;
        else if (direction === 'right') transform = `translateX(${-(1 - progress) * 100}%)`;
        else if (direction === 'up') transform = `translateY(${(1 - progress) * 100}%)`;
        else transform = `translateY(${-(1 - progress) * 100}%)`;
        return { ...base, opacity: 1, transform };
      }
      case 'zoom':
        return { ...base, opacity: progress, transform: `scale(${1 + (1 - progress) * 0.3})` };
      default:
        return { ...base, opacity: progress };
    }
  };

  // Small darkening overlay for fade (keeps existing look)
  const getEffectStyle = (): React.CSSProperties => {
    switch (baseType) {
      case 'fade':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.5})` };
      default:
        return {};
    }
  };

  return (
    <>
      {/* Optional darken pass (only really used for 'fade') */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={getEffectStyle()}
      />
      {/* Real incoming video, GPU-blended */}
      <video
        ref={incomingVideoRef}
        src={videoUrl}
        muted
        playsInline
        preload="auto"
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[6]"
        style={getIncomingStyle()}
      />
    </>
  );
}

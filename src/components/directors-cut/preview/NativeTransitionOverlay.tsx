import { useMemo, useRef, useEffect, useState } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

interface NativeTransitionOverlayProps {
  currentTime: number;
  visualTimeRef?: React.RefObject<number>;
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  videoUrl?: string;
}

const TRANSITION_DURATION = 0.8;
const MIN_TRANSITION_DURATION = 0.6;

/**
 * Lightweight CSS transition overlay for native <video> preview.
 * Pre-captures the first frame of each scene and cross-fades / wipes it
 * over the current video during transition boundaries.
 * 
 * NO backdropFilter — only filter/opacity/clipPath/transform.
 */
export function NativeTransitionOverlay({
  currentTime,
  visualTimeRef,
  scenes,
  transitions,
  videoUrl,
}: NativeTransitionOverlayProps) {
  const [nextFrameCache, setNextFrameCache] = useState<Record<string, string>>({});
  const capturedRef = useRef<Set<string>>(new Set());
  const [smoothTime, setSmoothTime] = useState(currentTime);
  const smoothRafRef = useRef<number>();

  // Own rAF loop reading visualTimeRef at 60fps for fluid transitions
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

  // Pre-capture the first frame of each scene (except the first)
  useEffect(() => {
    if (!videoUrl || scenes.length < 2) return;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    const capture = async () => {
      await new Promise<void>((res) => {
        video.onloadeddata = () => res();
        if (video.readyState >= 2) res();
      });

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frames: Record<string, string> = {};
      for (let i = 1; i < scenes.length; i++) {
        const incomingScene = scenes[i];
        const sceneId = incomingScene.id;
        if (capturedRef.current.has(sceneId)) continue;

        // Use original source time (not timeline time) for correct frame capture
        const sourceStart = incomingScene.original_start_time ?? incomingScene.start_time;
        const captureTime = Math.max(0, sourceStart + 0.02);

        try {
          video.currentTime = captureTime;
          await new Promise<void>((resolve) => {
            video.addEventListener('seeked', () => resolve(), { once: true });
          });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames[sceneId] = canvas.toDataURL('image/jpeg', 0.6);
          capturedRef.current.add(sceneId);
        } catch (e) { console.warn('Frame capture failed for scene', sceneId, e); }
      }
      if (Object.keys(frames).length > 0) {
        setNextFrameCache((prev) => ({ ...prev, ...frames }));
      }
    };

    capture().catch(() => {});
    return () => { video.src = ''; };
  }, [videoUrl, scenes]);

  const overlayInfo = useMemo(() => {
    if (scenes.length < 2 || transitions.length === 0) return null;

    for (let i = 0; i < scenes.length - 1; i++) {
      const scene = scenes[i];
      const transition = transitions.find(t => t.sceneId === scene.id);
      if (!transition || transition.transitionType === 'none') continue;

      const transitionDuration = Math.max(MIN_TRANSITION_DURATION, transition.duration || TRANSITION_DURATION);
      const leadIn = transitionDuration * 0.05;
      const leadOut = transitionDuration * 0.95;
      const transitionStart = scene.end_time - leadIn;
      const transitionEnd = scene.end_time + leadOut;

      if (time >= transitionStart && time < transitionEnd) {
        const rawProgress = (time - transitionStart) / transitionDuration;
        // Power-based easing for more visible effect
        const progress = Math.pow(0.5 - 0.5 * Math.cos(rawProgress * Math.PI), 0.7);
        const baseType = transition.transitionType.split('-')[0].toLowerCase();
        const nextScene = scenes[i + 1];
        return { progress, rawProgress, baseType, nextSceneId: nextScene.id, transition };
      }
    }
    return null;
  }, [time, scenes, transitions]);

  if (!overlayInfo) return null;

  const { progress, baseType, nextSceneId } = overlayInfo;
  const nextFrame = nextFrameCache[nextSceneId];

  // Effect overlay (darken during transition — no blur)
  const getEffectStyle = (): React.CSSProperties => {
    switch (baseType) {
      case 'crossfade':
      case 'dissolve':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.1})` };
      case 'fade':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.5})` };
      case 'blur':
        return {}; // blur applied via filter on overlay, not backdrop
      case 'zoom':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.15})` };
      default:
        return {};
    }
  };

  // Next-frame overlay style
  const getNextFrameStyle = (): React.CSSProperties => {
    const bgBase: React.CSSProperties = nextFrame
      ? {
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        }
      : { backgroundColor: '#000' };

    switch (baseType) {
      case 'crossfade':
      case 'dissolve':
        return { ...bgBase, opacity: progress };
      case 'fade':
        return { ...bgBase, opacity: progress > 0.5 ? (progress - 0.5) * 2 : 0 };
      case 'blur':
        return { ...bgBase, opacity: progress, filter: `blur(${(1 - progress) * 8}px)` };
      case 'wipe': {
        const dir = overlayInfo.transition.transitionType.split('-')[1] || 'left';
        let clipPath = '';
        const p = progress * 100;
        if (dir === 'left') clipPath = `inset(0 ${100 - p}% 0 0)`;
        else if (dir === 'right') clipPath = `inset(0 0 0 ${100 - p}%)`;
        else if (dir === 'up') clipPath = `inset(0 0 ${100 - p}% 0)`;
        else clipPath = `inset(${100 - p}% 0 0 0)`;
        return { ...bgBase, opacity: 1, clipPath };
      }
      case 'slide':
      case 'push': {
        const dir = overlayInfo.transition.transitionType.split('-')[1] || 'left';
        let transform = '';
        if (dir === 'left') transform = `translateX(${(1 - progress) * 100}%)`;
        else if (dir === 'right') transform = `translateX(${-(1 - progress) * 100}%)`;
        else if (dir === 'up') transform = `translateY(${(1 - progress) * 100}%)`;
        else transform = `translateY(${-(1 - progress) * 100}%)`;
        return { ...bgBase, opacity: 1, transform };
      }
      case 'zoom':
        return { ...bgBase, opacity: progress, transform: `scale(${1 + (1 - progress) * 0.3})` };
      default:
        return { ...bgBase, opacity: progress };
    }
  };

  return (
    <>
      {/* Dark overlay during transition */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={getEffectStyle()}
      />
      {/* Incoming scene frame */}
      <div
        className="absolute inset-0 pointer-events-none z-[6]"
        style={getNextFrameStyle()}
      />
    </>
  );
}

import { useMemo, useRef, useEffect, useState } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

interface NativeTransitionOverlayProps {
  currentTime: number;
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
  videoUrl?: string;
}

/**
 * Enhanced CSS transition overlay for native <video> preview.
 * Captures the next scene's first frame and cross-fades / wipes it
 * over the current video during transition boundaries.
 */
export function NativeTransitionOverlay({
  currentTime,
  scenes,
  transitions,
  videoUrl,
}: NativeTransitionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nextFrameCache, setNextFrameCache] = useState<Record<number, string>>({});
  const capturedRef = useRef<Set<number>>(new Set());

  // Pre-capture the first frame of each scene (except the first)
  useEffect(() => {
    if (!videoUrl || scenes.length < 2) return;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.src = videoUrl;

    const capture = async () => {
      await new Promise<void>((res) => {
        video.onloadeddata = () => res();
        if (video.readyState >= 2) res();
      });

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const frames: Record<number, string> = {};
      for (let i = 1; i < scenes.length; i++) {
        if (capturedRef.current.has(i)) continue;
        try {
          video.currentTime = scenes[i].start_time + 0.05;
          await new Promise<void>((r) => { video.onseeked = () => r(); });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames[i] = canvas.toDataURL('image/jpeg', 0.5);
          capturedRef.current.add(i);
        } catch { /* skip */ }
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

      const transitionDuration = transition.duration || 0.5;
      const transitionStart = scene.end_time - transitionDuration;

      if (currentTime >= transitionStart && currentTime < scene.end_time) {
        const progress = (currentTime - transitionStart) / transitionDuration;
        const baseType = transition.transitionType.split('-')[0].toLowerCase();
        const nextSceneIdx = i + 1;
        return { progress, baseType, nextSceneIdx, transition };
      }
    }
    return null;
  }, [currentTime, scenes, transitions]);

  if (!overlayInfo) return null;

  const { progress, baseType, nextSceneIdx } = overlayInfo;
  const nextFrame = nextFrameCache[nextSceneIdx];

  // Overlay style for the darkening/blur effect
  const getEffectStyle = (): React.CSSProperties => {
    switch (baseType) {
      case 'crossfade':
      case 'dissolve':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.15})` };
      case 'fade':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.6})` };
      case 'blur':
        return { backdropFilter: `blur(${progress * 6}px)` };
      case 'zoom':
        return { backgroundColor: `rgba(0,0,0,${progress * 0.2})` };
      default:
        return {};
    }
  };

  // Next-frame overlay for real cross-fade
  const getNextFrameStyle = (): React.CSSProperties => {
    if (!nextFrame) return { display: 'none' };

    switch (baseType) {
      case 'crossfade':
      case 'dissolve':
        return {
          opacity: progress,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
      case 'fade':
        return {
          opacity: progress > 0.5 ? (progress - 0.5) * 2 : 0,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
      case 'wipe': {
        const dir = overlayInfo.transition.transitionType.split('-')[1] || 'left';
        let clipPath = '';
        if (dir === 'left') clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`;
        else if (dir === 'right') clipPath = `inset(0 0 0 ${(1 - progress) * 100}%)`;
        else if (dir === 'up') clipPath = `inset(0 0 ${(1 - progress) * 100}% 0)`;
        else clipPath = `inset(${(1 - progress) * 100}% 0 0 0)`;
        return {
          opacity: 1,
          clipPath,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
      }
      case 'slide':
      case 'push': {
        const dir = overlayInfo.transition.transitionType.split('-')[1] || 'left';
        let transform = '';
        if (dir === 'left') transform = `translateX(${(1 - progress) * 100}%)`;
        else if (dir === 'right') transform = `translateX(${-(1 - progress) * 100}%)`;
        else if (dir === 'up') transform = `translateY(${(1 - progress) * 100}%)`;
        else transform = `translateY(${-(1 - progress) * 100}%)`;
        return {
          opacity: 1,
          transform,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
      }
      case 'zoom':
        return {
          opacity: progress,
          transform: `scale(${1 + (1 - progress) * 0.3})`,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
      default:
        return {
          opacity: progress,
          backgroundImage: `url(${nextFrame})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#000',
        };
    }
  };

  return (
    <>
      {/* Effect overlay (darken / blur) */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={getEffectStyle()}
      />
      {/* Next scene frame overlay */}
      {nextFrame && (
        <div
          className="absolute inset-0 pointer-events-none z-[6]"
          style={getNextFrameStyle()}
        />
      )}
    </>
  );
}

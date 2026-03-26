import { useMemo } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

interface NativeTransitionOverlayProps {
  currentTime: number;
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
}

/**
 * Lightweight CSS-only transition overlay for the native <video> preview.
 * Renders a visual indicator (opacity/blur/wipe) during scene boundaries
 * without requiring Remotion.
 */
export function NativeTransitionOverlay({
  currentTime,
  scenes,
  transitions,
}: NativeTransitionOverlayProps) {
  const overlayStyle = useMemo(() => {
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

        switch (baseType) {
          case 'crossfade':
          case 'dissolve':
            // Show a brief darkening to indicate transition
            return {
              backgroundColor: `rgba(0,0,0,${progress * 0.3})`,
              opacity: 1,
            };
          case 'fade':
            return {
              backgroundColor: `rgba(0,0,0,${progress * 0.8})`,
              opacity: 1,
            };
          case 'blur':
            return {
              backdropFilter: `blur(${progress * 8}px)`,
              opacity: 1,
            };
          case 'wipe': {
            const dir = transition.transitionType.split('-')[1] || 'left';
            let gradient = '';
            if (dir === 'left') gradient = `linear-gradient(to left, transparent ${(1 - progress) * 100}%, black 100%)`;
            else if (dir === 'right') gradient = `linear-gradient(to right, transparent ${(1 - progress) * 100}%, black 100%)`;
            else if (dir === 'up') gradient = `linear-gradient(to top, transparent ${(1 - progress) * 100}%, black 100%)`;
            else gradient = `linear-gradient(to bottom, transparent ${(1 - progress) * 100}%, black 100%)`;
            return {
              background: gradient,
              opacity: 0.6,
            };
          }
          case 'zoom':
            return {
              backgroundColor: `rgba(0,0,0,${progress * 0.4})`,
              transform: `scale(${1 + progress * 0.1})`,
              opacity: 1,
            };
          default:
            return null;
        }
      }
    }
    return null;
  }, [currentTime, scenes, transitions]);

  if (!overlayStyle) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[5] transition-none"
      style={overlayStyle}
    />
  );
}

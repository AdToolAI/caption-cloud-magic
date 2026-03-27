import { useMemo, useRef, useEffect, useState } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

interface TransitionInfo {
  progress: number;
  baseType: string;
  direction: string;
  sceneIndex: number;
  transitionDuration: number;
}

interface NativeTransitionLayerProps {
  visualTimeRef: React.RefObject<number>;
  scenes: SceneAnalysis[];
  transitions: TransitionAssignment[];
}

const TRANSITION_DURATION = 0.8;
const MIN_TRANSITION_DURATION = 0.6;

/**
 * Pure CSS effect layer that applies transition animations between two video elements.
 * Returns styles for the base and incoming video layers.
 * No frame capture — both layers are real <video> elements managed by the parent.
 */
export function useTransitionInfo(
  visualTimeRef: React.RefObject<number>,
  scenes: SceneAnalysis[],
  transitions: TransitionAssignment[],
): TransitionInfo | null {
  const [info, setInfo] = useState<TransitionInfo | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (scenes.length < 2 || transitions.length === 0) {
      setInfo(null);
      return;
    }

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      let found: TransitionInfo | null = null;

      for (let i = 0; i < scenes.length - 1; i++) {
        const scene = scenes[i];
        const transition = transitions.find(t => t.sceneId === scene.id);
        if (!transition || transition.transitionType === 'none') continue;

        const transitionDuration = Math.max(MIN_TRANSITION_DURATION, transition.duration || TRANSITION_DURATION);
        const halfDuration = transitionDuration / 2;
        const transitionStart = scene.end_time - halfDuration;
        const transitionEnd = scene.end_time + halfDuration;

        if (time >= transitionStart && time < transitionEnd) {
          const rawProgress = (time - transitionStart) / transitionDuration;
          const progress = Math.pow(0.5 - 0.5 * Math.cos(rawProgress * Math.PI), 0.7);
          const parts = transition.transitionType.split('-');
          const baseType = parts[0].toLowerCase();
          const direction = parts[1] || 'left';

          found = { progress, baseType, direction, sceneIndex: i, transitionDuration };
          break;
        }
      }

      setInfo(prev => {
        // Only update if actually changed to avoid unnecessary renders
        if (!found && !prev) return prev;
        if (!found && prev) return null;
        if (found && prev && Math.abs(found.progress - prev.progress) < 0.005 && found.sceneIndex === prev.sceneIndex) return prev;
        return found;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scenes, transitions, visualTimeRef]);

  return info;
}

/**
 * Compute CSS styles for the base (outgoing) and incoming video layers
 * based on the current transition state.
 */
export function getTransitionStyles(info: TransitionInfo | null): {
  baseStyle: React.CSSProperties;
  incomingStyle: React.CSSProperties;
  isActive: boolean;
} {
  if (!info) {
    return {
      baseStyle: {},
      incomingStyle: { display: 'none' },
      isActive: false,
    };
  }

  const { progress, baseType, direction } = info;

  let baseStyle: React.CSSProperties = {};
  let incomingStyle: React.CSSProperties = {};

  switch (baseType) {
    case 'crossfade':
    case 'dissolve':
      baseStyle = { opacity: 1 - progress * 0.3 };
      incomingStyle = { opacity: progress };
      break;

    case 'fade':
      // Fade to black then reveal
      if (progress < 0.5) {
        baseStyle = { opacity: 1 - progress * 2 };
        incomingStyle = { opacity: 0 };
      } else {
        baseStyle = { opacity: 0 };
        incomingStyle = { opacity: (progress - 0.5) * 2 };
      }
      break;

    case 'blur':
      baseStyle = { filter: `blur(${progress * 8}px)`, opacity: 1 - progress };
      incomingStyle = { filter: `blur(${(1 - progress) * 8}px)`, opacity: progress };
      break;

    case 'wipe': {
      const p = progress * 100;
      let clipPath = '';
      if (direction === 'left') clipPath = `inset(0 ${100 - p}% 0 0)`;
      else if (direction === 'right') clipPath = `inset(0 0 0 ${100 - p}%)`;
      else if (direction === 'up') clipPath = `inset(0 0 ${100 - p}% 0)`;
      else clipPath = `inset(${100 - p}% 0 0 0)`;
      baseStyle = {};
      incomingStyle = { clipPath };
      break;
    }

    case 'slide':
    case 'push': {
      let inTransform = '';
      let outTransform = '';
      if (direction === 'left') {
        inTransform = `translateX(${(1 - progress) * 100}%)`;
        if (baseType === 'push') outTransform = `translateX(${-progress * 100}%)`;
      } else if (direction === 'right') {
        inTransform = `translateX(${-(1 - progress) * 100}%)`;
        if (baseType === 'push') outTransform = `translateX(${progress * 100}%)`;
      } else if (direction === 'up') {
        inTransform = `translateY(${(1 - progress) * 100}%)`;
        if (baseType === 'push') outTransform = `translateY(${-progress * 100}%)`;
      } else {
        inTransform = `translateY(${-(1 - progress) * 100}%)`;
        if (baseType === 'push') outTransform = `translateY(${progress * 100}%)`;
      }
      baseStyle = outTransform ? { transform: outTransform } : {};
      incomingStyle = { transform: inTransform };
      break;
    }

    case 'zoom':
      baseStyle = { opacity: 1 - progress * 0.3 };
      incomingStyle = { opacity: progress, transform: `scale(${1 + (1 - progress) * 0.3})` };
      break;

    default:
      baseStyle = { opacity: 1 - progress * 0.3 };
      incomingStyle = { opacity: progress };
      break;
  }

  return { baseStyle, incomingStyle, isActive: true };
}

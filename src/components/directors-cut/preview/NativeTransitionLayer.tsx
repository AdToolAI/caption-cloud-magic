import { useMemo, useRef, useEffect, useState } from 'react';
import { resolveTransitions, findActiveTransition } from '@/utils/transitionResolver';
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

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions as any),
    [scenes, transitions],
  );

  useEffect(() => {
    if (resolvedTransitions.length === 0) {
      setInfo(null);
      return;
    }

    const tick = () => {
      const time = visualTimeRef.current ?? 0;

      const active = findActiveTransition(time, resolvedTransitions);
      let found: TransitionInfo | null = null;

      if (active) {
        const { transition: rt, progress } = active;
        found = {
          progress,
          baseType: rt.baseType,
          direction: rt.direction,
          sceneIndex: rt.sceneIndex,
          transitionDuration: rt.duration,
        };
      }

      setInfo(prev => {
        if (!found && !prev) return prev;
        if (!found && prev) return null;
        if (found && prev && Math.abs(found.progress - prev.progress) < 0.005 && found.sceneIndex === prev.sceneIndex) return prev;
        return found;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [resolvedTransitions, visualTimeRef]);

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
      incomingStyle: { opacity: 0 },
      isActive: false,
    };
  }

  const { progress, baseType, direction } = info;

  let baseStyle: React.CSSProperties = {};
  let incomingStyle: React.CSSProperties = {};

  switch (baseType) {
    case 'crossfade':
    case 'dissolve':
      baseStyle = { opacity: 1 - progress };
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
      baseStyle = { opacity: 1 - progress, transform: `scale(${1 - progress * 0.1})` };
      incomingStyle = { opacity: progress, transform: `scale(${0.8 + progress * 0.2})` };
      break;

    case 'morph':
      // AI Morph preview fallback: scale + blur + opacity
      baseStyle = {
        opacity: 1 - progress,
        transform: `scale(${1 + progress * 0.15})`,
        filter: `blur(${progress * 6}px)`,
      };
      incomingStyle = {
        opacity: progress,
        transform: `scale(${1.15 - progress * 0.15})`,
        filter: `blur(${(1 - progress) * 6}px)`,
      };
      break;

    default:
      // Strong visible fallback for any unknown type
      baseStyle = { opacity: 1 - progress };
      incomingStyle = { opacity: progress };
      break;
  }

  return { baseStyle, incomingStyle, isActive: true };
}

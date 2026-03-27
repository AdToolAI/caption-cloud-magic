import { useEffect, useRef } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

const TRANSITION_DURATION = 0.8;
const MIN_TRANSITION_DURATION = 0.6;

/**
 * Zero-rerender transition renderer.
 * Writes opacity/transform/clipPath directly to video DOM elements via rAF.
 * No setState, no React re-renders during transitions.
 */
export function useTransitionRenderer(
  baseVideoRef: React.RefObject<HTMLVideoElement | null>,
  incomingVideoRef: React.RefObject<HTMLVideoElement | null>,
  visualTimeRef: React.RefObject<number>,
  scenes: SceneAnalysis[],
  transitions: TransitionAssignment[],
  videoFilterRef: React.RefObject<string>,
) {
  const rafRef = useRef<number>();
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (scenes.length < 2 || transitions.length === 0) {
      const incoming = incomingVideoRef.current;
      if (incoming) incoming.style.display = 'none';
      return;
    }

    const tick = () => {
      const time = visualTimeRef.current ?? 0;
      const base = baseVideoRef.current;
      const incoming = incomingVideoRef.current;
      if (!base || !incoming) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let found = false;

      for (let i = 0; i < scenes.length - 1; i++) {
        const scene = scenes[i];
        const transition = transitions.find(t => t.sceneId === scene.id);
        if (!transition || transition.transitionType === 'none') continue;

        const tDuration = Math.max(MIN_TRANSITION_DURATION, transition.duration || TRANSITION_DURATION);
        const half = tDuration / 2;
        const tStart = scene.end_time - half;
        const tEnd = scene.end_time + half;

        if (time >= tStart && time < tEnd) {
          const rawProgress = (time - tStart) / tDuration;
          const progress = Math.pow(0.5 - 0.5 * Math.cos(rawProgress * Math.PI), 0.7);
          const parts = transition.transitionType.split('-');
          const baseType = parts[0].toLowerCase();
          const direction = parts[1] || 'left';

          applyStyles(base, incoming, progress, baseType, direction, videoFilterRef.current ?? '');
          found = true;
          wasActiveRef.current = true;
          break;
        }
      }

      if (!found && wasActiveRef.current) {
        clearStyles(base);
        incoming.style.display = 'none';
        incoming.style.opacity = '';
        incoming.style.transform = '';
        incoming.style.clipPath = '';
        // Do NOT clear filter — managed by React
        wasActiveRef.current = false;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, visualTimeRef, baseVideoRef, incomingVideoRef, videoFilterRef]);
}

function clearStyles(el: HTMLElement) {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.clipPath = '';
  // Do NOT clear filter — it's managed by React (videoFilter prop)
}

function applyStyles(
  base: HTMLElement,
  incoming: HTMLElement,
  progress: number,
  baseType: string,
  direction: string,
  baseFilter: string,
) {
  incoming.style.display = '';

  switch (baseType) {
    case 'crossfade':
    case 'dissolve':
      base.style.opacity = String(1 - progress * 0.3);
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.opacity = String(progress);
      incoming.style.transform = '';
      incoming.style.clipPath = '';
      break;

    case 'fade':
      if (progress < 0.5) {
        base.style.opacity = String(1 - progress * 2);
        incoming.style.opacity = '0';
      } else {
        base.style.opacity = '0';
        incoming.style.opacity = String((progress - 0.5) * 2);
      }
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.transform = '';
      incoming.style.clipPath = '';
      break;

    case 'blur':
      base.style.filter = `${baseFilter} blur(${progress * 8}px)`.trim();
      base.style.opacity = String(1 - progress);
      incoming.style.filter = `${baseFilter} blur(${(1 - progress) * 8}px)`.trim();
      incoming.style.opacity = String(progress);
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.transform = '';
      incoming.style.clipPath = '';
      break;

    case 'wipe': {
      const p = progress * 100;
      let clipPath = '';
      if (direction === 'left') clipPath = `inset(0 ${100 - p}% 0 0)`;
      else if (direction === 'right') clipPath = `inset(0 0 0 ${100 - p}%)`;
      else if (direction === 'up') clipPath = `inset(0 0 ${100 - p}% 0)`;
      else clipPath = `inset(${100 - p}% 0 0 0)`;
      base.style.opacity = '';
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.opacity = '';
      incoming.style.transform = '';
      incoming.style.clipPath = clipPath;
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
      base.style.opacity = '';
      base.style.clipPath = '';
      base.style.transform = outTransform;
      incoming.style.opacity = '';
      incoming.style.clipPath = '';
      incoming.style.transform = inTransform;
      break;
    }

    case 'zoom':
      base.style.opacity = String(1 - progress * 0.3);
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.opacity = String(progress);
      incoming.style.transform = `scale(${1 + (1 - progress) * 0.3})`;
      incoming.style.clipPath = '';
      break;

    default:
      base.style.opacity = String(1 - progress * 0.3);
      base.style.transform = '';
      base.style.clipPath = '';
      incoming.style.opacity = String(progress);
      incoming.style.transform = '';
      incoming.style.clipPath = '';
      break;
  }
}

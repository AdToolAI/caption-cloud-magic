import { useEffect, useRef, useMemo } from 'react';
import type { SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';
import { resolveTransitions, findActiveTransition, findFreezePhase } from '@/utils/transitionResolver';

/**
 * Zero-rerender transition renderer.
 * Uses a <canvas> element with pre-captured ImageBitmaps for BOTH outgoing and incoming scenes.
 * During transitions the base video is hidden (opacity 0) and the canvas draws the full composite.
 * This prevents "dirty cuts" caused by the base decoder advancing past the scene boundary.
 */
export function useTransitionRenderer(
  baseVideoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  visualTimeRef: React.RefObject<number>,
  scenes: SceneAnalysis[],
  transitions: TransitionAssignment[],
  videoFilterRef: React.RefObject<string>,
  frameCacheRef: React.RefObject<Map<string, ImageBitmap>>,
) {
  const rafRef = useRef<number>();
  const wasActiveRef = useRef(false);

  const resolvedTransitions = useMemo(
    () => resolveTransitions(scenes, transitions),
    [scenes, transitions],
  );

  useEffect(() => {
    if (scenes.length < 2 || transitions.length === 0) {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.display = 'none';
      return;
    }

    const tick = () => {
      const time = baseVideoRef.current?.currentTime ?? visualTimeRef.current ?? 0;
      const base = baseVideoRef.current;
      const canvas = canvasRef.current;
      if (!base || !canvas) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Ensure canvas dimensions match
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth || 1280;
        canvas.height = canvas.clientHeight || 720;
      }

      const w = canvas.width;
      const h = canvas.height;
      const frameCache = frameCacheRef.current;
      let found = false;

      // === FRAME-FREEZE PHASE ===
      const freezeRT = findFreezePhase(time, resolvedTransitions);
      if (freezeRT && frameCache) {
        const outgoingBitmap = frameCache.get(`outgoing-${freezeRT.outgoingSceneId}`);
        if (outgoingBitmap) {
          ctx.globalAlpha = 1;
          ctx.drawImage(outgoingBitmap, 0, 0, w, h);
        }
        canvas.style.display = '';
        canvas.style.opacity = '1';
        canvas.style.transform = '';
        canvas.style.clipPath = '';
        base.style.opacity = '0'; // Hide base — it already jumped
        found = true;
        wasActiveRef.current = true;
      }

      // === NORMAL TRANSITION PHASE ===
      if (!found) {
        const active = findActiveTransition(time, resolvedTransitions);
        if (active) {
          const { transition: rt, progress } = active;

          const outgoingBitmap = frameCache?.get(`outgoing-${rt.outgoingSceneId}`) ?? null;
          const incomingBitmap = frameCache?.get(rt.incomingSceneId) ?? null;

          // Draw composite: both outgoing + incoming on canvas
          drawTransitionComposite(ctx, w, h, outgoingBitmap, incomingBitmap, progress, rt.baseType, rt.direction);

          canvas.style.display = '';
          canvas.style.opacity = '1';
          canvas.style.transform = '';
          canvas.style.clipPath = '';
          base.style.opacity = '0'; // Hide base — canvas handles everything

          found = true;
          wasActiveRef.current = true;
        }
      }

      if (!found && wasActiveRef.current) {
        base.style.opacity = '';
        base.style.transform = '';
        base.style.clipPath = '';
        canvas.style.display = 'none';
        canvas.style.opacity = '';
        canvas.style.transform = '';
        canvas.style.clipPath = '';
        wasActiveRef.current = false;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenes, transitions, resolvedTransitions, visualTimeRef, baseVideoRef, canvasRef, videoFilterRef, frameCacheRef]);
}

/**
 * Draw a full transition composite onto a canvas context.
 * Both outgoing and incoming frames are drawn, so the base video can be hidden.
 */
function drawTransitionComposite(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  outgoing: ImageBitmap | null,
  incoming: ImageBitmap | null,
  progress: number,
  baseType: string,
  direction: string,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  switch (baseType) {
    case 'crossfade':
    case 'dissolve': {
      if (outgoing) { ctx.globalAlpha = 1; ctx.drawImage(outgoing, 0, 0, w, h); }
      if (incoming) { ctx.globalAlpha = progress; ctx.drawImage(incoming, 0, 0, w, h); }
      ctx.globalAlpha = 1;
      break;
    }

    case 'fade': {
      // Fade through black
      if (progress < 0.5) {
        if (outgoing) { ctx.globalAlpha = 1 - progress * 2; ctx.drawImage(outgoing, 0, 0, w, h); }
      } else {
        if (incoming) { ctx.globalAlpha = (progress - 0.5) * 2; ctx.drawImage(incoming, 0, 0, w, h); }
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'blur': {
      // Canvas filter API for blur
      if (outgoing) {
        ctx.save();
        ctx.filter = `blur(${progress * 8}px)`;
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(outgoing, 0, 0, w, h);
        ctx.restore();
      }
      if (incoming) {
        ctx.save();
        ctx.filter = `blur(${(1 - progress) * 8}px)`;
        ctx.globalAlpha = progress;
        ctx.drawImage(incoming, 0, 0, w, h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      break;
    }

    case 'wipe': {
      if (outgoing) { ctx.drawImage(outgoing, 0, 0, w, h); }
      if (incoming) {
        ctx.save();
        ctx.beginPath();
        const p = progress;
        if (direction === 'left') ctx.rect(0, 0, w * p, h);
        else if (direction === 'right') ctx.rect(w * (1 - p), 0, w * p, h);
        else if (direction === 'up') ctx.rect(0, 0, w, h * p);
        else ctx.rect(0, h * (1 - p), w, h * p);
        ctx.clip();
        ctx.drawImage(incoming, 0, 0, w, h);
        ctx.restore();
      }
      break;
    }

    case 'slide': {
      if (outgoing) { ctx.drawImage(outgoing, 0, 0, w, h); }
      if (incoming) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = (1 - progress) * w;
        else if (direction === 'right') dx = -(1 - progress) * w;
        else if (direction === 'up') dy = (1 - progress) * h;
        else dy = -(1 - progress) * h;
        ctx.drawImage(incoming, dx, dy, w, h);
      }
      break;
    }

    case 'push': {
      if (outgoing) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = -progress * w;
        else if (direction === 'right') dx = progress * w;
        else if (direction === 'up') dy = -progress * h;
        else dy = progress * h;
        ctx.drawImage(outgoing, dx, dy, w, h);
      }
      if (incoming) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = (1 - progress) * w;
        else if (direction === 'right') dx = -(1 - progress) * w;
        else if (direction === 'up') dy = (1 - progress) * h;
        else dy = -(1 - progress) * h;
        ctx.drawImage(incoming, dx, dy, w, h);
      }
      break;
    }

    case 'zoom': {
      if (outgoing) { ctx.drawImage(outgoing, 0, 0, w, h); }
      if (incoming) {
        ctx.globalAlpha = progress;
        const scale = 1 + (1 - progress) * 0.3;
        const sw = w * scale;
        const sh = h * scale;
        ctx.drawImage(incoming, (w - sw) / 2, (h - sh) / 2, sw, sh);
        ctx.globalAlpha = 1;
      }
      break;
    }

    default: {
      if (outgoing) { ctx.globalAlpha = 1; ctx.drawImage(outgoing, 0, 0, w, h); }
      if (incoming) { ctx.globalAlpha = progress; ctx.drawImage(incoming, 0, 0, w, h); }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

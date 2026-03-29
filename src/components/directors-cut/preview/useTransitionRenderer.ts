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

    console.log('[useTransitionRenderer] rAF loop START — resolvedTransitions:', resolvedTransitions.map(r => `${r.sceneIndex}:${r.baseType}-${r.direction}`));

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
          if (Math.random() < 0.02) console.log('[useTransitionRenderer] ACTIVE transition:', rt.baseType, rt.direction, 'progress:', progress.toFixed(2), 'time:', time.toFixed(2));

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
/**
 * Compute aspect-ratio-correct draw rect (object-contain behaviour).
 * Returns { dx, dy, dw, dh } for use with ctx.drawImage.
 */
function containRect(
  canvasW: number, canvasH: number,
  imgW: number, imgH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const canvasAR = canvasW / canvasH;
  const imgAR = imgW / imgH;
  let dw: number, dh: number;
  if (imgAR > canvasAR) {
    dw = canvasW;
    dh = canvasW / imgAR;
  } else {
    dh = canvasH;
    dw = canvasH * imgAR;
  }
  return { dx: (canvasW - dw) / 2, dy: (canvasH - dh) / 2, dw, dh };
}

/**
 * Draw a full transition composite onto a canvas context.
 * Both outgoing and incoming frames are drawn, so the base video can be hidden.
 * All draws use aspect-ratio-correct coordinates (object-contain).
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

  // Compute contain-rect from the first available bitmap dimensions
  const refBmp = outgoing ?? incoming;
  const r = refBmp
    ? containRect(w, h, refBmp.width, refBmp.height)
    : { dx: 0, dy: 0, dw: w, dh: h };

  const drawBmp = (bmp: ImageBitmap, offX = 0, offY = 0, scaleW?: number, scaleH?: number) => {
    ctx.drawImage(bmp, r.dx + offX, r.dy + offY, scaleW ?? r.dw, scaleH ?? r.dh);
  };

  switch (baseType) {
    case 'crossfade':
    case 'dissolve': {
      if (outgoing) { ctx.globalAlpha = 1; drawBmp(outgoing); }
      if (incoming) { ctx.globalAlpha = progress; drawBmp(incoming); }
      ctx.globalAlpha = 1;
      break;
    }

    case 'fade': {
      if (progress < 0.5) {
        if (outgoing) { ctx.globalAlpha = 1 - progress * 2; drawBmp(outgoing); }
      } else {
        if (incoming) { ctx.globalAlpha = (progress - 0.5) * 2; drawBmp(incoming); }
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'blur': {
      if (outgoing) {
        ctx.save();
        ctx.filter = `blur(${progress * 8}px)`;
        ctx.globalAlpha = 1 - progress;
        drawBmp(outgoing);
        ctx.restore();
      }
      if (incoming) {
        ctx.save();
        ctx.filter = `blur(${(1 - progress) * 8}px)`;
        ctx.globalAlpha = progress;
        drawBmp(incoming);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      break;
    }

    case 'wipe': {
      if (outgoing) { drawBmp(outgoing); }
      if (incoming) {
        ctx.save();
        ctx.beginPath();
        const p = progress;
        if (direction === 'left') ctx.rect(r.dx, r.dy, r.dw * p, r.dh);
        else if (direction === 'right') ctx.rect(r.dx + r.dw * (1 - p), r.dy, r.dw * p, r.dh);
        else if (direction === 'up') ctx.rect(r.dx, r.dy, r.dw, r.dh * p);
        else ctx.rect(r.dx, r.dy + r.dh * (1 - p), r.dw, r.dh * p);
        ctx.clip();
        drawBmp(incoming);
        ctx.restore();
      }
      break;
    }

    case 'slide': {
      // Clip to the contain-rect so slides don't bleed into letterbox area
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.dx, r.dy, r.dw, r.dh);
      ctx.clip();
      if (outgoing) { drawBmp(outgoing); }
      if (incoming) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = (1 - progress) * r.dw;
        else if (direction === 'right') dx = -(1 - progress) * r.dw;
        else if (direction === 'up') dy = (1 - progress) * r.dh;
        else dy = -(1 - progress) * r.dh;
        drawBmp(incoming, dx, dy);
      }
      ctx.restore();
      break;
    }

    case 'push': {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.dx, r.dy, r.dw, r.dh);
      ctx.clip();
      if (outgoing) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = -progress * r.dw;
        else if (direction === 'right') dx = progress * r.dw;
        else if (direction === 'up') dy = -progress * r.dh;
        else dy = progress * r.dh;
        drawBmp(outgoing, dx, dy);
      }
      if (incoming) {
        let dx = 0, dy = 0;
        if (direction === 'left') dx = (1 - progress) * r.dw;
        else if (direction === 'right') dx = -(1 - progress) * r.dw;
        else if (direction === 'up') dy = (1 - progress) * r.dh;
        else dy = -(1 - progress) * r.dh;
        drawBmp(incoming, dx, dy);
      }
      ctx.restore();
      break;
    }

    case 'zoom': {
      if (outgoing) { drawBmp(outgoing); }
      if (incoming) {
        ctx.globalAlpha = progress;
        const scale = 1 + (1 - progress) * 0.3;
        const sw = r.dw * scale;
        const sh = r.dh * scale;
        ctx.drawImage(incoming, r.dx + (r.dw - sw) / 2, r.dy + (r.dh - sh) / 2, sw, sh);
        ctx.globalAlpha = 1;
      }
      break;
    }

    default: {
      if (outgoing) { ctx.globalAlpha = 1; drawBmp(outgoing); }
      if (incoming) { ctx.globalAlpha = progress; drawBmp(incoming); }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

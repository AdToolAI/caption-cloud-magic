import { useEffect, useRef, useState } from 'react';
import type { SceneAnalysis } from '@/types/directors-cut';

/**
 * Pre-captures the first frame of each scene (except scene 0) as an ImageBitmap.
 * Used by useTransitionRenderer to display instant, sync-free incoming frames
 * during transitions — no second video decoder needed.
 */
export function useFrameCapture(
  videoUrl: string | undefined,
  scenes: SceneAnalysis[],
): Map<string, ImageBitmap> {
  const [frames, setFrames] = useState<Map<string, ImageBitmap>>(new Map());
  const capturedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef(false);

  useEffect(() => {
    if (!videoUrl || scenes.length < 2) return;

    abortRef.current = false;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    const capture = async () => {
      // Wait for video metadata
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) return resolve();
        video.onloadeddata = () => resolve();
      });
      if (abortRef.current) return;

      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const newFrames = new Map<string, ImageBitmap>();

      for (let i = 1; i < scenes.length; i++) {
        if (abortRef.current) break;

        const scene = scenes[i];
        if (capturedRef.current.has(scene.id)) continue;

        const sourceStart = scene.original_start_time ?? scene.start_time;
        const captureTime = Math.max(0, sourceStart + 0.05);

        try {
          video.currentTime = captureTime;
          await new Promise<void>((resolve) => {
            video.addEventListener('seeked', () => resolve(), { once: true });
          });
          if (abortRef.current) break;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const bitmap = await createImageBitmap(canvas);
          newFrames.set(scene.id, bitmap);
          capturedRef.current.add(scene.id);
        } catch (e) {
          console.warn('Frame capture failed for scene', scene.id, e);
        }
      }

      if (newFrames.size > 0 && !abortRef.current) {
        setFrames(prev => {
          const merged = new Map(prev);
          newFrames.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      }
    };

    capture().catch(() => {});

    return () => {
      abortRef.current = true;
      video.src = '';
    };
  }, [videoUrl, scenes]);

  return frames;
}

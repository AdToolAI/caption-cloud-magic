import { useEffect, useRef, useState } from 'react';
import type { SceneAnalysis } from '@/types/directors-cut';

/**
 * Pre-captures frames as ImageBitmaps:
 * - First frame of each incoming scene (key: scene.id)
 * - Last frame of each outgoing scene (key: "outgoing-" + scene.id)
 * Used by useTransitionRenderer for instant, sync-free transitions
 * and frame-freeze overlays when offset > 0.
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

      for (let i = 0; i < scenes.length; i++) {
        if (abortRef.current) break;
        const scene = scenes[i];

        // Capture INCOMING frame (first frame of each scene, skip scene 0)
        if (i >= 1) {
          const incomingKey = scene.id;
          if (!capturedRef.current.has(incomingKey)) {
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
              newFrames.set(incomingKey, bitmap);
              capturedRef.current.add(incomingKey);
            } catch (e) {
              console.warn('Frame capture failed for incoming scene', scene.id, e);
            }
          }
        }

        // Capture OUTGOING frame (last frame of each scene, skip last scene)
        if (i < scenes.length - 1) {
          const outgoingKey = `outgoing-${scene.id}`;
          if (!capturedRef.current.has(outgoingKey)) {
            const sourceEnd = scene.original_end_time ?? scene.end_time;
            const captureTime = Math.max(0, sourceEnd - 0.05);
            try {
              video.currentTime = captureTime;
              await new Promise<void>((resolve) => {
                video.addEventListener('seeked', () => resolve(), { once: true });
              });
              if (abortRef.current) break;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const bitmap = await createImageBitmap(canvas);
              newFrames.set(outgoingKey, bitmap);
              capturedRef.current.add(outgoingKey);
            } catch (e) {
              console.warn('Frame capture failed for outgoing scene', scene.id, e);
            }
          }
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

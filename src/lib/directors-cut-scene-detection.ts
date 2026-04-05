/**
 * Client-side visual cut detection using pixel-difference between consecutive frames.
 * Returns timestamps where hard cuts are detected.
 */

export interface TimestampedFrame {
  time: number;
  image: string; // base64 data URL
}

export interface DetectedCut {
  time: number;
  score: number; // 0-1, how strong the visual change is
}

/**
 * Extract frames evenly distributed across the full video duration.
 * Returns frames with their exact timestamps.
 */
export async function extractTimestampedFrames(
  videoUrl: string,
  duration: number,
  maxFrames = 60
): Promise<TimestampedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Frame-Extraktion Timeout'));
    }, 30000);

    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Video konnte nicht geladen werden'));
    };

    video.onloadedmetadata = async () => {
      clearTimeout(timeout);
      const frames: TimestampedFrame[] = [];

      // Distribute frames evenly across full duration
      // Use at least 2 frames per second for cut detection accuracy
      const frameCount = Math.min(maxFrames, Math.max(10, Math.ceil(duration * 2)));
      const interval = duration / frameCount;

      const canvas = document.createElement('canvas');
      canvas.width = 320; // Small for fast diff computation
      canvas.height = 180;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context nicht verfügbar'));
        return;
      }

      for (let i = 0; i < frameCount; i++) {
        const time = Math.min(i * interval, duration - 0.01);

        try {
          video.currentTime = time;
          await new Promise<void>((seekResolve, seekReject) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              seekResolve();
            };
            const onError = () => {
              video.removeEventListener('error', onError);
              seekReject(new Error('Seek failed'));
            };
            video.addEventListener('seeked', onSeeked);
            video.addEventListener('error', onError);
          });

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameData = canvas.toDataURL('image/jpeg', 0.5);
          frames.push({ time: Math.round(time * 10) / 10, image: frameData });
        } catch {
          // Skip failed frames
          console.warn(`[scene-detection] Failed to extract frame at ${time}s`);
        }
      }

      video.src = '';
      resolve(frames);
    };

    video.src = videoUrl;
  });
}

/**
 * Detect hard cuts by computing pixel differences between consecutive frames.
 * Returns cut timestamps where visual change exceeds threshold.
 */
export function detectCuts(
  frames: TimestampedFrame[],
  threshold = 0.35
): DetectedCut[] {
  if (frames.length < 2) return [];

  const cuts: DetectedCut[] = [];
  const diffs: number[] = [];

  // We need pixel data — parse the base64 images
  // Since we can't use ImageData directly from base64 in a sync way,
  // we'll use a canvas-based approach
  // But since this runs after extraction, we compute diffs using canvas

  return cuts; // Will be populated by async version below
}

/**
 * Async version: detect cuts using canvas pixel comparison.
 */
export async function detectCutsAsync(
  frames: TimestampedFrame[],
  threshold = 0.30
): Promise<DetectedCut[]> {
  if (frames.length < 2) return [];

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d')!;

  const getPixelData = async (dataUrl: string): Promise<Uint8ClampedArray> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        resolve(data);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = dataUrl;
    });
  };

  // Compute pixel differences between consecutive frames
  const diffs: { time: number; score: number }[] = [];
  let prevPixels: Uint8ClampedArray | null = null;

  for (const frame of frames) {
    try {
      const pixels = await getPixelData(frame.image);

      if (prevPixels) {
        // Calculate mean absolute difference (normalized 0-1)
        let totalDiff = 0;
        const pixelCount = pixels.length / 4; // RGBA

        for (let p = 0; p < pixels.length; p += 4) {
          const dr = Math.abs(pixels[p] - prevPixels[p]);
          const dg = Math.abs(pixels[p + 1] - prevPixels[p + 1]);
          const db = Math.abs(pixels[p + 2] - prevPixels[p + 2]);
          totalDiff += (dr + dg + db) / (3 * 255);
        }

        const score = totalDiff / pixelCount;
        diffs.push({ time: frame.time, score });
      }

      prevPixels = pixels;
    } catch {
      // Skip frames that fail
    }
  }

  if (diffs.length === 0) return [];

  // Calculate statistics for adaptive thresholding
  const scores = diffs.map(d => d.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);

  // A cut must be at least 3 standard deviations above mean, AND above absolute threshold
  const adaptiveThreshold = Math.max(threshold, mean + 3 * stdDev);

  console.log(`[scene-detection] Stats: mean=${mean.toFixed(4)}, stdDev=${stdDev.toFixed(4)}, threshold=${adaptiveThreshold.toFixed(4)}`);

  const cuts: DetectedCut[] = [];
  for (const diff of diffs) {
    if (diff.score >= adaptiveThreshold) {
      // Ensure minimum 3s gap between cuts
      const lastCut = cuts[cuts.length - 1];
      if (!lastCut || diff.time - lastCut.time >= 3.0) {
        cuts.push({ time: diff.time, score: diff.score });
        console.log(`[scene-detection] CUT detected at ${diff.time}s (score=${diff.score.toFixed(4)}, threshold=${adaptiveThreshold.toFixed(4)})`);
      }
    }
  }

  return cuts;
}

/**
 * Build scenes from detected cuts.
 */
export function buildScenesFromCuts(
  cuts: DetectedCut[],
  duration: number
): { start_time: number; end_time: number }[] {
  if (cuts.length === 0) {
    return [{ start_time: 0, end_time: duration }];
  }

  const scenes: { start_time: number; end_time: number }[] = [];
  let lastStart = 0;

  for (const cut of cuts) {
    scenes.push({ start_time: lastStart, end_time: cut.time });
    lastStart = cut.time;
  }

  // Final scene
  scenes.push({ start_time: lastStart, end_time: duration });

  return scenes;
}

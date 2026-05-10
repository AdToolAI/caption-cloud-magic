/**
 * Phase 5.5 — Smart-Trim Lead-In Detection
 *
 * Many i2v providers (Hailuo, Kling, Wan, Seedance, Luma, Veo, Sora, Pika)
 * produce a frozen first-frame "lead-in" of 3-15 frames where the reference
 * image is held static before motion kicks in. This util loads the rendered
 * MP4 in a hidden HTMLVideoElement, samples ~10 candidate timestamps via a
 * 64×64 canvas downsample, and returns the earliest timestamp at which the
 * frame-to-frame mean-absolute-pixel-diff exceeds a motion threshold.
 *
 * Pure browser-side. No edge-function / FFmpeg-Wasm cost.
 *
 * Returns 0 if no freeze is detected, the video can't be loaded, or motion
 * starts immediately. Clamps to [0, 1.0].
 */

const SAMPLE_TIMESTAMPS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1.0];
const DOWNSAMPLE = 64;
/**
 * Mean abs pixel diff (0–255) below which we consider two frames "frozen".
 * Compression noise and gentle gradients can push genuinely-static frames
 * up to ~3, so 5 is a safe motion-floor.
 */
const FREEZE_THRESHOLD = 5;
/** Cap so we never drop more than 1s of a (typically) 6-12s clip. */
const MAX_TRIM = 1.0;

interface DetectResult {
  trimSeconds: number;
  /** Internal diagnostic — not persisted. */
  diffs: Array<{ t: number; diff: number }>;
}

export async function detectLeadInTrim(videoUrl: string): Promise<DetectResult> {
  if (!videoUrl) return { trimSeconds: 0, diffs: [] };

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('video load failed'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    // Safety timeout
    setTimeout(() => {
      cleanup();
      reject(new Error('video load timeout'));
    }, 8000);
  });

  const duration = isFinite(video.duration) ? video.duration : 0;
  if (duration < 1.5) return { trimSeconds: 0, diffs: [] };

  const canvas = document.createElement('canvas');
  canvas.width = DOWNSAMPLE;
  canvas.height = DOWNSAMPLE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { trimSeconds: 0, diffs: [] };

  const samples = SAMPLE_TIMESTAMPS.filter((t) => t < duration - 0.2);

  const grabFrame = (t: number): Promise<Uint8ClampedArray> =>
    new Promise((resolve, reject) => {
      const onSeek = () => {
        try {
          ctx.drawImage(video, 0, 0, DOWNSAMPLE, DOWNSAMPLE);
          const data = ctx.getImageData(0, 0, DOWNSAMPLE, DOWNSAMPLE).data;
          resolve(new Uint8ClampedArray(data));
        } catch (err) {
          reject(err);
        } finally {
          video.removeEventListener('seeked', onSeek);
        }
      };
      video.addEventListener('seeked', onSeek, { once: true });
      video.currentTime = t;
      setTimeout(() => {
        video.removeEventListener('seeked', onSeek);
        reject(new Error('seek timeout'));
      }, 3000);
    });

  const frames: Uint8ClampedArray[] = [];
  for (const t of samples) {
    try {
      frames.push(await grabFrame(t));
    } catch {
      // abort cleanly: skip
      return { trimSeconds: 0, diffs: [] };
    }
  }

  const meanAbsDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    // Compare luminance (every 4th channel = R; cheap proxy)
    let count = 0;
    for (let i = 0; i < len; i += 4) {
      sum += Math.abs(a[i] - b[i]);
      count++;
    }
    return sum / count;
  };

  const diffs: Array<{ t: number; diff: number }> = [];
  for (let i = 1; i < frames.length; i++) {
    diffs.push({ t: samples[i], diff: meanAbsDiff(frames[i], frames[i - 1]) });
  }

  // Find earliest sample where motion clearly exceeds the freeze floor.
  // Trim point = the sample timestamp BEFORE motion was detected.
  let trim = 0;
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].diff >= FREEZE_THRESHOLD) {
      trim = i === 0 ? 0 : samples[i - 1];
      break;
    }
  }

  // Snap tiny values to 0; clamp to MAX_TRIM
  if (trim < 0.05) trim = 0;
  if (trim > MAX_TRIM) trim = MAX_TRIM;

  return { trimSeconds: Number(trim.toFixed(2)), diffs };
}

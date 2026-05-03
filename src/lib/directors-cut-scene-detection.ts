/**
 * Deterministic scene boundary detection using multi-signal pixel analysis.
 * Detects both hard cuts and soft transitions (fades, dissolves, morphs).
 * Two-pass: coarse global scan → fine refinement around candidates.
 */

export interface TimestampedFrame {
  time: number;
  image: string; // base64 data URL
}

export interface DetectedBoundary {
  time: number;
  score: number;       // 0-1, combined boundary strength
  type: 'hard_cut' | 'soft_transition';
  signals: {
    pixelDiff: number;
    histogramDiff: number;
    edgeDiff: number;
  };
}

// Keep backward compat
export interface DetectedCut {
  time: number;
  score: number;
}

/**
 * Extract frames evenly distributed across the full video duration.
 */
export async function extractTimestampedFrames(
  videoUrl: string,
  duration: number,
  maxFrames = 120
): Promise<TimestampedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Frame-Extraktion Timeout'));
    }, 60000);

    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Video konnte nicht geladen werden'));
    };

    video.onloadedmetadata = async () => {
      clearTimeout(timeout);
      const frames: TimestampedFrame[] = [];

      // Target ~6 fps (Artlist-style dense sampling) — catches sub-second shots
      const targetFps = 6;
      const frameCount = Math.min(Math.max(maxFrames, 240), Math.max(30, Math.ceil(duration * targetFps)));
      const interval = duration / frameCount;

      const canvas = document.createElement('canvas');
      canvas.width = 320;
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
          let frameData: string;
          try {
            frameData = canvas.toDataURL('image/jpeg', 0.6);
          } catch (taintErr) {
            video.src = '';
            const err: any = new Error('CORS_TAINT');
            err.code = 'cors_taint';
            reject(err);
            return;
          }
          frames.push({ time: Math.round(time * 100) / 100, image: frameData });
        } catch {
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
 * Extract additional frames around specific timestamps for refinement.
 */
export async function extractRefinementFrames(
  videoUrl: string,
  duration: number,
  aroundTimes: number[],
  windowSec = 1.5,
  fpsInWindow = 6
): Promise<TimestampedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Refinement Timeout'));
    }, 30000);

    video.onerror = () => { clearTimeout(timeout); reject(new Error('Video error')); };

    video.onloadedmetadata = async () => {
      clearTimeout(timeout);
      const frames: TimestampedFrame[] = [];
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;

      for (const t of aroundTimes) {
        const start = Math.max(0, t - windowSec);
        const end = Math.min(duration, t + windowSec);
        const step = 1 / fpsInWindow;
        
        for (let time = start; time <= end; time += step) {
          try {
            video.currentTime = time;
            await new Promise<void>((r) => {
              const h = () => { video.removeEventListener('seeked', h); r(); };
              video.addEventListener('seeked', h);
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let img: string;
            try {
              img = canvas.toDataURL('image/jpeg', 0.6);
            } catch {
              video.src = '';
              const err: any = new Error('CORS_TAINT');
              err.code = 'cors_taint';
              reject(err);
              return;
            }
            frames.push({ time: Math.round(time * 100) / 100, image: img });
          } catch { /* skip */ }
        }
      }

      video.src = '';
      resolve(frames);
    };

    video.src = videoUrl;
  });
}

// ── Analysis helpers ────────────────────────────────────────────

interface FrameSignals {
  pixels: Uint8ClampedArray;
  histogram: number[];  // 64-bin combined RGB histogram
  edgeEnergy: number;   // sum of Sobel-ish gradient magnitudes
  luminance: number;    // mean luminance
}

const ANALYSIS_W = 160;
const ANALYSIS_H = 90;

async function loadImageToCanvas(
  dataUrl: string,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h).data);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

function computeSignals(pixels: Uint8ClampedArray, w: number, h: number): FrameSignals {
  const pixelCount = w * h;
  
  // Histogram: 64 bins (each channel gets ~21 bins, combine into 64)
  const histogram = new Array(64).fill(0);
  let totalLum = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLum += lum;
    
    // Combined histogram bin
    const bin = Math.min(63, Math.floor(((r + g + b) / 3) / 4));
    histogram[bin]++;
  }
  
  // Normalize histogram
  for (let i = 0; i < 64; i++) histogram[i] /= pixelCount;
  
  // Edge energy via simple gradient (skip borders)
  let edgeEnergy = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const idxLeft = (y * w + (x - 1)) * 4;
      const idxRight = (y * w + (x + 1)) * 4;
      const idxUp = ((y - 1) * w + x) * 4;
      const idxDown = ((y + 1) * w + x) * 4;
      
      // Luminance gradient
      const lumC = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumL = 0.299 * pixels[idxLeft] + 0.587 * pixels[idxLeft + 1] + 0.114 * pixels[idxLeft + 2];
      const lumR = 0.299 * pixels[idxRight] + 0.587 * pixels[idxRight + 1] + 0.114 * pixels[idxRight + 2];
      const lumU = 0.299 * pixels[idxUp] + 0.587 * pixels[idxUp + 1] + 0.114 * pixels[idxUp + 2];
      const lumD = 0.299 * pixels[idxDown] + 0.587 * pixels[idxDown + 1] + 0.114 * pixels[idxDown + 2];
      
      const gx = lumR - lumL;
      const gy = lumD - lumU;
      edgeEnergy += Math.sqrt(gx * gx + gy * gy);
    }
  }
  edgeEnergy /= ((w - 2) * (h - 2));
  
  return {
    pixels,
    histogram,
    edgeEnergy,
    luminance: totalLum / pixelCount,
  };
}

function pixelDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let total = 0;
  const count = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    total += (dr + dg + db) / (3 * 255);
  }
  return total / count;
}

function histogramDifference(a: number[], b: number[]): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff += Math.abs(a[i] - b[i]);
  }
  return diff / 2; // normalized 0-1
}

function edgeDifference(a: number, b: number): number {
  const max = Math.max(a, b, 1);
  return Math.abs(a - b) / max;
}

// ── Main boundary detection (two-pass) ────────────────────────

export interface BoundaryDetectionResult {
  boundaries: DetectedBoundary[];
  allDiffs: { time: number; score: number }[];
}

/**
 * Two-pass boundary detection:
 * 1) Coarse scan on provided frames → find peaks
 * 2) Fine scan with refinement frames → confirm boundaries
 */
export async function detectBoundariesAsync(
  frames: TimestampedFrame[],
  refinementFrames?: TimestampedFrame[]
): Promise<BoundaryDetectionResult> {
  if (frames.length < 2) return { boundaries: [], allDiffs: [] };

  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_W;
  canvas.height = ANALYSIS_H;
  const ctx = canvas.getContext('2d')!;

  // ── Pass 1: Compute all frame signals ──
  const signalsList: { time: number; signals: FrameSignals }[] = [];
  
  for (const frame of frames) {
    try {
      const pixels = await loadImageToCanvas(frame.image, ctx, ANALYSIS_W, ANALYSIS_H);
      const signals = computeSignals(pixels, ANALYSIS_W, ANALYSIS_H);
      signalsList.push({ time: frame.time, signals });
    } catch { /* skip */ }
  }

  if (signalsList.length < 2) return { boundaries: [], allDiffs: [] };

  // ── Compute diffs between consecutive frames ──
  const diffs: { time: number; pixelDiff: number; histDiff: number; edgeDiff: number; combined: number }[] = [];
  
  for (let i = 1; i < signalsList.length; i++) {
    const prev = signalsList[i - 1].signals;
    const curr = signalsList[i].signals;
    
    const pd = pixelDifference(prev.pixels, curr.pixels);
    const hd = histogramDifference(prev.histogram, curr.histogram);
    const ed = edgeDifference(prev.edgeEnergy, curr.edgeEnergy);
    
    // Combined score: weighted sum
    const combined = pd * 0.5 + hd * 0.3 + ed * 0.2;
    
    diffs.push({
      time: signalsList[i].time,
      pixelDiff: pd,
      histDiff: hd,
      edgeDiff: ed,
      combined,
    });
  }

  const allDiffs = diffs.map(d => ({ time: d.time, score: d.combined }));

  // ── Find peaks using prominence-based detection ──
  const scores = diffs.map(d => d.combined);
  const median = sortedMedian(scores);
  const mad = sortedMedian(scores.map(s => Math.abs(s - median))); // median absolute deviation
  
  console.log(`[boundary-detect] Pass 1: ${diffs.length} diffs, median=${median.toFixed(4)}, MAD=${mad.toFixed(4)}`);

  // A boundary candidate must be significantly above median
  // Use lower multiplier to catch soft transitions too
  const candidateThreshold = Math.max(0.03, median + Math.max(mad * 4, 0.02));
  
  console.log(`[boundary-detect] Candidate threshold: ${candidateThreshold.toFixed(4)}`);

  const candidates: typeof diffs = [];
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    if (d.combined < candidateThreshold) continue;
    
    // Peak check: must be local maximum (higher than neighbors)
    const prev = i > 0 ? diffs[i - 1].combined : 0;
    const next = i < diffs.length - 1 ? diffs[i + 1].combined : 0;
    
    if (d.combined >= prev && d.combined >= next) {
      candidates.push(d);
      console.log(`[boundary-detect] Candidate at ${d.time}s: pixel=${d.pixelDiff.toFixed(4)}, hist=${d.histDiff.toFixed(4)}, edge=${d.edgeDiff.toFixed(4)}, combined=${d.combined.toFixed(4)}`);
    }
  }

  // ── Pass 2: Refine candidates with dense frames if available ──
  let refinedCandidates = candidates;
  
  if (refinementFrames && refinementFrames.length > 0 && candidates.length > 0) {
    console.log(`[boundary-detect] Pass 2: Refining ${candidates.length} candidates with ${refinementFrames.length} dense frames`);
    
    // Re-analyze with refinement frames merged in
    const allFramesSorted = [...frames, ...refinementFrames]
      .sort((a, b) => a.time - b.time)
      // Deduplicate close timestamps
      .filter((f, i, arr) => i === 0 || Math.abs(f.time - arr[i - 1].time) > 0.05);
    
    const refSignals: { time: number; signals: FrameSignals }[] = [];
    for (const frame of allFramesSorted) {
      try {
        const pixels = await loadImageToCanvas(frame.image, ctx, ANALYSIS_W, ANALYSIS_H);
        const signals = computeSignals(pixels, ANALYSIS_W, ANALYSIS_H);
        refSignals.push({ time: frame.time, signals });
      } catch { /* skip */ }
    }
    
    // Re-compute diffs in candidate windows
    refinedCandidates = [];
    for (const candidate of candidates) {
      const windowStart = candidate.time - 2;
      const windowEnd = candidate.time + 2;
      
      const windowSignals = refSignals.filter(s => s.time >= windowStart && s.time <= windowEnd);
      
      let maxDiff = 0;
      let bestTime = candidate.time;
      let bestPixel = 0, bestHist = 0, bestEdge = 0;
      
      for (let i = 1; i < windowSignals.length; i++) {
        const prev = windowSignals[i - 1].signals;
        const curr = windowSignals[i].signals;
        const pd = pixelDifference(prev.pixels, curr.pixels);
        const hd = histogramDifference(prev.histogram, curr.histogram);
        const ed = edgeDifference(prev.edgeEnergy, curr.edgeEnergy);
        const combined = pd * 0.5 + hd * 0.3 + ed * 0.2;
        
        if (combined > maxDiff) {
          maxDiff = combined;
          bestTime = windowSignals[i].time;
          bestPixel = pd;
          bestHist = hd;
          bestEdge = ed;
        }
      }
      
      if (maxDiff >= candidateThreshold * 0.8) { // slightly relaxed for refinement
        refinedCandidates.push({
          time: bestTime,
          pixelDiff: bestPixel,
          histDiff: bestHist,
          edgeDiff: bestEdge,
          combined: maxDiff,
        });
        console.log(`[boundary-detect] Refined: ${candidate.time}s → ${bestTime}s (score=${maxDiff.toFixed(4)})`);
      }
    }
  }

  // ── Classify and deduplicate ──
  const boundaries: DetectedBoundary[] = [];
  
  for (const c of refinedCandidates) {
    // Skip if too close to existing boundary (Artlist allows ~0.6s shots)
    if (boundaries.length > 0 && c.time - boundaries[boundaries.length - 1].time < 0.6) {
      continue;
    }
    
    // Hard cut: very high pixel diff, instant change
    // Soft transition: moderate but sustained change
    const isHardCut = c.pixelDiff > 0.15;
    
    boundaries.push({
      time: Math.round(c.time * 10) / 10,
      score: c.combined,
      type: isHardCut ? 'hard_cut' : 'soft_transition',
      signals: {
        pixelDiff: c.pixelDiff,
        histogramDiff: c.histDiff,
        edgeDiff: c.edgeDiff,
      },
    });
  }

  console.log(`[boundary-detect] Final: ${boundaries.length} boundaries: ${boundaries.map(b => `${b.time}s(${b.type},${b.score.toFixed(3)})`).join(', ')}`);

  return { boundaries, allDiffs };
}

// Backward-compatible wrapper
export async function detectCutsAsync(
  frames: TimestampedFrame[],
  _threshold?: number
): Promise<DetectedCut[]> {
  const result = await detectBoundariesAsync(frames);
  return result.boundaries.map(b => ({ time: b.time, score: b.score }));
}

/**
 * Build scenes from detected boundaries.
 */
export function buildScenesFromBoundaries(
  boundaries: DetectedBoundary[],
  duration: number
): { start_time: number; end_time: number; boundary_type?: string }[] {
  if (boundaries.length === 0) {
    return [{ start_time: 0, end_time: duration }];
  }

  const scenes: { start_time: number; end_time: number; boundary_type?: string }[] = [];
  let lastStart = 0;

  for (const b of boundaries) {
    scenes.push({ start_time: lastStart, end_time: b.time, boundary_type: b.type });
    lastStart = b.time;
  }

  scenes.push({ start_time: lastStart, end_time: duration });
  return scenes;
}

// Keep old export
export function buildScenesFromCuts(
  cuts: DetectedCut[],
  duration: number
): { start_time: number; end_time: number }[] {
  return buildScenesFromBoundaries(
    cuts.map(c => ({ time: c.time, score: c.score, type: 'hard_cut' as const, signals: { pixelDiff: 0, histogramDiff: 0, edgeDiff: 0 } })),
    duration
  );
}

// ── Utilities ──

function sortedMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

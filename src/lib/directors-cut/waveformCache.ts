// Module-level waveform peak cache.
// Keyed by audio URL. Values are normalized peak arrays (0..1).
// Also deduplicates in-flight decodes so multiple <WaveformDisplay> mounts
// for the same URL share a single fetch + decodeAudioData pass.

const SAMPLES = 100;

const peakCache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[]>>();

// Cap cache to avoid unbounded memory on long sessions.
const MAX_ENTRIES = 128;

function remember(url: string, peaks: number[]) {
  if (peakCache.size >= MAX_ENTRIES) {
    // Drop oldest (Map preserves insertion order).
    const firstKey = peakCache.keys().next().value;
    if (firstKey) peakCache.delete(firstKey);
  }
  peakCache.set(url, peaks);
}

export function getCachedPeaks(url: string): number[] | undefined {
  return peakCache.get(url);
}

export async function loadPeaks(
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<number[]> {
  const cached = peakCache.get(url);
  if (cached) return cached;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioCtx();
    try {
      const res = await fetch(url, { signal: opts.signal });
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      const ch = decoded.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(ch.length / SAMPLES));
      const raw: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(ch[i * blockSize + j] || 0);
        }
        raw.push(sum / blockSize);
      }
      const max = Math.max(...raw) || 1;
      const peaks = raw.map((v) => v / max);
      remember(url, peaks);
      return peaks;
    } finally {
      if (ctx.state !== 'closed') {
        try {
          await ctx.close();
        } catch {
          /* noop */
        }
      }
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  return p;
}

export function clearWaveformCache() {
  peakCache.clear();
  inflight.clear();
}

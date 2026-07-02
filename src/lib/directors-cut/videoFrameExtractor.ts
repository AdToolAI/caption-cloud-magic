// W4.7 — Client-side frame extraction from a video URL at an arbitrary source-time.
// Used by AnchorRefreshDialog to render the "current head-frame" next to the stored
// anchor thumbnail. Results are cached to avoid repeat decodes.

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const key = (url: string, time: number) => `${url}#${time.toFixed(3)}`;

export function extractVideoFrame(url: string, time: number): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const k = key(url, time);
  const cached = cache.get(k);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(k);
  if (running) return running;

  const p = new Promise<string | null>((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      inflight.delete(k);
      if (value) cache.set(k, value);
      try { video.src = ''; } catch { /* noop */ }
      resolve(value);
    };

    const timer = window.setTimeout(() => done(null), 6000);

    const seek = () => {
      const target = Math.max(0, Math.min(time, (video.duration || time) - 0.05));
      try { video.currentTime = target; } catch { done(null); }
    };

    const capture = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
        // Downscale for thumbnails to keep memory low
        const scale = Math.min(1, 240 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.72);
        window.clearTimeout(timer);
        done(data);
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };

    video.addEventListener('loadedmetadata', seek, { once: true });
    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener('error', () => { window.clearTimeout(timer); done(null); }, { once: true });
  });

  inflight.set(k, p);
  return p;
}

export function clearFrameCache() {
  cache.clear();
  inflight.clear();
}

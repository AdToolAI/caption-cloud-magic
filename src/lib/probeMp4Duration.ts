/**
 * Browser-side MP4 (or any media) duration probe.
 *
 * Why this exists:
 * Hailuo (and other AI video models) often produce clips whose REAL duration
 * differs from the requested/configured value. E.g. a 7s prompt may yield a
 * 5.875s MP4. If the UI/Voiceover pipeline keeps using the nominal 7s while
 * the renderer uses the real 5.875s, the audio timeline desyncs from video,
 * causing voiceover cuts at scene transitions.
 *
 * This utility loads only the metadata of a media URL via a hidden HTMLVideoElement
 * (works for MP4 / WebM) and resolves with the precise duration in seconds.
 */
export function probeMediaDuration(url: string, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('probeMediaDuration: empty url'));

    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    // Allow CORS-loaded media to expose duration
    el.crossOrigin = 'anonymous';
    el.src = url;

    let done = false;
    const cleanup = () => {
      el.removeAttribute('src');
      try { el.load(); } catch { /* noop */ }
    };
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`probeMediaDuration: timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    el.addEventListener('loadedmetadata', () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      const dur = el.duration;
      cleanup();
      if (!isFinite(dur) || dur <= 0) {
        reject(new Error(`probeMediaDuration: invalid duration ${dur}`));
      } else {
        resolve(dur);
      }
    }, { once: true });

    el.addEventListener('error', () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('probeMediaDuration: media element error'));
    }, { once: true });
  });
}

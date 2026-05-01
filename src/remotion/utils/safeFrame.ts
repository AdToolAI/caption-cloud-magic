/**
 * safeFrame — converts a number of seconds to a non-negative integer frame index.
 *
 * Defends against the three failure modes that crashed Lambda renders:
 *   - undefined / null / NaN inputs (Sequence threw "from prop must be finite, but got NaN")
 *   - negative timestamps (Sequence rejects negative `from`)
 *   - inputs that exceed the composition length (frameRange clamp mismatch)
 *
 * Always returns a finite, non-negative integer. If `maxFrame` is given the
 * result is additionally clamped to `[0, maxFrame]`.
 */
export function safeFrame(
  seconds: unknown,
  fps: number,
  maxFrame?: number,
): number {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 0;
  const f = Math.floor(n * fps);
  if (!Number.isFinite(f) || f < 0) return 0;
  if (typeof maxFrame === 'number' && Number.isFinite(maxFrame)) {
    return Math.min(Math.max(0, Math.floor(maxFrame)), f);
  }
  return f;
}

/**
 * safeDurationFrames — like safeFrame, but returns at minimum 1 (a Sequence
 * with `durationInFrames=0` is not allowed).
 */
export function safeDurationFrames(
  seconds: unknown,
  fps: number,
  maxFrame?: number,
): number {
  const f = safeFrame(seconds, fps, maxFrame);
  return Math.max(1, f);
}

/**
 * Validates a remote media URL. Returns false for empty / data-URIs / non-http
 * inputs so callers can render a black fallback instead of crashing the
 * Chromium renderer with MEDIA_ERR Code 4 (network).
 */
export function isValidRemoteMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (url.length < 10) return false;
  if (url.startsWith('data:')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

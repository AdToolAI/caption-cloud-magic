/**
 * v427B — Duration contract (Phase 0 closing item).
 *
 * These are NOT new tuning values. Every constant below is lifted verbatim
 * out of the productive timing logic in `compose-twoshot-audio/index.ts`
 * (see the v89 "Sarah-cutoff" block). Extracting them here gives the run
 * contract one named source without changing a single millisecond of
 * behaviour — a different value would be a quality and cost change.
 *
 * The lip-sync freeze stays in force: this module is pure arithmetic, it
 * imports nothing from the chain and mutates no state.
 */

/** Trailing silence kept behind the last spoken sample. Was the literal `0.30`. */
export const TAIL_PADDING_MS = 300;

/** Overflow tolerated before the scene is extended. Was the literal `0.30`. */
export const OVERFLOW_GRACE_MS = 300;

/** Hard cap on automatic extension. Was the literal `5.0`. */
export const MAX_EXTEND_MS = 5_000;

/** Plate-render granularity the extension snaps to. Was `Math.ceil(x * 10) / 10`. */
export const DURATION_STEP_MS = 100;

/** Silence inserted between utterances. Was the literal `0.25`. */
export const INTER_SPEAKER_PAUSE_MS = 250;

export type ProviderWindow = {
  /** Discrete buckets a provider accepts; empty means a continuous range. */
  buckets: readonly number[];
  minMs: number;
  maxMs: number;
};

/**
 * Provider windows as enforced today by `compose-video-clips`.
 * Hailuo only knows 6 s and 10 s buckets; HappyHorse and Seedance 2.5 are
 * continuous inside their range.
 */
export const PROVIDER_WINDOWS: Readonly<Record<string, ProviderWindow>> = {
  "ai-hailuo": { buckets: [6_000, 10_000], minMs: 6_000, maxMs: 10_000 },
  "ai-happyhorse": { buckets: [], minMs: 3_000, maxMs: 15_000 },
  "ai-seedance25": { buckets: [], minMs: 4_000, maxMs: 30_000 },
};

export function getProviderWindow(source: string | null | undefined): ProviderWindow | null {
  if (!source) return null;
  return PROVIDER_WINDOWS[source] ?? null;
}

/** Round a raw requirement up into the nearest bucket / step a provider accepts. */
export function roundUpToProviderWindow(
  rawMs: number,
  source: string | null | undefined,
): { effectiveMs: number; fits: boolean } {
  const win = getProviderWindow(source);
  const raw = Math.max(0, Math.round(rawMs));
  if (!win) {
    // Unknown provider: snap to the plate-render step, never shorten.
    return { effectiveMs: Math.ceil(raw / DURATION_STEP_MS) * DURATION_STEP_MS, fits: true };
  }
  if (win.buckets.length > 0) {
    const hit = win.buckets.find((b) => raw <= b);
    return { effectiveMs: hit ?? win.maxMs, fits: hit !== undefined };
  }
  const stepped = Math.max(
    win.minMs,
    Math.ceil(raw / DURATION_STEP_MS) * DURATION_STEP_MS,
  );
  return { effectiveMs: Math.min(stepped, win.maxMs), fits: stepped <= win.maxMs };
}

/**
 * `raw_required_duration_ms = max(requested, measured_audio_end + tail_padding)`
 * — voiceover may extend a scene, never shorten it.
 */
export function rawRequiredDurationMs(
  requestedMs: number,
  measuredAudioEndMs: number | null | undefined,
): number {
  const requested = Math.max(0, Math.round(requestedMs || 0));
  const measured = Math.max(0, Math.round(measuredAudioEndMs || 0));
  if (measured <= 0) return requested;
  return Math.max(requested, measured + TAIL_PADDING_MS);
}

export type DurationContract = {
  rawRequiredMs: number;
  effectiveMs: number;
  /** False when the dialog does not fit the provider window at all. */
  fits: boolean;
  source: string | null;
};

export function computeDurationContract(
  requestedMs: number,
  measuredAudioEndMs: number | null | undefined,
  source: string | null | undefined,
): DurationContract {
  const rawRequiredMs = rawRequiredDurationMs(requestedMs, measuredAudioEndMs);
  const { effectiveMs, fits } = roundUpToProviderWindow(rawRequiredMs, source);
  return { rawRequiredMs, effectiveMs, fits, source: source ?? null };
}

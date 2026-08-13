/**
 * providerMatrix — v430 Schritt 2.
 *
 * THE single capability truth for AI video providers: allowed durations,
 * lip-sync certification (v425 contract), multi-speaker support, native
 * audio/lip-sync, supported languages, speaker caps and labels.
 *
 * Rules:
 *  - This module is pure. It builds a frozen matrix at load time and never
 *    mutates exported objects afterwards.
 *  - `lipsyncMaster` is a CAPABILITY only. No pipeline mode, no plate source
 *    semantics live here — those stay in the lip-sync pipeline.
 *  - The backend mirror (`supabase/functions/_shared/provider-matrix.ts`)
 *    must stay field-for-field identical; a parity test enforces it.
 *
 * Behaviour is a 1:1 port of the previous `providerCapabilities.ts` +
 * `lipsyncMasterProvider.clampDialogMasterDuration()` semantics.
 */

import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { isLipsyncCertifiedProvider } from '@/lib/video-composer/lipsyncMasterProvider';
import { modelIdToSource } from '@/lib/video-composer/modelMapping';

export interface ProviderMatrixEntry {
  /** Allowed duration buckets (whole seconds). */
  durations: number[];
  /** Certified as lip-sync master plate (v425) OR native lip-sync provider. */
  lipsync: boolean;
  /** Multi-speaker dialog scenes supported. */
  multiSpeaker: boolean;
  /** Human-readable label. */
  label: string;
  /** Provider returns final lip-synced video in one call (no Sync.so). */
  nativeLipSync?: boolean;
  /** Provider generates its own TTS + ambient audio. */
  nativeAudio?: boolean;
  /** ISO-639-1 codes the provider speaks with correct lip-sync. */
  supportedLanguages?: string[];
  /** Multi-shot capability (cam angles chained in one call). */
  multiShot?: { min: number; max: number };
  /** Start-frame + end-frame interpolation supported. */
  startEndFrames?: boolean;
  /** Hard cap on speakers per scene. */
  maxSpeakers?: number;
}

/**
 * Static base table — identical values to the legacy `PROVIDER_CAPS`.
 * Durations act as fallback when the registry has no model for the source.
 */
const BASE_MATRIX: Record<string, ProviderMatrixEntry> = {
  'ai-hailuo': { durations: [6, 10], lipsync: true, multiSpeaker: true, label: 'Hailuo' },
  'ai-happyhorse': {
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    lipsync: true,
    multiSpeaker: true,
    label: 'HappyHorse',
  },
  'ai-kling': { durations: [3, 5, 8, 10, 15], lipsync: true, multiSpeaker: false, label: 'Kling' },
  'ai-veo': { durations: [4, 6, 8], lipsync: false, multiSpeaker: false, label: 'Veo' },
  'ai-wan': { durations: [5, 10], lipsync: true, multiSpeaker: false, label: 'Wan' },
  'ai-seedance': { durations: [5, 8, 10, 12], lipsync: true, multiSpeaker: false, label: 'Seedance' },
  'ai-seedance25': {
    durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
    lipsync: true,
    multiSpeaker: true,
    startEndFrames: true,
    label: 'Seedance 2.5',
  },
  'ai-luma': { durations: [5, 9], lipsync: false, multiSpeaker: false, label: 'Luma' },
  'ai-ltx': { durations: [4, 6, 8], lipsync: false, multiSpeaker: false, label: 'LTX' },
  'ai-grok': { durations: [6, 12], lipsync: false, multiSpeaker: false, label: 'Grok' },
  'ai-sora': { durations: [4, 8, 12], lipsync: false, multiSpeaker: false, label: 'Sora' },
  'ai-pika': { durations: [5, 10], lipsync: false, multiSpeaker: false, label: 'Pika' },
  'ai-runway': { durations: [5, 10], lipsync: false, multiSpeaker: false, label: 'Runway' },
  'ai-vidu': { durations: [5], lipsync: false, multiSpeaker: false, label: 'Vidu' },
  'ai-kling-omni': {
    durations: [5, 8, 10, 15],
    lipsync: true,
    multiSpeaker: true,
    label: 'Kling Omni',
    nativeLipSync: true,
    nativeAudio: true,
    supportedLanguages: ['de', 'en', 'es'],
    multiShot: { min: 2, max: 6 },
    startEndFrames: true,
    maxSpeakers: 2,
  },
};

/** Durations derived from the AI Video Toolkit registry (ground truth). */
function registryDurations(): Record<string, number[]> {
  const out: Record<string, Set<number>> = {};
  for (const m of AI_VIDEO_TOOLKIT_MODELS) {
    const src = modelIdToSource(m.id).clipSource as string;
    if (!src) continue;
    const bucket = (out[src] ??= new Set<number>());
    for (const d of m.durations ?? []) {
      if (Number.isFinite(d) && d > 0) bucket.add(Math.round(d));
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]),
  );
}

function buildMatrix(): Record<string, ProviderMatrixEntry> {
  const derived = registryDurations();
  const out: Record<string, ProviderMatrixEntry> = {};
  for (const [src, base] of Object.entries(BASE_MATRIX)) {
    const durations = derived[src]?.length ? derived[src] : base.durations;
    out[src] = Object.freeze({
      ...base,
      durations: Object.freeze([...durations]) as unknown as number[],
      lipsync: isLipsyncCertifiedProvider(src) || base.nativeLipSync === true,
    });
  }
  return Object.freeze(out);
}

export const PROVIDER_MATRIX: Record<string, ProviderMatrixEntry> = buildMatrix();

const DEFAULT_PROVIDER = 'ai-hailuo';

export function getProviderEntry(clipSource: string | undefined | null): ProviderMatrixEntry | undefined {
  if (!clipSource) return undefined;
  return PROVIDER_MATRIX[clipSource];
}

export function getProviderDurations(clipSource: string | undefined | null): number[] {
  return (getProviderEntry(clipSource) ?? PROVIDER_MATRIX[DEFAULT_PROVIDER]).durations;
}

export function providerSupportsLipsync(clipSource: string | undefined | null): boolean {
  return !!getProviderEntry(clipSource)?.lipsync;
}

export function providerSupportsMultiSpeaker(clipSource: string | undefined | null): boolean {
  return !!getProviderEntry(clipSource)?.multiSpeaker;
}

export function providerHasNativeLipSync(clipSource: string | undefined | null): boolean {
  return !!getProviderEntry(clipSource)?.nativeLipSync;
}

export function providerHasNativeAudio(clipSource: string | undefined | null): boolean {
  return !!getProviderEntry(clipSource)?.nativeAudio;
}

export function providerSupportedLanguages(clipSource: string | undefined | null): string[] {
  return getProviderEntry(clipSource)?.supportedLanguages ?? [];
}

export function providerMaxSpeakers(clipSource: string | undefined | null): number {
  if (!clipSource) return Infinity;
  return getProviderEntry(clipSource)?.maxSpeakers ?? Infinity;
}

export function getProviderLabel(clipSource: string | undefined | null): string {
  if (!clipSource) return 'Hailuo';
  return getProviderEntry(clipSource)?.label ?? clipSource;
}

export function getLipsyncProviders(): string[] {
  return Object.entries(PROVIDER_MATRIX)
    .filter(([, cap]) => cap.lipsync)
    .map(([key]) => key);
}

/**
 * Snap a requested duration to the nearest supported value.
 * Unchanged algorithm from `providerCapabilities.snapDurationToProvider`.
 */
export function snapDurationToProvider(
  requested: number,
  clipSource: string | undefined | null,
): { duration: number; changed: boolean } {
  const allowed = getProviderDurations(clipSource);
  if (allowed.length === 0) return { duration: requested, changed: false };
  if (allowed.includes(Math.round(requested))) {
    const rounded = Math.round(requested);
    return { duration: rounded, changed: rounded !== requested };
  }
  const next = allowed.find((d) => d >= requested);
  const picked = next ?? allowed[allowed.length - 1];
  const min = allowed[0];
  const max = allowed[allowed.length - 1];
  const final = requested < min ? min : requested > max ? max : picked;
  return { duration: final, changed: final !== requested };
}

/**
 * Hard clamp used by the dialog/lip-sync master path.
 * Semantics are a verbatim port of `clampDialogMasterDuration`:
 *  - Hailuo: two buckets — `>= 10 → 10`, otherwise `6`
 *  - HappyHorse: continuous 3–15 s
 *  - any other provider: snap into the provider's bucket list
 */
export function clampProviderDuration(
  clipSource: string | undefined | null,
  duration: number,
): number {
  const picked = Number.isFinite(duration) ? Math.ceil(duration) : 6;
  if (clipSource === 'ai-hailuo') return picked >= 10 ? 10 : 6;
  if (clipSource === 'ai-happyhorse') return Math.min(15, Math.max(3, picked));
  return snapDurationToProvider(picked, clipSource).duration;
}

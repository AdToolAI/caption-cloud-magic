/**
 * provider-matrix — backend mirror of `src/lib/composer/providerMatrix.ts`
 * (v430 Schritt 2).
 *
 * DO NOT maintain this file independently. Values here are the resolved
 * client matrix (registry durations already applied). A hard parity test
 * (`src/lib/composer/__tests__/providerMatrixParity.test.ts`) compares this
 * mirror field-for-field against the client matrix and fails on any drift.
 */

export interface ProviderMatrixEntry {
  durations: number[];
  lipsync: boolean;
  multiSpeaker: boolean;
  label: string;
  nativeLipSync?: boolean;
  nativeAudio?: boolean;
  supportedLanguages?: string[];
  multiShot?: { min: number; max: number };
  startEndFrames?: boolean;
  maxSpeakers?: number;
}

export const PROVIDER_MATRIX: Record<string, ProviderMatrixEntry> = {
  "ai-hailuo": {
    durations: [5, 6, 8, 10, 12, 14, 15, 16, 18, 20],
    lipsync: true,
    multiSpeaker: true,
    label: "Hailuo",
  },
  "ai-happyhorse": {
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    lipsync: true,
    multiSpeaker: true,
    label: "HappyHorse",
  },
  "ai-kling": { durations: [3, 5, 8, 10, 15], lipsync: false, multiSpeaker: false, label: "Kling" },
  "ai-veo": { durations: [4, 6, 8], lipsync: false, multiSpeaker: false, label: "Veo" },
  "ai-wan": { durations: [5, 10, 15], lipsync: false, multiSpeaker: false, label: "Wan" },
  "ai-seedance": {
    durations: [3, 5, 8, 10, 12, 15],
    lipsync: false,
    multiSpeaker: false,
    label: "Seedance",
  },
  "ai-seedance25": {
    durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
    lipsync: false,
    multiSpeaker: true,
    startEndFrames: true,
    label: "Seedance 2.5",
  },
  "ai-luma": { durations: [5, 9, 10], lipsync: false, multiSpeaker: false, label: "Luma" },
  "ai-ltx": { durations: [4, 6, 8], lipsync: false, multiSpeaker: false, label: "LTX" },
  "ai-grok": { durations: [6, 12], lipsync: false, multiSpeaker: false, label: "Grok" },
  "ai-sora": { durations: [4, 8, 12], lipsync: false, multiSpeaker: false, label: "Sora" },
  "ai-pika": { durations: [5, 10], lipsync: false, multiSpeaker: false, label: "Pika" },
  "ai-runway": { durations: [5], lipsync: false, multiSpeaker: false, label: "Runway" },
  "ai-vidu": {
    durations: [4, 5, 6, 8, 10, 12, 16],
    lipsync: false,
    multiSpeaker: false,
    label: "Vidu",
  },
  "ai-kling-omni": {
    durations: [3, 5, 8, 10, 15],
    lipsync: true,
    multiSpeaker: true,
    label: "Kling Omni",
    nativeLipSync: true,
    nativeAudio: true,
    supportedLanguages: ["de", "en", "es"],
    multiShot: { min: 2, max: 6 },
    startEndFrames: true,
    maxSpeakers: 2,
  },
};

const DEFAULT_PROVIDER = "ai-hailuo";

export function getProviderEntry(clipSource: string | null | undefined): ProviderMatrixEntry | undefined {
  if (!clipSource) return undefined;
  return PROVIDER_MATRIX[clipSource];
}

export function getProviderDurations(clipSource: string | null | undefined): number[] {
  return (getProviderEntry(clipSource) ?? PROVIDER_MATRIX[DEFAULT_PROVIDER]).durations;
}

export function providerSupportsLipsync(clipSource: string | null | undefined): boolean {
  return !!getProviderEntry(clipSource)?.lipsync;
}

export function providerSupportsMultiSpeaker(clipSource: string | null | undefined): boolean {
  return !!getProviderEntry(clipSource)?.multiSpeaker;
}

export function providerHasNativeLipSync(clipSource: string | null | undefined): boolean {
  return !!getProviderEntry(clipSource)?.nativeLipSync;
}

export function providerHasNativeAudio(clipSource: string | null | undefined): boolean {
  return !!getProviderEntry(clipSource)?.nativeAudio;
}

export function providerSupportedLanguages(clipSource: string | null | undefined): string[] {
  return getProviderEntry(clipSource)?.supportedLanguages ?? [];
}

export function providerMaxSpeakers(clipSource: string | null | undefined): number {
  if (!clipSource) return Infinity;
  return getProviderEntry(clipSource)?.maxSpeakers ?? Infinity;
}

export function getProviderLabel(clipSource: string | null | undefined): string {
  if (!clipSource) return "Hailuo";
  return getProviderEntry(clipSource)?.label ?? clipSource;
}

/** v425 lip-sync certified master plate providers (capability only). */
export const LIPSYNC_CERTIFIED_SOURCES: readonly string[] = Object.entries(PROVIDER_MATRIX)
  .filter(([, cap]) => cap.lipsync && cap.nativeLipSync !== true)
  .map(([key]) => key);

export function snapDurationToProvider(
  requested: number,
  clipSource: string | null | undefined,
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
 * Verbatim port of the dialog master clamp:
 *  - Hailuo: `>= 10 → 10`, otherwise `6`
 *  - HappyHorse: continuous 3–15 s
 *  - other providers: snap into the bucket list
 */
export function clampProviderDuration(
  clipSource: string | null | undefined,
  duration: number,
): number {
  const picked = Number.isFinite(duration) ? Math.ceil(duration) : 6;
  if (clipSource === "ai-hailuo") return picked >= 10 ? 10 : 6;
  if (clipSource === "ai-happyhorse") return Math.min(15, Math.max(3, picked));
  return snapDurationToProvider(picked, clipSource).duration;
}

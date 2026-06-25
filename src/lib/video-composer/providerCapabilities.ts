/**
 * providerCapabilities — Single source of truth for what each AI video
 * provider can actually do in the Cinematic-Sync / Lip-Sync pipeline.
 *
 * Used by:
 *  - SceneDialogStudio (duration picker)
 *  - SceneCard (provider picker, lip-sync badges)
 *  - validateSceneForCinematicSync (frontend preflight)
 *  - compose-video-clips edge function (backend duration guard)
 *
 * RULE: never hard-snap a duration silently. If the user picks a value
 * the provider can't honour, surface it (UI snap with toast, or backend
 * 400) instead of changing clip_source / duration_seconds behind the scenes.
 */

export type ClipSource =
  | 'ai-hailuo'
  | 'ai-happyhorse'
  | 'ai-kling'
  | 'ai-veo'
  | 'ai-wan'
  | 'ai-seedance'
  | 'ai-luma'
  | 'ai-sora'
  | 'ai-pika'
  | 'ai-runway'
  | 'ai-vidu'
  | 'ai-kling-omni';

export interface ProviderCapability {
  /** Allowed duration buckets (in whole seconds). Picker must restrict to these. */
  durations: number[];
  /** Whether this provider can act as Sync.so master plate (lip-sync). */
  lipsync: boolean;
  /** Whether the provider supports multi-speaker dialog scenes. */
  multiSpeaker: boolean;
  /** Human-readable label for UI hints. */
  label: string;
}

export const PROVIDER_CAPS: Record<string, ProviderCapability> = {
  'ai-hailuo': {
    durations: [6, 10],
    lipsync: true,
    multiSpeaker: true,
    label: 'Hailuo',
  },
  'ai-happyhorse': {
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    lipsync: true,
    // Single-speaker is rock-solid; multi-speaker has shown identity-drift
    // in past memory. We allow it but the user sees a Beta hint in the UI.
    multiSpeaker: true,
    label: 'HappyHorse',
  },
  'ai-kling': {
    durations: [5, 10],
    lipsync: false,
    multiSpeaker: false,
    label: 'Kling',
  },
  'ai-veo': {
    durations: [5, 8],
    lipsync: false,
    multiSpeaker: false,
    label: 'Veo',
  },
  'ai-wan': {
    durations: [5, 10],
    lipsync: false,
    multiSpeaker: false,
    label: 'Wan',
  },
  'ai-seedance': {
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    lipsync: false,
    multiSpeaker: false,
    label: 'Seedance',
  },
  'ai-luma': {
    durations: [5, 9],
    lipsync: false,
    multiSpeaker: false,
    label: 'Luma',
  },
  'ai-sora': {
    durations: [4, 8, 12],
    lipsync: false,
    multiSpeaker: false,
    label: 'Sora',
  },
  'ai-pika': {
    durations: [5, 10],
    lipsync: false,
    multiSpeaker: false,
    label: 'Pika',
  },
  'ai-runway': {
    durations: [5, 10],
    lipsync: false,
    multiSpeaker: false,
    label: 'Runway',
  },
  'ai-vidu': {
    durations: [5],
    lipsync: false,
    multiSpeaker: false,
    label: 'Vidu',
  },
  'ai-kling-omni': {
    durations: [5, 10],
    lipsync: false,
    multiSpeaker: false,
    label: 'Kling Omni',
  },
};

const DEFAULT_LIPSYNC_PROVIDER: ClipSource = 'ai-hailuo';

export function getProviderDurations(clipSource: string | undefined | null): number[] {
  if (!clipSource) return PROVIDER_CAPS[DEFAULT_LIPSYNC_PROVIDER].durations;
  return PROVIDER_CAPS[clipSource]?.durations ?? PROVIDER_CAPS[DEFAULT_LIPSYNC_PROVIDER].durations;
}

export function providerSupportsLipsync(clipSource: string | undefined | null): boolean {
  if (!clipSource) return false;
  return !!PROVIDER_CAPS[clipSource]?.lipsync;
}

export function providerSupportsMultiSpeaker(clipSource: string | undefined | null): boolean {
  if (!clipSource) return false;
  return !!PROVIDER_CAPS[clipSource]?.multiSpeaker;
}

export function getProviderLabel(clipSource: string | undefined | null): string {
  if (!clipSource) return 'Hailuo';
  return PROVIDER_CAPS[clipSource]?.label ?? clipSource;
}

/**
 * Snap a requested duration to the nearest value the provider supports.
 * Returns { duration, changed } so the caller can show a toast when changed.
 *
 * Algorithm: pick the smallest allowed value that is >= requested. If the
 * request exceeds the max, use the max. If below the min, use the min.
 * For continuous ranges this preserves the user intent better than rounding.
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
  // Pick smallest allowed >= requested, fall back to max
  const next = allowed.find((d) => d >= requested);
  const picked = next ?? allowed[allowed.length - 1];
  // For tiny values below min, use min
  const min = allowed[0];
  const max = allowed[allowed.length - 1];
  const final = requested < min ? min : requested > max ? max : picked;
  return { duration: final, changed: final !== requested };
}

/**
 * All lip-sync capable providers (used to build provider dropdowns
 * when scene is in dialog/lipsync mode).
 */
export function getLipsyncProviders(): ClipSource[] {
  return Object.entries(PROVIDER_CAPS)
    .filter(([, cap]) => cap.lipsync)
    .map(([key]) => key as ClipSource);
}

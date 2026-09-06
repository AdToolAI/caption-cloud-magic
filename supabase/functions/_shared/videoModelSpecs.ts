// ============================================================================
// CANONICAL VIDEO MODEL CAPABILITY REGISTRY
// ----------------------------------------------------------------------------
// This file is the ONE manually maintained source of truth for every video
// generation model AdTool AI exposes. The client mirror
// `src/config/videoModelSpecs.ts` is GENERATED from this file
// (`node scripts/generate-video-model-specs.mjs`) and guarded by a hash test —
// never edit the mirror by hand.
//
// Hard rules (Full Video Model & Provider Parity Upgrade, 06.09.2026):
//  1. Capabilities are declared PER MODE, never per model.
//  2. Every resolution carries exact pixel dimensions — never a bare "4K".
//  3. Native generation and Enhance/Upscale tiers are strictly separated.
//  4. No silent clamps: an invalid combination is rejected, never rewritten.
//  5. The provider docs for the EXACT route we call plus a passing smoke test
//     are the source of truth — not the model name and not marketing pages.
// ============================================================================

/** Generation mode. Capabilities are always scoped to one of these. */
export type VideoMode =
  | 't2v'
  | 'i2v'
  | 'firstLast'
  | 'reference'
  | 'v2v'
  | 'edit'
  | 'extend'
  | 'reframe'
  | 'audioToVideo';

/**
 * How the provider interprets a resolution label.
 *  - `orientation-aware`: short edge is held, so portrait really is 2160x3840.
 *  - `long-edge`: the label counts lines on the LONG edge, so a portrait clip
 *    stays far below the nominal tier (the Topaz portrait trap).
 *  - `fixed`: the provider renders one fixed frame regardless of the request.
 */
export type OrientationBehavior = 'orientation-aware' | 'long-edge' | 'fixed';

export type ReleaseStatus = 'live' | 'beta' | 'preview' | 'maintenance' | 'deprecated' | 'removed';

/**
 * Verification state of a (model x route x region x mode) combination.
 *  - `UNVERIFIED`: inherited from the pre-upgrade registry, route audit pending.
 *  - `VERIFY`: was verified once but a regression or a stale check flagged it.
 *  - `FULL_PARITY`: route audited, priced, smoke-tested and output-measured.
 */
export type ParityStatus = 'UNVERIFIED' | 'VERIFY' | 'FULL_PARITY';

export type UiGroup =
  | 'flagship'
  | 'professional'
  | 'audio'
  | 'fast'
  | 'economy'
  | 'legacy';

export interface PixelFrame {
  width: number;
  height: number;
}

export interface ResolutionSpec {
  /** Human label exactly as shown in the UI ("1080p", "4K"). */
  label: string;
  /** Short edge in pixels — the unambiguous part of the label. */
  shortEdge: number;
  /** Exact frame at 16:9 landscape. */
  landscape: PixelFrame;
  /** Exact frame at 9:16 portrait. */
  portrait: PixelFrame;
  orientationBehavior: OrientationBehavior;
  /** True = the provider renders these pixels. False = post-generation upscale. */
  native: boolean;
  /** Catalog id used for billing this exact tier. */
  pricingId: string;
  /** Durations allowed at THIS resolution when narrower than the mode default. */
  durations?: number[];
}

export interface ModeControls {
  seed?: boolean;
  negativePrompt?: boolean;
  cameraPresets?: string[];
  motionStrength?: boolean;
  promptEnhance?: boolean;
  smartDuration?: boolean;
}

export interface ModeInputs {
  firstFrame?: boolean;
  lastFrame?: boolean;
  images?: { min: number; max: number };
  videos?: { min: number; max: number };
  audios?: { min: number; max: number };
}

export interface ModeConstraint {
  /** Resolution label this constraint applies to (omit = whole mode). */
  resolution?: string;
  /** The ONLY durations valid under this constraint. */
  durations?: number[];
  /** The ONLY aspect ratios valid under this constraint. */
  aspectRatios?: string[];
  /** Machine-readable reason, surfaced with 400 INVALID_MODEL_CAPABILITY. */
  reason: string;
}

export interface ModeSpec {
  mode: VideoMode;
  resolutions: ResolutionSpec[];
  durations: number[];
  aspectRatios: string[];
  fps?: number[];
  audio: boolean;
  hdr?: boolean;
  outputFormats?: string[];
  controls: ModeControls;
  inputs: ModeInputs;
  constraints?: ModeConstraint[];
}

export interface SmokeTestRecord {
  runId: string;
  verifiedAt: string;
  resolutionLabel: string;
  measured: {
    width: number;
    height: number;
    fps?: number;
    durationSeconds?: number;
    codec?: string;
    bitrateKbps?: number;
    fileSizeBytes?: number;
    hasAudio?: boolean;
  };
  pricing?: {
    estimatedProviderCost: number;
    actualProviderCost: number;
    chargedCredits: number;
    effectiveMargin: number;
  };
}

export interface VideoModelSpec {
  /** Stable id — identical to the id persisted on existing generations. */
  id: string;
  displayName: string;
  family: string;
  /** Provider-facing generation label, e.g. "2.5", "3.1". */
  generation: string;
  provider: string;
  /** The slug we actually send to the provider. */
  providerModelSlug: string;
  /** The concrete API route we call. Capabilities are ALWAYS route-scoped. */
  apiRoute: string;
  /** Region / deployment of that route. Part of the parity key. */
  region: string;
  apiVersion: string;
  /** Edge function that owns the dispatch. */
  edgeFunction: string;
  releaseStatus: ReleaseStatus;
  deprecated: boolean;
  /** Required whenever `deprecated` is true. */
  supersededBy?: string;
  /** Set on pure alias ids that resolve to another spec. */
  aliasOf?: string;
  uiGroup: UiGroup;
  /** Selectable in the UI. */
  available: boolean;
  parityStatus: ParityStatus;
  /**
   * Inherited from the pre-upgrade registry and shipping today. Grandfathered
   * entries may stay `available` without a smoke test; every NEW tier must be
   * smoke-tested before it is switched on.
   */
  grandfathered?: boolean;
  lastVerifiedAt: string;
  providerDocsVersion: string;
  verificationSourceUrl: string;
  verificationNotes: string;
  verifiedBy: string;
  smokeTest?: SmokeTestRecord;
  /** Upscale tiers offered via Video Enhance — never native generation. */
  enhanceUpscaleTiers?: string[];
  modes: ModeSpec[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRAMES: Record<number, { long: number }> = {
  480: { long: 854 },
  540: { long: 960 },
  720: { long: 1280 },
  768: { long: 1366 },
  1080: { long: 1920 },
  1440: { long: 2560 },
  2160: { long: 3840 },
  4320: { long: 7680 },
};

/** Builds an exactly defined resolution entry. Never emit a bare label. */
export function res(
  label: string,
  shortEdge: number,
  pricingId: string,
  opts: {
    orientationBehavior?: OrientationBehavior;
    native?: boolean;
    durations?: number[];
  } = {},
): ResolutionSpec {
  const long = FRAMES[shortEdge]?.long ?? Math.round((shortEdge * 16) / 9);
  return {
    label,
    shortEdge,
    landscape: { width: long, height: shortEdge },
    portrait: { width: shortEdge, height: long },
    orientationBehavior: opts.orientationBehavior ?? 'orientation-aware',
    native: opts.native ?? true,
    pricingId,
    ...(opts.durations ? { durations: opts.durations } : {}),
  };
}

const NO_CONTROLS: ModeControls = {};

interface ModeInit extends Omit<ModeSpec, 'mode' | 'controls' | 'inputs'> {
  controls?: ModeControls;
  inputs?: ModeInputs;
}

function mode(m: VideoMode, init: ModeInit): ModeSpec {
  return {
    mode: m,
    controls: init.controls ?? NO_CONTROLS,
    inputs: init.inputs ?? {},
    ...init,
    mode_: undefined,
  } as unknown as ModeSpec;
}

// ---------------------------------------------------------------------------
// Specs — one entry per (model x route). Route audits per Phase 2 fill these in.
// ---------------------------------------------------------------------------

const UNAUDITED = {
  parityStatus: 'UNVERIFIED' as ParityStatus,
  grandfathered: true,
  lastVerifiedAt: '2026-08-11',
  verifiedBy: 'registry-import',
};

export const VIDEO_MODEL_SPECS: VideoModelSpec[] = [
  /* ───────────────────────── Seedance / ByteDance ───────────────────────── */
  {
    id: 'seedance-2-5',
    displayName: 'Seedance 2.5',
    family: 'seedance',
    generation: '2.5',
    provider: 'ByteDance',
    providerModelSlug: 'seedance-2-5',
    apiRoute: 'modelark:/api/v3/contents/generations/tasks',
    region: 'global',
    apiVersion: 'v3',
    edgeFunction: 'generate-seedance25-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'ModelArk 10.08.2026',
    verificationSourceUrl: 'https://www.volcengine.com/docs/82379',
    verificationNotes:
      'Multimodales Flaggschiff. Über diese LAS/ModelArk-Route ist 720p das native Maximum — 1080p/4K sind hier NICHT verfügbar (dafür Seedance 2.0).',
    ...UNAUDITED,
    enhanceUpscaleTiers: ['2K', '4K'],
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'seedance-2-5'), res('480p', 480, 'seedance-2-5-480p')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: true,
        controls: { smartDuration: true, promptEnhance: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'seedance-2-5'), res('480p', 480, 'seedance-2-5-480p')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: true,
        controls: { smartDuration: true },
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [res('720p', 720, 'seedance-2-5'), res('480p', 480, 'seedance-2-5-480p')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: true,
        controls: { smartDuration: true },
        inputs: { firstFrame: true, lastFrame: true },
        constraints: [
          {
            reason:
              'ModelArk akzeptiert genau EINEN Input-Modus je Task: First-Frame, First+Last-Frame und Referenzen schließen sich aus.',
          },
        ],
      }),
      mode('reference', {
        resolutions: [res('720p', 720, 'seedance-2-5'), res('480p', 480, 'seedance-2-5-480p')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: true,
        controls: { smartDuration: true },
        inputs: { images: { min: 1, max: 30 }, videos: { min: 0, max: 10 }, audios: { min: 0, max: 10 } },
        constraints: [
          {
            reason:
              'Referenzen belegen den exklusiven Input-Slot — nicht mit Start-/Endbild kombinierbar.',
          },
        ],
      }),
      mode('v2v', {
        resolutions: [res('720p', 720, 'seedance-2-5')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: true,
        controls: { smartDuration: true },
        inputs: { videos: { min: 1, max: 10 } },
      }),
      mode('edit', {
        resolutions: [res('720p', 720, 'seedance-2-5')],
        durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: {},
        inputs: { videos: { min: 1, max: 1 } },
      }),
    ],
  },
  {
    id: 'seedance-standard',
    displayName: 'Seedance 2.0 Fast',
    family: 'seedance',
    generation: '2.0',
    provider: 'ByteDance',
    providerModelSlug: 'bytedance/seedance-2.0-fast',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-seedance-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/bytedance',
    verificationNotes:
      'Seedance 2.0 ist der Hochauflösungspfad der Familie. 1080p/4K sind laut BytePlus dieser Generation vorbehalten — Freischaltung erst nach Routen-Audit und Smoke-Test auf UNSEREM Endpoint.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'seedance-standard')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'seedance-standard')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'seedance-pro',
    displayName: 'Seedance 2.0',
    family: 'seedance',
    generation: '2.0',
    provider: 'ByteDance',
    providerModelSlug: 'bytedance/seedance-2.0',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-seedance-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/bytedance',
    verificationNotes:
      'Hochauflösungspfad der Seedance-Familie. 1080p/4K bleiben bis zum bestandenen Smoke-Test auf dieser Route gesperrt.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'seedance-pro')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'seedance-pro')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'seedance-mini',
    displayName: 'Seedance 1 Lite',
    family: 'seedance',
    generation: '1.0',
    provider: 'ByteDance',
    providerModelSlug: 'bytedance/seedance-1-lite',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-seedance-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'economy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/bytedance/seedance-1-lite',
    verificationNotes: 'Draft-Renderer. Vorgänger-Generation, bewusst als günstige Alternative erhalten.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'seedance-mini'), res('480p', 480, 'seedance-mini')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'seedance-mini'), res('480p', 480, 'seedance-mini')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [res('720p', 720, 'seedance-mini'), res('480p', 480, 'seedance-mini')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true, lastFrame: true },
      }),
    ],
  },

  /* ───────────────────────────── Kling ───────────────────────────── */
  {
    id: 'kling-2.5-turbo',
    displayName: 'Kling 2.5 Turbo',
    family: 'kling',
    generation: '2.5',
    provider: 'Kuaishou',
    providerModelSlug: 'kwaivgi/kling-v2.5-turbo-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-kling-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/kwaivgi/kling-v2.5-turbo-pro',
    verificationNotes:
      'Registry zeigte 720p, die Edge Function rendert real 1080p. Bis zum Smoke-Test wird konservativ 1080p als Ausgabe geführt, aber nicht als geprüft markiert.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'kling-2.5-turbo')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'kling-2.5-turbo')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'kling-2.6',
    displayName: 'Kling 2.6',
    family: 'kling',
    generation: '2.6',
    provider: 'Kuaishou',
    providerModelSlug: 'kwaivgi/kling-v2.6',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-kling-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'audio',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/kwaivgi',
    verificationNotes: 'Dauer-Drift geschlossen: Provider-Enum ist [5, 10] — Katalog erlaubte bisher 15 s.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'kling-2.6')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'kling-2.6')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'kling-3',
    displayName: 'Kling 3.0',
    family: 'kling',
    generation: '3.0',
    provider: 'Kuaishou',
    providerModelSlug: 'kwaivgi/kling-v3-video',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-kling-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/kwaivgi',
    verificationNotes: 'Kein 4K-Tier: Web-App-Funktionen zählen nicht, nur der Endpoint-Slug.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'kling-3')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'kling-3')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'kling-omni',
    displayName: 'Kling 3.0 Omni',
    family: 'kling',
    generation: '3.0',
    provider: 'Kuaishou',
    providerModelSlug: 'kwaivgi/kling-v3-omni-video',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-kling-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'professional',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/kwaivgi',
    verificationNotes: 'Nativer Dialog (EN). Referenzbilder max. 7, mit Referenzvideo max. 4.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'kling-omni')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'kling-omni')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
      mode('reference', {
        resolutions: [res('1080p', 1080, 'kling-omni')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { images: { min: 1, max: 7 } },
      }),
      mode('v2v', {
        resolutions: [res('1080p', 1080, 'kling-omni')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: {},
        inputs: { videos: { min: 1, max: 1 }, images: { min: 0, max: 4 } },
      }),
    ],
  },

  /* ────────────────────────────── Veo ────────────────────────────── */
  {
    id: 'veo-3.1-lite-720p',
    displayName: 'Veo 3.1 Lite',
    family: 'veo',
    generation: '3.1',
    provider: 'Google',
    providerModelSlug: 'google/veo-3.1-fast',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-veo-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'audio',
    available: true,
    providerDocsVersion: 'Google Veo 3.1 / Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/google/veo-3.1-fast',
    verificationNotes:
      'Lite-Preisstufe desselben Slugs. Google dokumentiert für Lite KEIN 4K — die Stufe existiert hier bewusst nicht.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'veo-3.1-lite-720p')],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'veo-3.1-lite-720p')],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
      mode('reference', {
        resolutions: [res('720p', 720, 'veo-3.1-lite-720p')],
        durations: [8],
        aspectRatios: ['16:9'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { images: { min: 1, max: 3 } },
        constraints: [
          {
            durations: [8],
            aspectRatios: ['16:9'],
            reason: 'Veo 3.1 akzeptiert reference_images ausschließlich bei 16:9 und 8 Sekunden.',
          },
        ],
      }),
    ],
  },
  {
    id: 'veo-3.1-fast',
    displayName: 'Veo 3.1 Fast',
    family: 'veo',
    generation: '3.1',
    provider: 'Google',
    providerModelSlug: 'google/veo-3.1-fast',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-veo-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'audio',
    available: true,
    providerDocsVersion: 'Google Veo 3.1 / Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/google/veo-3.1-fast',
    verificationNotes:
      '1080p ist laut Google an 8 Sekunden gebunden. 4K erst nach Routen-Audit + Smoke-Test auf genau dieser Route.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'veo-3.1-fast', { durations: [8] })],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
        constraints: [
          { resolution: '1080p', durations: [8], reason: 'Veo 3.1 liefert 1080p ausschließlich bei 8 Sekunden.' },
        ],
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'veo-3.1-fast', { durations: [8] })],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
        constraints: [
          { resolution: '1080p', durations: [8], reason: 'Veo 3.1 liefert 1080p ausschließlich bei 8 Sekunden.' },
        ],
      }),
      mode('reference', {
        resolutions: [res('1080p', 1080, 'veo-3.1-fast', { durations: [8] })],
        durations: [8],
        aspectRatios: ['16:9'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { images: { min: 1, max: 3 } },
        constraints: [
          {
            durations: [8],
            aspectRatios: ['16:9'],
            reason: 'Veo 3.1 akzeptiert reference_images ausschließlich bei 16:9 und 8 Sekunden.',
          },
        ],
      }),
    ],
  },
  {
    id: 'veo-3.1-pro',
    displayName: 'Veo 3.1 Pro',
    family: 'veo',
    generation: '3.1',
    provider: 'Google',
    providerModelSlug: 'google/veo-3.1',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-veo-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Google Veo 3.1 / Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/google/veo-3.1',
    verificationNotes:
      'Höchste Veo-Stufe. 4K-Tier ist dokumentiert (8 s), bleibt aber bis zu Preiszeile + Smoke-Test gesperrt.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'veo-3.1-pro', { durations: [8] })],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
        constraints: [
          { resolution: '1080p', durations: [8], reason: 'Veo 3.1 liefert 1080p ausschließlich bei 8 Sekunden.' },
        ],
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'veo-3.1-pro', { durations: [8] })],
        durations: [4, 6, 8],
        aspectRatios: ['16:9', '9:16'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
        constraints: [
          { resolution: '1080p', durations: [8], reason: 'Veo 3.1 liefert 1080p ausschließlich bei 8 Sekunden.' },
        ],
      }),
      mode('reference', {
        resolutions: [res('1080p', 1080, 'veo-3.1-pro', { durations: [8] })],
        durations: [8],
        aspectRatios: ['16:9'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { images: { min: 1, max: 3 } },
        constraints: [
          {
            durations: [8],
            aspectRatios: ['16:9'],
            reason: 'Veo 3.1 akzeptiert reference_images ausschließlich bei 16:9 und 8 Sekunden.',
          },
        ],
      }),
    ],
  },

  /* ────────────────────────────── Grok ────────────────────────────── */
  {
    id: 'grok-imagine',
    displayName: 'Grok Imagine',
    family: 'grok',
    generation: '1.0',
    provider: 'xAI',
    providerModelSlug: 'xai/grok-imagine-video',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-grok-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'audio',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/xai/grok-imagine-video',
    verificationNotes:
      'Auf dieser Route max. 720p. Grok Imagine Video 1.5 (1080p T2V/I2V, Reference bis 720p) erfordert einen eigenen Routen-Audit.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'grok-imagine'), res('480p', 480, 'grok-imagine')],
        durations: [5, 6, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'],
        audio: true,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'grok-imagine'), res('480p', 480, 'grok-imagine')],
        durations: [5, 6, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'],
        audio: true,
        controls: {},
        inputs: { firstFrame: true },
      }),
    ],
  },

  /* ────────────────────────────── LTX ────────────────────────────── */
  {
    id: 'ltx-standard',
    displayName: 'LTX 2.3 Fast',
    family: 'ltx',
    generation: '2.3',
    provider: 'Lightricks',
    providerModelSlug: 'lightricks/ltx-2.3-fast',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-ltx-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/lightricks',
    verificationNotes:
      'Stiller Clamp beseitigt: ab 10 s rendert der Provider nur 1080p. 2K/4K sind daher explizit an Dauern <= 8 s gebunden statt heimlich herabgestuft.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [
          res('1080p', 1080, 'ltx-standard'),
          res('2K', 1440, 'ltx-standard', { durations: [6, 8] }),
          res('4K', 2160, 'ltx-standard', { durations: [6, 8] }),
        ],
        durations: [6, 8, 10, 12, 14, 16, 18, 20],
        aspectRatios: ['16:9', '9:16'],
        fps: [24, 25],
        audio: true,
        controls: { seed: true, cameraPresets: ['static', 'pan', 'tilt', 'zoom-in', 'zoom-out', 'orbit'] },
        inputs: {},
        constraints: [
          { resolution: '2K', durations: [6, 8], reason: 'LTX rendert oberhalb 1080p nur bis 8 Sekunden.' },
          { resolution: '4K', durations: [6, 8], reason: 'LTX rendert oberhalb 1080p nur bis 8 Sekunden.' },
        ],
      }),
      mode('i2v', {
        resolutions: [
          res('1080p', 1080, 'ltx-standard'),
          res('2K', 1440, 'ltx-standard', { durations: [6, 8] }),
          res('4K', 2160, 'ltx-standard', { durations: [6, 8] }),
        ],
        durations: [6, 8, 10, 12, 14, 16, 18, 20],
        aspectRatios: ['16:9', '9:16'],
        fps: [24, 25],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true, lastFrame: true },
        constraints: [
          { resolution: '2K', durations: [6, 8], reason: 'LTX rendert oberhalb 1080p nur bis 8 Sekunden.' },
          { resolution: '4K', durations: [6, 8], reason: 'LTX rendert oberhalb 1080p nur bis 8 Sekunden.' },
        ],
      }),
    ],
  },
  {
    id: 'ltx-pro',
    displayName: 'LTX 2.3 Pro',
    family: 'ltx',
    generation: '2.3',
    provider: 'Lightricks',
    providerModelSlug: 'lightricks/ltx-2.3-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-ltx-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/lightricks',
    verificationNotes: 'LTX 2.5 Fast/Pro ist der Nachfolgerpfad — Aufnahme erst nach Routen-Audit.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'ltx-pro')],
        durations: [6, 8, 10],
        aspectRatios: ['16:9', '9:16'],
        fps: [24, 25],
        audio: true,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'ltx-pro')],
        durations: [6, 8, 10],
        aspectRatios: ['16:9', '9:16'],
        fps: [24, 25],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },

  /* ────────────────────────────── Wan ────────────────────────────── */
  {
    id: 'wan-2-7-standard',
    displayName: 'Wan 2.7',
    family: 'wan',
    generation: '2.7',
    provider: 'Alibaba Wan',
    providerModelSlug: 'wan-video/wan-2.7',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-wan-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'audio',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/wan-video',
    verificationNotes: 'Stabiler Wan-Pfad und Fallback, solange Wan 3.0 nur als Preview verfügbar ist.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'wan-2-7-standard')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'wan-2-7-standard')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'wan-2-7-pro',
    displayName: 'Wan 2.7 Pro',
    family: 'wan',
    generation: '2.7',
    provider: 'Alibaba Wan',
    providerModelSlug: 'wan-video/wan-2.7-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-wan-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/wan-video',
    verificationNotes: '1080p-Stufe der 2.7-Generation.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'wan-2-7-pro')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'wan-2-7-pro')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'wan-2-6-standard',
    displayName: 'Wan 2.6',
    family: 'wan',
    generation: '2.6',
    provider: 'Wan Video',
    providerModelSlug: 'wan-video/wan-2.6',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-wan-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'economy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/wan-video',
    verificationNotes: 'Vorgänger-Generation, bewusst als günstige Alternative erhalten.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'wan-2-6-standard')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'wan-2-6-standard')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'wan-2-6-pro',
    displayName: 'Wan 2.6 Pro',
    family: 'wan',
    generation: '2.6',
    provider: 'Wan Video',
    providerModelSlug: 'wan-video/wan-2.6-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-wan-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'economy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/wan-video',
    verificationNotes: 'Vorgänger-Generation mit 1080p.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'wan-2-6-pro')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'wan-2-6-pro')],
        durations: [5, 10, 15],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'wan-standard',
    displayName: 'Wan 2.5',
    family: 'wan',
    generation: '2.5',
    provider: 'Wan Video',
    providerModelSlug: 'wan-video/wan-2.5',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-wan-video',
    releaseStatus: 'live',
    deprecated: true,
    supersededBy: 'wan-2-7-standard',
    uiGroup: 'legacy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/wan-video',
    verificationNotes: 'Legacy — nicht mehr prominent, bleibt für bestehende Projekte wählbar.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'wan-standard')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'wan-standard')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },

  /* ──────────────────────── MiniMax / Hailuo ──────────────────────── */
  {
    id: 'hailuo-standard',
    displayName: 'Hailuo 2.3',
    family: 'hailuo',
    generation: '2.3',
    provider: 'MiniMax',
    providerModelSlug: 'minimax/hailuo-02',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-hailuo-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/minimax',
    verificationNotes:
      'Route-scoped: die MiniMax-Direct-API und Runway-hosted MiniMax sind eigene Specs. Auf dieser Route kein aspect_ratio-Parameter (T2V immer 16:9).',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('768p', 768, 'hailuo-standard')],
        durations: [6, 10],
        aspectRatios: ['16:9'],
        audio: false,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('768p', 768, 'hailuo-standard')],
        durations: [6, 10],
        aspectRatios: ['16:9'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'hailuo-pro',
    displayName: 'Hailuo 2.3 Pro',
    family: 'hailuo',
    generation: '2.3',
    provider: 'MiniMax',
    providerModelSlug: 'minimax/hailuo-02-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-hailuo-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/minimax',
    verificationNotes: '1080p ist bei MiniMax an 6 Sekunden gebunden; 10 s laufen nur auf 768p.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [
          res('1080p', 1080, 'hailuo-pro', { durations: [6] }),
          res('768p', 768, 'hailuo-pro', { durations: [6, 10] }),
        ],
        durations: [6, 10],
        aspectRatios: ['16:9'],
        audio: false,
        controls: {},
        inputs: {},
        constraints: [
          { resolution: '1080p', durations: [6], reason: 'MiniMax liefert 1080p ausschließlich bei 6 Sekunden.' },
        ],
      }),
      mode('i2v', {
        resolutions: [
          res('1080p', 1080, 'hailuo-pro', { durations: [6] }),
          res('768p', 768, 'hailuo-pro', { durations: [6, 10] }),
        ],
        durations: [6, 10],
        aspectRatios: ['16:9'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true },
        constraints: [
          { resolution: '1080p', durations: [6], reason: 'MiniMax liefert 1080p ausschließlich bei 6 Sekunden.' },
        ],
      }),
    ],
  },

  /* ────────────────────────────── Luma ────────────────────────────── */
  {
    id: 'luma-ray32-5s',
    displayName: 'Luma Ray 3.2 (5s)',
    family: 'luma',
    generation: '3.2',
    provider: 'Luma AI',
    providerModelSlug: 'luma/ray-3.2',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-luma-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'professional',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/luma',
    verificationNotes:
      'Kamera-Presets liegen in lumaVideoCredits.ts bereits vor und werden über diese Spec erstmals in der UI exponiert. HDR/EXR/Reframe erfordern die Luma-Direct-Route (eigener Audit).',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'luma-ray32-5s'), res('720p', 720, 'luma-ray32-5s'), res('540p', 540, 'luma-ray32-5s')],
        durations: [5],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: {
          cameraPresets: [
            'static', 'move-left', 'move-right', 'move-up', 'move-down',
            'push-in', 'pull-out', 'pan-left', 'pan-right', 'orbit-left', 'orbit-right',
          ],
        },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'luma-ray32-5s'), res('720p', 720, 'luma-ray32-5s'), res('540p', 540, 'luma-ray32-5s')],
        durations: [5],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [res('1080p', 1080, 'luma-ray32-5s'), res('720p', 720, 'luma-ray32-5s'), res('540p', 540, 'luma-ray32-5s')],
        durations: [5],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true, lastFrame: true },
        constraints: [
          { durations: [5], reason: 'Ray 3.2 akzeptiert Start-/Endbilder nur im 5-Sekunden-Tier.' },
        ],
      }),
    ],
  },
  {
    id: 'luma-ray32-10s',
    displayName: 'Luma Ray 3.2 (10s)',
    family: 'luma',
    generation: '3.2',
    provider: 'Luma AI',
    providerModelSlug: 'luma/ray-3.2',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-luma-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'professional',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/luma',
    verificationNotes: '10-Sekunden-Tier ist reines Text-to-Video; Start-/Endbilder und loop werden abgelehnt.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'luma-ray32-10s'), res('720p', 720, 'luma-ray32-10s'), res('540p', 540, 'luma-ray32-10s')],
        durations: [10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: {},
        inputs: {},
      }),
    ],
  },
  {
    id: 'luma-standard',
    displayName: 'Luma Ray 2',
    family: 'luma',
    generation: '2.0',
    provider: 'Luma AI',
    providerModelSlug: 'luma/ray-2-720p',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-luma-video',
    releaseStatus: 'live',
    deprecated: true,
    supersededBy: 'luma-ray32-5s',
    uiGroup: 'legacy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/luma',
    verificationNotes: 'Legacy nach Ray 3.2.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'luma-standard')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'luma-standard')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true, lastFrame: true },
      }),
    ],
  },
  {
    id: 'luma-pro',
    displayName: 'Luma Ray 2 Pro',
    family: 'luma',
    generation: '2.0',
    provider: 'Luma AI',
    providerModelSlug: 'luma/ray-2-720p',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-luma-video',
    releaseStatus: 'live',
    deprecated: true,
    supersededBy: 'luma-ray32-5s',
    uiGroup: 'legacy',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/luma',
    verificationNotes: 'Legacy nach Ray 3.2. Kein Resolution-Input — der Slug rendert ausschließlich 720p.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'luma-pro')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'luma-pro')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true, lastFrame: true },
      }),
    ],
  },

  /* ───────────────────────────── Runway ───────────────────────────── */
  {
    id: 'runway-gen4-aleph',
    displayName: 'Runway Gen-4 Aleph',
    family: 'runway',
    generation: '4.0',
    provider: 'Runway',
    providerModelSlug: 'runwayml/gen4-aleph',
    apiRoute: 'runway:/v1/video_to_video',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-runway-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'professional',
    available: true,
    providerDocsVersion: 'Runway API 11.08.2026',
    verificationSourceUrl: 'https://docs.dev.runwayml.com',
    verificationNotes:
      'Reiner V2V-Spezialist. Gen-4.5 und Aleph 2.0 inkl. ProRes/PNG-Sequence/10-bit/HDR sind Wave 3 nach Routen-Audit.',
    ...UNAUDITED,
    modes: [
      mode('v2v', {
        resolutions: [res('720p', 720, 'runway-gen4-aleph')],
        durations: [5],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: { seed: true },
        inputs: { videos: { min: 1, max: 1 }, images: { min: 0, max: 1 } },
      }),
    ],
  },

  /* ────────────────────────────── Pika ────────────────────────────── */
  {
    id: 'pika-2-2-standard',
    displayName: 'Pika 2.2',
    family: 'pika',
    generation: '2.2',
    provider: 'Pika Labs (fal.ai)',
    providerModelSlug: 'fal-ai/pika/v2.2/text-to-video',
    apiRoute: 'fal:/fal-ai/pika',
    region: 'global',
    apiVersion: 'v2.2',
    edgeFunction: 'generate-pika-video',
    releaseStatus: 'maintenance',
    deprecated: false,
    uiGroup: 'economy',
    available: false,
    providerDocsVersion: 'fal.ai 11.08.2026',
    verificationSourceUrl: 'https://fal.ai/models/fal-ai/pika',
    verificationNotes:
      'Kein zuverlässiger Providerzugang — bewusst NICHT als Flagship geführt. Pikaswaps/Pikadditions/Pikatwists erst bei bestätigtem Zugang.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'pika-2-2-standard')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:5', '5:4', '3:2', '2:3'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'pika-2-2-standard')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:5', '5:4', '3:2', '2:3'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'pika-2-2-pro',
    displayName: 'Pika 2.2 Pro',
    family: 'pika',
    generation: '2.2',
    provider: 'Pika Labs (fal.ai)',
    providerModelSlug: 'fal-ai/pika/v2.2/pro',
    apiRoute: 'fal:/fal-ai/pika',
    region: 'global',
    apiVersion: 'v2.2',
    edgeFunction: 'generate-pika-video',
    releaseStatus: 'maintenance',
    deprecated: false,
    uiGroup: 'economy',
    available: false,
    providerDocsVersion: 'fal.ai 11.08.2026',
    verificationSourceUrl: 'https://fal.ai/models/fal-ai/pika',
    verificationNotes: 'Kein zuverlässiger Providerzugang.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'pika-2-2-pro')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:5', '5:4', '3:2', '2:3'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'pika-2-2-pro')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1', '4:5', '5:4', '3:2', '2:3'],
        audio: false,
        controls: { seed: true, negativePrompt: true },
        inputs: { firstFrame: true },
      }),
    ],
  },

  /* ────────────────────────────── Vidu ────────────────────────────── */
  {
    id: 'vidu-q2-reference',
    displayName: 'Vidu Q3 Pro',
    family: 'vidu',
    generation: 'Q3',
    provider: 'Shengshu AI',
    providerModelSlug: 'vidu/q3-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-vidu-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'professional',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/vidu',
    verificationNotes:
      'Interne ID bleibt q2-* (persistierte Läufe), das Label nennt korrekt Q3. 2K/4K/8K existieren nur als Vidu-Upscale, nie als natives Q3.',
    ...UNAUDITED,
    enhanceUpscaleTiers: ['2K', '4K', '8K'],
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'vidu-q2-reference'), res('720p', 720, 'vidu-q2-reference'), res('540p', 540, 'vidu-q2-reference')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'vidu-q2-reference'), res('720p', 720, 'vidu-q2-reference'), res('540p', 540, 'vidu-q2-reference')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [res('1080p', 1080, 'vidu-q2-reference'), res('720p', 720, 'vidu-q2-reference'), res('540p', 540, 'vidu-q2-reference')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true, lastFrame: true },
      }),
    ],
  },
  {
    id: 'vidu-q2-i2v',
    displayName: 'Vidu Q3 Pro I2V',
    family: 'vidu',
    generation: 'Q3',
    provider: 'Shengshu AI',
    providerModelSlug: 'vidu/q3-i2v',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-vidu-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/vidu',
    verificationNotes: 'Reiner Bild-zu-Video-Pfad der Q3-Familie.',
    ...UNAUDITED,
    enhanceUpscaleTiers: ['2K', '4K', '8K'],
    modes: [
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'vidu-q2-i2v'), res('720p', 720, 'vidu-q2-i2v'), res('540p', 540, 'vidu-q2-i2v')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [res('1080p', 1080, 'vidu-q2-i2v'), res('720p', 720, 'vidu-q2-i2v'), res('540p', 540, 'vidu-q2-i2v')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: { firstFrame: true, lastFrame: true },
      }),
    ],
  },
  {
    id: 'vidu-q2-t2v',
    displayName: 'Vidu Q3 Turbo',
    family: 'vidu',
    generation: 'Q3',
    provider: 'Shengshu AI',
    providerModelSlug: 'vidu/q3-turbo',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-vidu-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/vidu',
    verificationNotes: 'Turbo-Pfad. Q3 Ad / Q3 Mix sind eigene Slugs und folgen nach Routen-Audit.',
    ...UNAUDITED,
    enhanceUpscaleTiers: ['2K', '4K', '8K'],
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'vidu-q2-t2v'), res('720p', 720, 'vidu-q2-t2v'), res('540p', 540, 'vidu-q2-t2v')],
        durations: [4, 5, 6, 8, 10, 12, 16],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: true,
        controls: { seed: true },
        inputs: {},
      }),
    ],
  },

  /* ──────────────────────────── HappyHorse ─────────────────────────── */
  {
    id: 'happyhorse-standard',
    displayName: 'HappyHorse 1.0',
    family: 'happyhorse',
    generation: '1.0',
    provider: 'Alibaba',
    providerModelSlug: 'alibaba/happyhorse-1.0',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-happyhorse-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'fast',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/alibaba/happyhorse-1.0',
    verificationNotes: 'Kein Audio-Parameter und kein negative_prompt auf dieser Route.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('720p', 720, 'happyhorse-standard')],
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('720p', 720, 'happyhorse-standard')],
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'happyhorse-pro',
    displayName: 'HappyHorse 1.0 Pro',
    family: 'happyhorse',
    generation: '1.0',
    provider: 'Alibaba',
    providerModelSlug: 'alibaba/happyhorse-1.0-pro',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-happyhorse-video',
    releaseStatus: 'live',
    deprecated: false,
    uiGroup: 'flagship',
    available: true,
    providerDocsVersion: 'Replicate 11.08.2026',
    verificationSourceUrl: 'https://replicate.com/alibaba/happyhorse-1.0',
    verificationNotes: '1080p-Stufe derselben Route.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [res('1080p', 1080, 'happyhorse-pro')],
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [res('1080p', 1080, 'happyhorse-pro')],
        durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Aliases — persisted legacy ids keep resolving. Never delete an entry here.
// ---------------------------------------------------------------------------

export const VIDEO_MODEL_ALIASES: Record<string, string> = {
  'kling-3-standard': 'kling-3',
  'kling-3-pro': 'kling-3',
  'sora-2-standard': 'veo-3.1-fast',
  'sora-2-pro': 'veo-3.1-pro',
  'wan-pro': 'wan-2-7-pro',
};

// ---------------------------------------------------------------------------
// Lookup + validation
// ---------------------------------------------------------------------------

const SPEC_BY_ID = new Map(VIDEO_MODEL_SPECS.map((s) => [s.id, s]));

export function resolveVideoModelId(id: string): string {
  return VIDEO_MODEL_ALIASES[id] ?? id;
}

export function getVideoModelSpec(id: string): VideoModelSpec | undefined {
  return SPEC_BY_ID.get(resolveVideoModelId(id));
}

export function getModeSpec(spec: VideoModelSpec, m: VideoMode): ModeSpec | undefined {
  return spec.modes.find((entry) => entry.mode === m);
}

/** Highest NATIVE resolution across all modes — never an upscale tier. */
export function maxNativeResolution(spec: VideoModelSpec): ResolutionSpec | undefined {
  const all = spec.modes.flatMap((m) => m.resolutions).filter((r) => r.native);
  return all.sort((a, b) => b.shortEdge - a.shortEdge)[0];
}

/** All native resolution labels of a model, highest first. */
export function nativeResolutionLabels(spec: VideoModelSpec): string[] {
  const seen = new Map<string, number>();
  for (const m of spec.modes) {
    for (const r of m.resolutions) {
      if (r.native) seen.set(r.label, r.shortEdge);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
}

export interface CapabilityRequest {
  modelId: string;
  mode: VideoMode;
  resolution?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  fps?: number;
}

export interface CapabilityViolation {
  code: 'INVALID_MODEL_CAPABILITY';
  field: 'model' | 'mode' | 'resolution' | 'duration' | 'aspectRatio' | 'fps' | 'availability';
  message: string;
}

/**
 * Validates a generation request against the spec. Returns null when valid.
 * NEVER rewrite an invalid value — the caller must reject with 400.
 */
export function validateCapability(req: CapabilityRequest): CapabilityViolation | null {
  const spec = getVideoModelSpec(req.modelId);
  if (!spec) {
    return { code: 'INVALID_MODEL_CAPABILITY', field: 'model', message: `Unknown video model "${req.modelId}".` };
  }
  if (!spec.available) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'availability',
      message: `${spec.displayName} is currently not available (${spec.releaseStatus}).`,
    };
  }
  const modeSpec = getModeSpec(spec, req.mode);
  if (!modeSpec) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'mode',
      message: `${spec.displayName} does not support mode "${req.mode}" on route ${spec.apiRoute}.`,
    };
  }

  let resolution: ResolutionSpec | undefined = modeSpec.resolutions[0];
  if (req.resolution) {
    resolution = modeSpec.resolutions.find((r) => r.label.toLowerCase() === req.resolution!.toLowerCase());
    if (!resolution) {
      return {
        code: 'INVALID_MODEL_CAPABILITY',
        field: 'resolution',
        message: `${spec.displayName} (${req.mode}) does not render ${req.resolution}. Available: ${modeSpec.resolutions
          .map((r) => r.label)
          .join(', ')}.`,
      };
    }
  }

  if (req.durationSeconds != null) {
    const allowed = resolution?.durations ?? modeSpec.durations;
    if (!allowed.includes(req.durationSeconds)) {
      return {
        code: 'INVALID_MODEL_CAPABILITY',
        field: 'duration',
        message: `${spec.displayName} at ${resolution?.label ?? 'default'} supports ${allowed.join(
          ', ',
        )}s — not ${req.durationSeconds}s.`,
      };
    }
  }

  if (req.aspectRatio && !modeSpec.aspectRatios.includes(req.aspectRatio)) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'aspectRatio',
      message: `${spec.displayName} (${req.mode}) supports ${modeSpec.aspectRatios.join(', ')} — not ${req.aspectRatio}.`,
    };
  }

  if (req.fps != null && modeSpec.fps && !modeSpec.fps.includes(req.fps)) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'fps',
      message: `${spec.displayName} (${req.mode}) supports ${modeSpec.fps.join(', ')} fps — not ${req.fps}.`,
    };
  }

  for (const c of modeSpec.constraints ?? []) {
    if (c.resolution && c.resolution !== resolution?.label) continue;
    if (c.durations && req.durationSeconds != null && !c.durations.includes(req.durationSeconds)) {
      return { code: 'INVALID_MODEL_CAPABILITY', field: 'duration', message: c.reason };
    }
    if (c.aspectRatios && req.aspectRatio && !c.aspectRatios.includes(req.aspectRatio)) {
      return { code: 'INVALID_MODEL_CAPABILITY', field: 'aspectRatio', message: c.reason };
    }
  }

  return null;
}

/** Exact target frame for a request — the promise the smoke test verifies. */
export function projectTargetFrame(
  resolution: ResolutionSpec,
  aspectRatio: string,
): PixelFrame {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h) return resolution.landscape;
  if (h > w) return resolution.portrait;
  if (w === h) return { width: resolution.shortEdge, height: resolution.shortEdge };
  return resolution.landscape;
}

export const UI_GROUP_ORDER: UiGroup[] = [
  'flagship',
  'professional',
  'audio',
  'fast',
  'economy',
  'legacy',
];

export const VIDEO_SPECS_VERSION = '2026-09-06';

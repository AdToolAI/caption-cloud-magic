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
  /**
   * END-ONLY: a single image is sent as the LAST frame WITHOUT a first frame.
   * Only routes whose provider contract accepts an end image on its own may
   * declare this mode — it is NOT implied by `firstLast`.
   */
  | 'lastFrame'
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

/**
 * How the exact output frame of a tier is defined.
 *  - `exact-frames`: the provider documents a frame table; we list it verbatim.
 *  - `short-edge` / `long-edge` / `fixed-frame`: a DOCUMENTED provider rule the
 *    frame may be derived from. `sizingRuleSource` names where that is stated.
 */
export type SizingRule = 'exact-frames' | 'short-edge' | 'long-edge' | 'fixed-frame';

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
  /** Documented rule the frames follow. Never a generic 16:9 assumption. */
  sizingRule: SizingRule;
  /** Where that rule is documented / how it was verified. */
  sizingRuleSource: string;
  /**
   * TRUE only when the tier carries a provider-backed frame table OR a concrete
   * provider-documented sizing reference. The generic default wording is an
   * ASSUMPTION, never verification — such tiers stay UNVERIFIED.
   */
  sizingRuleVerified: boolean;
  /**
   * Exact target frame per aspect ratio — provider-backed. A ratio missing here
   * is NOT derivable and is rejected by the capability gate.
   */
  framesByAspectRatio: Record<string, PixelFrame>;
  /** True = the provider renders these pixels. False = post-generation upscale. */
  native: boolean;
  /** Catalog id used for billing this exact tier. */
  pricingId: string;
  /** Durations allowed at THIS resolution when narrower than the mode default. */
  durations?: number[];

  /**
   * Availability and verification are per TIER, never per model. A new tier on
   * an otherwise grandfathered model does NOT inherit its availability.
   */
  available: boolean;
  parityStatus: ParityStatus;
  /** Shipping before the parity upgrade — may stay available without a smoke test. */
  grandfathered: boolean;
  smokeTest?: SmokeTestRecord;
}

/**
 * A tier may only be offered when it is either grandfathered (already shipping
 * before the upgrade) or backed by a passing smoke test on this exact route.
 */
export function isResolutionTierAvailable(tier: ResolutionSpec): boolean {
  if (!tier.available) return false;
  return tier.grandfathered || !!tier.smokeTest;
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
  /** The mode accepts an end/last frame at all. */
  lastFrame?: boolean;
  /**
   * Machine-readable input rule for `lastFrame`.
   *  - `true`  (the conservative default whenever `lastFrame` is set): the end
   *    frame is only accepted TOGETHER with a first frame. An end-only request
   *    on such a mode must be rejected, never silently ignored.
   *  - `false`: the route accepts the end frame on its own (end-only).
   * The dedicated `lastFrame` mode is the canonical carrier of end-only.
   */
  lastFrameRequiresFirstFrame?: boolean;
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

/**
 * Aspect ratios we expose anywhere in the product. Every tier must resolve an
 * exact frame for each ratio its mode advertises.
 */
export const STANDARD_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '21:9',
  '9:21',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
] as const;

function evenSize(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Derives the frame table for a documented sizing rule. Used ONLY when the
 * provider docs state the rule explicitly (`sizingRule` + `sizingRuleSource`);
 * a route with per-ratio frame tables in its docs must list them verbatim in
 * `framesByAspectRatio` instead of inheriting a generic 16:9 assumption.
 */
export function framesFromSizingRule(
  shortEdge: number,
  rule: SizingRule,
  ratios: readonly string[] = STANDARD_ASPECT_RATIOS,
): Record<string, PixelFrame> {
  const long = FRAMES[shortEdge]?.long ?? evenSize((shortEdge * 16) / 9);
  const table: Record<string, PixelFrame> = {};
  for (const ratio of ratios) {
    const [w, h] = ratio.split(':').map(Number);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
    if (rule === 'fixed-frame') {
      table[ratio] = { width: long, height: shortEdge };
    } else if (rule === 'long-edge') {
      table[ratio] = w >= h
        ? { width: shortEdge, height: evenSize((shortEdge * h) / w) }
        : { width: evenSize((shortEdge * w) / h), height: shortEdge };
    } else {
      table[ratio] = w >= h
        ? { width: evenSize((shortEdge * w) / h), height: shortEdge }
        : { width: shortEdge, height: evenSize((shortEdge * h) / w) };
    }
  }
  return table;
}

/** Builds an exactly defined resolution entry. Never emit a bare label. */
export function res(
  label: string,
  shortEdge: number,
  pricingId: string,
  opts: {
    orientationBehavior?: OrientationBehavior;
    native?: boolean;
    durations?: number[];
    /** Set false for a NEW tier — it stays locked until a smoke test passes. */
    grandfathered?: boolean;
    available?: boolean;
    parityStatus?: ParityStatus;
    smokeTest?: SmokeTestRecord;
    /** Provider-documented exact frames, keyed by aspect ratio. Wins over the rule. */
    framesByAspectRatio?: Record<string, PixelFrame>;
    sizingRule?: SizingRule;
    sizingRuleSource?: string;
  } = {},
): ResolutionSpec {
  const long = FRAMES[shortEdge]?.long ?? Math.round((shortEdge * 16) / 9);
  const grandfathered = opts.grandfathered ?? true;
  const orientationBehavior = opts.orientationBehavior ?? 'orientation-aware';
  const sizingRule: SizingRule =
    opts.sizingRule ??
    (orientationBehavior === 'long-edge'
      ? 'long-edge'
      : orientationBehavior === 'fixed'
        ? 'fixed-frame'
        : 'short-edge');
  const derived = framesFromSizingRule(shortEdge, sizingRule);
  // Provenance: only an explicit provider frame table or an explicit provider
  // reference counts. The generic default wording below is an assumption.
  // A measured smoke test on this exact route counts as verification too.
  const sizingRuleVerified =
    !!opts.framesByAspectRatio || !!opts.sizingRuleSource || !!opts.smokeTest;
  const requested = opts.parityStatus ?? (opts.smokeTest ? 'FULL_PARITY' : 'UNVERIFIED');
  // An unverified sizing rule can never carry FULL_PARITY: the kill switch may
  // only act on tiers whose target frame is provider-backed.
  const parityStatus: ParityStatus =
    requested === 'FULL_PARITY' && !sizingRuleVerified ? 'UNVERIFIED' : requested;
  return {
    label,
    shortEdge,
    landscape: { width: long, height: shortEdge },
    portrait: { width: shortEdge, height: long },
    orientationBehavior,
    sizingRule,
    sizingRuleSource:
      opts.sizingRuleSource ??
      (sizingRule === 'long-edge'
        ? 'Provider counts the label lines on the LONG edge (the Topaz portrait trap).'
        : sizingRule === 'fixed-frame'
          ? 'Provider renders one fixed frame regardless of the request.'
          : 'Provider hält die kurze Kante des Labels; Portrait ist damit echtes Hochkant.'),
    sizingRuleVerified,
    framesByAspectRatio: { ...derived, ...(opts.framesByAspectRatio ?? {}) },
    native: opts.native ?? true,
    pricingId,
    ...(opts.durations ? { durations: opts.durations } : {}),
    available: opts.available ?? true,
    parityStatus,
    grandfathered,
    ...(opts.smokeTest ? { smokeTest: opts.smokeTest } : {}),
  };
}


/**
 * A resolution tier that did NOT ship before the parity upgrade. It is locked
 * (`available: false`) until a smoke test with measured pixels is recorded.
 */
export function newTier(
  label: string,
  shortEdge: number,
  pricingId: string,
  opts: {
    orientationBehavior?: OrientationBehavior;
    native?: boolean;
    durations?: number[];
    smokeTest?: SmokeTestRecord;
    framesByAspectRatio?: Record<string, PixelFrame>;
    sizingRule?: SizingRule;
    sizingRuleSource?: string;
  } = {},

): ResolutionSpec {
  return res(label, shortEdge, pricingId, {
    ...opts,
    grandfathered: false,
    available: !!opts.smokeTest,
  });
}


const NO_CONTROLS: ModeControls = {};

interface ModeInit extends Omit<ModeSpec, 'mode' | 'controls' | 'inputs'> {
  controls?: ModeControls;
  inputs?: ModeInputs;
}

function mode(m: VideoMode, init: ModeInit): ModeSpec {
  return {
    ...init,
    mode: m,
    controls: init.controls ?? NO_CONTROLS,
    inputs: init.inputs ?? {},
  };
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
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
      'Routen-Audit 07.09.2026: bytedance/seedance-2.0 ist die EINZIGE Seedance-Route, deren Replicate-Doku 4K nennt ("4K outputs 10-bit H.265/HEVC at high bitrate"); Fast und Mini verweisen für 1080p/4K ausdrücklich auf diese Route. ' +
      '1080p/4K sind daher als gesperrte Tiers hinterlegt und bleiben bis zu einem bezahlten Smoke-Test auf UNSEREM Endpoint nicht startbar. ' +
      'Ebenfalls dokumentiert, aber noch nicht abgebildet (Payload-Arbeit + Smoke-Test): last_frame_image, reference_images (max. 9), reference_videos (max. 3), reference_audios (max. 3), native Audio, intelligente Dauer (-1). ' +
      'Harte Ausschluss-Regel der Route: image/last_frame_image sind NICHT mit reference_images kombinierbar.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [
          res('720p', 720, 'seedance-pro'),
          newTier('1080p', 1080, 'seedance-pro-1080p'),
          newTier('4K', 2160, 'seedance-pro-4k'),
        ],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [
          res('720p', 720, 'seedance-pro'),
          newTier('1080p', 1080, 'seedance-pro-1080p'),
          newTier('4K', 2160, 'seedance-pro-4k'),
        ],
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
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
    verificationNotes:
      'Routen-Audit 07.09.2026: das offizielle Replicate-Schema von kwaivgi/kling-v3-video führt mode = standard (720p) | pro (1080p) | 4k. ' +
      'Das 4K-Tier ist damit routen-dokumentiert, bleibt aber GESPERRT: die Replicate-Doku nennt weder exakte Pixel (3840x2160 nur Drittquellen) noch Dauer-/Ratio-/Audio-Einschränkungen im 4K-Modus (DOCS_CONFLICT). ' +
      'Ebenfalls dokumentiert und noch NICHT abgebildet: end_image (First+Last) und multi_prompt (bis 6 Shots) — beide brauchen Payload-Arbeit plus Smoke-Test.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [
          res('1080p', 1080, 'kling-3'),
          newTier('4K', 2160, 'kling-3-4k'),
        ],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: true,
        controls: { seed: true, negativePrompt: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [
          res('1080p', 1080, 'kling-3'),
          newTier('4K', 2160, 'kling-3-4k'),
        ],
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
      /**
       * V2V (reference_video). Der Provider dokumentiert eine harte
       * Ausschluss-Regel: `generate_audio` ist NICHT mit `reference_video`
       * kombinierbar. Deshalb ist Audio auf diesem Modus canonical false —
       * angeforderter Ton wird sichtbar geblockt statt still verworfen.
       */
      mode('v2v', {
        resolutions: [res('1080p', 1080, 'kling-omni')],
        durations: [3, 5, 8, 10, 15],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: { videos: { min: 1, max: 1 }, images: { min: 0, max: 4 } },
        constraints: [
          {
            reason:
              'Kling 3.0 Omni: generate_audio und reference_video schließen sich aus. Mit Referenzvideo max. 4 Referenzbilder (sonst 7); Referenzvideo 3–10 s.',
          },
        ],
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
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
    providerModelSlug: 'wan-video/wan-2.7-t2v|wan-video/wan-2.7-i2v',
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
    verificationNotes:
      'Stabiler Wan-Pfad und Fallback. Slug-Drift 07.09.2026 geschlossen: Wan 2.7 ist auf Replicate in task-spezifische Routen aufgeteilt — unsere Edge Function ruft wan-video/wan-2.7-t2v bzw. wan-video/wan-2.7-i2v; ein Slug "wan-video/wan-2.7" existiert nicht. ' +
      'Dokumentiert, aber bewusst nicht freigeschaltet: wan-2.7-i2v akzeptiert ein Last-Frame, wan-2.7-r2v (Reference-to-Video) und wan-2.7-videoedit sind EIGENE Routen und damit eigene Capability-Identitäten.',
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
    providerModelSlug: 'wan-video/wan-2.7-t2v|wan-video/wan-2.7-i2v',
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
    verificationNotes:
      '1080p-Stufe der 2.7-Generation — dieselbe Route wie Wan 2.7 Standard, nur mit resolution=1080p. Ein Provider-Slug "wan-video/wan-2.7-pro" existiert auf Replicate NICHT (Slug-Drift 07.09.2026 geschlossen).',
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
    providerModelSlug: 'minimax/hailuo-2.3',
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
      'Route-scoped: die MiniMax-Direct-API und Runway-hosted MiniMax sind eigene Specs. Auf dieser Route kein aspect_ratio-Parameter (T2V immer 16:9). ' +
      'Slug-Drift 07.09.2026 geschlossen: die Edge Function ruft real minimax/hailuo-2.3 auf (Registry führte fälschlich minimax/hailuo-02). ' +
      'minimax/hailuo-2.3 hat KEIN last_frame_image im Schema — kein firstLast/lastFrame-Modus. First+Last gibt es nur auf minimax/hailuo-02 und minimax/h3 (eigene Routen-Identitäten).',
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
    providerModelSlug: 'minimax/hailuo-2.3',
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
    verificationNotes:
      'On MiniMax, 1080p is bound to 6 seconds; 10s runs only at 768p. ' +
      'Slug drift closed 2026-09-07: replicate.com/minimax/hailuo-02-pro does not exist (404) — on THIS route "Pro" is only the 1080p tier of minimax/hailuo-2.3.',
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
        constraints: [
          { durations: [5], reason: 'Ray 3.2 akzeptiert Start-/Endbilder nur im 5-Sekunden-Tier.' },
        ],
      }),
      /**
       * END-ONLY. `generate-luma-video` sets `end_image` independently of
       * `start_image` on this route, so a single image may be sent as the last
       * frame without a first frame. Declared ONLY here — never inferred from
       * a `firstLast`/`i2v` mode that also lists `lastFrame`.
       */
      mode('lastFrame', {
        resolutions: [res('1080p', 1080, 'luma-ray32-5s'), res('720p', 720, 'luma-ray32-5s'), res('540p', 540, 'luma-ray32-5s')],
        durations: [5],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        audio: false,
        controls: {},
        inputs: { lastFrame: true, lastFrameRequiresFirstFrame: false },
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
      }),
      /**
       * END-ONLY. `generate-luma-video` sets `end_image` independently of
       * `start_image` on this route, so a single image may be sent as the last
       * frame without a first frame. Declared ONLY here — never inferred from
       * a `firstLast`/`i2v` mode that also lists `lastFrame`.
       */
      mode('lastFrame', {
        resolutions: [res('720p', 720, 'luma-standard')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: { lastFrame: true, lastFrameRequiresFirstFrame: false },
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
      }),
      /**
       * END-ONLY. `generate-luma-video` sets `end_image` independently of
       * `start_image` on this route, so a single image may be sent as the last
       * frame without a first frame. Declared ONLY here — never inferred from
       * a `firstLast`/`i2v` mode that also lists `lastFrame`.
       */
      mode('lastFrame', {
        resolutions: [res('720p', 720, 'luma-pro')],
        durations: [5, 9],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: {},
        inputs: { lastFrame: true, lastFrameRequiresFirstFrame: false },
      }),
    ],
  },

  /* ───────────────────────────── Runway ───────────────────────────── */
  {
    /**
     * TOTE ROUTE (Runway API changelog 30.07.2026): `gen4_aleph` ist über die
     * Runway API nicht mehr verfügbar, Requests mit dieser Model-ID schlagen
     * fehl. Der Spec BLEIBT bestehen, damit historische Generierungen weiter
     * korrekt aufgelöst werden — er ist aber nicht mehr startbar und wird NICHT
     * auf Aleph 2.0 umgebogen (kein Cross-Alias).
     */
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
    releaseStatus: 'removed',
    deprecated: true,
    supersededBy: 'runway-aleph-2',
    uiGroup: 'legacy',
    available: false,
    providerDocsVersion: 'Runway API Changelog 30.07.2026',
    verificationSourceUrl: 'https://docs.dev.runwayml.com/api-details/api_changelog/',
    verificationNotes:
      'Route offiziell abgeschaltet: "Gen-3 Alpha Turbo (gen3a_turbo) and Gen-4 Aleph (gen4_aleph) are no longer available via the Runway API." ' +
      'Spec bleibt nur zur Auflösung historischer Runs; keine neue Generierung möglich.',
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
  {
    /** NEU + GESPERRT: Nachfolger laut Runway-Changelog (gen4_aleph -> aleph2). */
    id: 'runway-aleph-2',
    displayName: 'Runway Aleph 2.0',
    family: 'runway',
    generation: '2.0',
    provider: 'Runway',
    providerModelSlug: 'aleph2',
    apiRoute: 'runway:/v1/video_to_video',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-runway-video',
    releaseStatus: 'preview',
    deprecated: false,
    uiGroup: 'professional',
    available: false,
    providerDocsVersion: 'Runway API Changelog 30.07.2026',
    verificationSourceUrl: 'https://docs.dev.runwayml.com/api-details/api_changelog/',
    verificationNotes:
      'Vorbereitet, NICHT startbar. Belegt ist nur: Model-ID "aleph2" als dokumentierter Nachfolger von gen4_aleph, Video-to-Video mit Text-Prompt und Keyframe-Bildern. ' +
      'UNBEKANNT: exakter REST-Pfad, Auflösungen, Dauern, FPS, Pricing. Freischaltung erst nach Routen-Audit + bezahltem Smoke-Test.',
    ...UNAUDITED,
    modes: [
      mode('v2v', {
        resolutions: [newTier('720p', 720, 'runway-aleph-2')],
        durations: [5],
        aspectRatios: ['16:9', '9:16'],
        audio: false,
        controls: {},
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
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
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
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
    providerModelSlug: 'alibaba/happyhorse-1.0',
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
    verificationNotes:
      '1080p-Stufe derselben Route (Edge Function ruft für beide Stufen alibaba/happyhorse-1.0). Slug-Drift 07.09.2026 geschlossen: "alibaba/happyhorse-1.0-pro" existiert auf Replicate nicht.',
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

  /* ──────── Neue Provider-Generationen: vorbereitet, GESPERRT (Phase E) ─────────
   * Alle folgenden Specs: available = false, alle Tiers via newTier() =>
   * grandfathered false, parityStatus UNVERIFIED, kein Smoke-Test-Beleg.
   * Sie sind damit weder in der UI wählbar noch server-seitig startbar und
   * dienen ausschließlich als maschinenlesbarer Audit-Stand.
   * ------------------------------------------------------------------------- */
  {
    id: 'hailuo-h3',
    displayName: 'Hailuo H3',
    family: 'hailuo',
    generation: '3.0',
    provider: 'MiniMax',
    providerModelSlug: 'minimax/h3',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-hailuo-video',
    releaseStatus: 'preview',
    deprecated: false,
    uiGroup: 'flagship',
    available: false,
    providerDocsVersion: 'Replicate 07.09.2026',
    verificationSourceUrl: 'https://replicate.com/minimax/h3',
    verificationNotes:
      'Aktuelle MiniMax-Generation. Routen-dokumentiert: T2V/I2V, first_frame_image + last_frame_image, resolution 768p|1080p, duration 6|10, aspect_ratio 16:9|9:16|1:1. ' +
      'GESPERRT bis Pricing hinterlegt und bezahlter Smoke-Test bestanden ist.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [newTier('768p', 768, 'hailuo-h3'), newTier('1080p', 1080, 'hailuo-h3')],
        durations: [6, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [newTier('768p', 768, 'hailuo-h3'), newTier('1080p', 1080, 'hailuo-h3')],
        durations: [6, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true },
      }),
      mode('firstLast', {
        resolutions: [newTier('768p', 768, 'hailuo-h3'), newTier('1080p', 1080, 'hailuo-h3')],
        durations: [6, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true, lastFrame: true, lastFrameRequiresFirstFrame: true },
      }),
    ],
  },
  {
    id: 'seedance-2-0-mini',
    displayName: 'Seedance 2.0 Mini',
    family: 'seedance',
    generation: '2.0',
    provider: 'ByteDance',
    providerModelSlug: 'bytedance/seedance-2.0-mini',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-seedance-video',
    releaseStatus: 'preview',
    deprecated: false,
    uiGroup: 'economy',
    available: false,
    providerDocsVersion: 'Replicate 07.09.2026',
    verificationSourceUrl: 'https://replicate.com/bytedance/seedance-2.0-mini',
    verificationNotes:
      'Aktuelle günstige Seedance-Generation (löst Seedance 1 Lite NICHT ab — eigener Spec, alte ID bleibt für historische Runs). ' +
      'Routen-dokumentiert: T2V/I2V, Referenzbilder, native Audio, bis 720p ("for 1080p and 4K use seedance-2.0"). GESPERRT bis Pricing + Smoke-Test.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [newTier('480p', 480, 'seedance-2-0-mini'), newTier('720p', 720, 'seedance-2-0-mini')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [newTier('480p', 480, 'seedance-2-0-mini'), newTier('720p', 720, 'seedance-2-0-mini')],
        durations: [3, 5, 8, 10, 12, 15],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'ltx-2-5-fast',
    displayName: 'LTX-2.5 Fast',
    family: 'ltx',
    generation: '2.5',
    provider: 'Lightricks',
    providerModelSlug: 'lightricks/ltx-2.5-fast',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-ltx-video',
    releaseStatus: 'preview',
    deprecated: false,
    uiGroup: 'fast',
    available: false,
    providerDocsVersion: 'Replicate 07.09.2026',
    verificationSourceUrl: 'https://replicate.com/lightricks/ltx-2.5-fast',
    verificationNotes:
      'Neue LTX-Generation, ersetzt LTX 2.3 NICHT automatisch. DOCS_CONFLICT: die Replicate-Route nennt Auflösungen bis 4K und 25/30/50 fps, die Lightricks-eigene Doku beschreibt für 2.5 abweichende Limits. ' +
      'Alle Tiers bleiben gesperrt, bis der Konflikt auf der exakten Route geklärt und ein Smoke-Test bestanden ist.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [newTier('1080p', 1080, 'ltx-2-5-fast'), newTier('4K', 2160, 'ltx-2-5-fast')],
        durations: [6, 8, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [newTier('1080p', 1080, 'ltx-2-5-fast'), newTier('4K', 2160, 'ltx-2-5-fast')],
        durations: [6, 8, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: {},
        inputs: { firstFrame: true },
      }),
    ],
  },
  {
    id: 'happyhorse-1-1',
    displayName: 'HappyHorse 1.1',
    family: 'happyhorse',
    generation: '1.1',
    provider: 'Alibaba',
    providerModelSlug: 'alibaba/happyhorse-1.1',
    apiRoute: 'replicate:/v1/predictions',
    region: 'global',
    apiVersion: 'v1',
    edgeFunction: 'generate-happyhorse-video',
    releaseStatus: 'preview',
    deprecated: false,
    uiGroup: 'flagship',
    available: false,
    providerDocsVersion: 'Replicate 07.09.2026',
    verificationSourceUrl: 'https://replicate.com/alibaba/happyhorse-1.1',
    verificationNotes:
      'Aktuelle HappyHorse-Generation mit Multi-Referenz (bis zu 9 Referenzbildern). Eigener Spec, HappyHorse 1.0 bleibt für historische Runs bestehen. GESPERRT bis Pricing + Smoke-Test.',
    ...UNAUDITED,
    modes: [
      mode('t2v', {
        resolutions: [newTier('720p', 720, 'happyhorse-1-1'), newTier('1080p', 1080, 'happyhorse-1-1')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: { seed: true },
        inputs: {},
      }),
      mode('i2v', {
        resolutions: [newTier('720p', 720, 'happyhorse-1-1'), newTier('1080p', 1080, 'happyhorse-1-1')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: { seed: true },
        inputs: { firstFrame: true },
      }),
      mode('reference', {
        resolutions: [newTier('720p', 720, 'happyhorse-1-1'), newTier('1080p', 1080, 'happyhorse-1-1')],
        durations: [5, 10],
        aspectRatios: ['16:9', '9:16', '1:1'],
        audio: false,
        controls: { seed: true },
        inputs: { images: { min: 1, max: 9 } },
      }),
    ],
  },
  /* ───────────────── Historical / removed (ids stay resolvable) ──────────── */
  {
    id: 'sora-2',
    displayName: 'Sora 2 (no longer available)',
    family: 'sora',
    generation: '2',
    provider: 'OpenAI',
    providerModelSlug: 'openai/sora-2',
    apiRoute: 'removed',
    region: 'global',
    apiVersion: 'n/a',
    edgeFunction: 'none',
    releaseStatus: 'removed',
    deprecated: true,
    supersededBy: 'veo-3.1-pro',
    uiGroup: 'legacy',
    available: false,
    parityStatus: 'UNVERIFIED',
    grandfathered: true,
    lastVerifiedAt: '2026-08-11',
    verifiedBy: 'registry-import',
    providerDocsVersion: 'n/a',
    verificationSourceUrl: 'https://openai.com/sora',
    verificationNotes:
      'Historischer Eintrag. Sora 2 wird nicht mehr angeboten; persistierte Läufe müssen weiter auflösbar bleiben, dürfen aber nicht neu startbar sein. Kein Alias auf Veo — das wäre eine falsche Modellbehauptung.',
    modes: [],
  },
];

// ---------------------------------------------------------------------------
// Aliases — persisted legacy ids keep resolving. Never delete an entry here.
// An alias MUST point at the same model family; a cross-family alias would
// silently rename a user's run into a different product.
// ---------------------------------------------------------------------------

export const VIDEO_MODEL_ALIASES: Record<string, string> = {
  'kling-3-standard': 'kling-3',
  'kling-3-pro': 'kling-3',
  'sora-2-standard': 'sora-2',
  'sora-2-pro': 'sora-2',
  'wan-pro': 'wan-2-7-pro',
};

/** Family a legacy id belonged to — asserted against the alias target. */
export const ALIAS_SOURCE_FAMILY: Record<string, string> = {
  'kling-3-standard': 'kling',
  'kling-3-pro': 'kling',
  'sora-2-standard': 'sora',
  'sora-2-pro': 'sora',
  'wan-pro': 'wan',
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
/**
 * INPUT SIGNALS a caller actually holds — the canonical resolver turns them
 * into a `VideoMode`. There is exactly ONE such resolver (mirrored to the
 * client with this file), so UI and edge functions can never disagree about
 * what "an end image without a start image" means.
 */
export interface GenerationInputSignals {
  hasFirstFrame?: boolean;
  hasLastFrame?: boolean;
  hasReferenceImages?: boolean;
  hasVideo?: boolean;
}

/** True when a mode accepts an end frame WITHOUT a first frame. */
export function modeAcceptsEndOnly(m: ModeSpec): boolean {
  return !!m.inputs?.lastFrame && m.inputs?.lastFrameRequiresFirstFrame === false;
}

/**
 * True when the model has a route that accepts a SINGLE end image (no first
 * frame). This — not `inputs.lastFrame` — is what the "at the end" placement
 * needs. Paired first+last support is `supportsPairedEndFrame`.
 */
export function supportsEndOnly(modelId: string): boolean {
  const spec = getVideoModelSpec(modelId);
  return !!spec?.modes.some(modeAcceptsEndOnly);
}

/** True when the model accepts an end frame together with a first frame. */
export function supportsPairedEndFrame(modelId: string): boolean {
  const spec = getVideoModelSpec(modelId);
  return !!spec?.modes.some((m) => !!m.inputs?.firstFrame && !!m.inputs?.lastFrame);
}

/**
 * Canonical input -> mode resolution. Never guesses a mode the spec does not
 * declare: an unsupported signal combination resolves to the mode that names
 * it, so `validateCapability` rejects it with the real reason instead of the
 * request being silently re-labelled as something the model does support.
 */
export function resolveGenerationMode(
  modelId: string,
  signals: GenerationInputSignals,
): VideoMode {
  const spec = getVideoModelSpec(modelId);
  if (signals.hasVideo) return 'v2v';
  if (signals.hasReferenceImages) return 'reference';
  if (signals.hasFirstFrame && signals.hasLastFrame) {
    // Prefer the dedicated pairing mode; fall back to the i2v route that
    // declares `lastFrame` (Luma Ray 2 pairs inside i2v).
    if (spec?.modes.some((m) => m.mode === 'firstLast')) return 'firstLast';
    const paired = spec?.modes.find((m) => !!m.inputs?.firstFrame && !!m.inputs?.lastFrame);
    return paired?.mode ?? 'firstLast';
  }
  if (signals.hasLastFrame) return 'lastFrame';
  if (signals.hasFirstFrame) return 'i2v';
  return 't2v';
}

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
  /**
   * Operational state of the exact tier, loaded from `video_model_tier_parity`
   * for THIS (model x route x region x mode x tier) key. A disabled tier can
   * never be submitted until a new passing smoke test re-enables it.
   */
  tierDisabled?: boolean;
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

  // Multi-tier models MUST state the tier. Validating the first tier for an
  // ambiguous request is exactly the silent-default bug this gate exists for.
  if (!req.resolution && modeSpec.resolutions.length > 1) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'resolution',
      message: `${spec.displayName} (${req.mode}) renders ${modeSpec.resolutions
        .map((r) => r.label)
        .join(', ')} — the request must name the resolution explicitly.`,
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
          .filter(isResolutionTierAvailable)
          .map((r) => r.label)
          .join(', ')}.`,
      };
    }
  }

  // Availability is per TIER: a new tier never inherits the model's grandfathering.
  if (resolution && !isResolutionTierAvailable(resolution)) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'resolution',
      message: `${spec.displayName}: the ${resolution.label} tier is locked until a smoke test verifies it on route ${spec.apiRoute}.`,
    };
  }

  // Operational kill switch: a tier downgraded by measured regressions stays
  // unselectable until a new passing smoke test clears it.
  if (req.tierDisabled) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'resolution',
      message: `${spec.displayName}: the ${resolution?.label ?? 'requested'} tier is temporarily disabled after measured output regressions on route ${spec.apiRoute}. A new passing smoke test re-enables it.`,
    };
  }

  if (req.aspectRatio && resolution && !resolution.framesByAspectRatio[req.aspectRatio]) {
    return {
      code: 'INVALID_MODEL_CAPABILITY',
      field: 'aspectRatio',
      message: `${spec.displayName} ${resolution.label}: no provider-backed frame is documented for ${req.aspectRatio} on route ${spec.apiRoute}.`,
    };
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




/**
 * Exact target frame for a request. The provider-backed frame table wins; only
 * when the ratio is absent there do we fall back to the tier's DOCUMENTED
 * sizing rule (`sizingRule` + `sizingRuleSource`). 4:3, 3:4, 21:9, 3:2 and 2:3
 * are never guessed from a generic 16:9 short-edge assumption.
 */
export function projectTargetFrame(
  resolution: ResolutionSpec,
  aspectRatio: string,
): PixelFrame {
  const exact = resolution.framesByAspectRatio?.[aspectRatio];
  if (exact) return exact;

  const derived = framesFromSizingRule(resolution.shortEdge, resolution.sizingRule, [aspectRatio]);
  return derived[aspectRatio] ?? resolution.landscape;
}

/**
 * Identity of a verified resolution tier. Parity and regressions are ALWAYS
 * scoped to model x route x region x mode x tier: a mismatch in t2v must never
 * downgrade i2v, and a Replicate-route mismatch must never downgrade the same
 * model on a direct-provider route.
 */
export interface ParityKey {
  modelId: string;
  apiRoute: string;
  region: string;
  mode: VideoMode;
  resolutionLabel: string;
}

export function parityKeyOf(
  spec: VideoModelSpec,
  mode: VideoMode,
  resolutionLabel: string,
): ParityKey {
  return {
    modelId: spec.id,
    apiRoute: spec.apiRoute,
    region: spec.region,
    mode,
    resolutionLabel,
  };
}

export function parityKeyString(key: ParityKey): string {
  return [key.modelId, key.apiRoute, key.region, key.mode, key.resolutionLabel].join('|');
}


/** Measured output vs. promised frame. */
export type OutputVerdict = 'TARGET_MATCHED' | 'PROVIDER_OUTPUT_MISMATCH';

/** A run counts as matched when it delivers at least 98 % of both target edges. */
export const OUTPUT_FRAME_TOLERANCE = 0.02;

export function classifyMeasuredOutput(
  target: PixelFrame,
  measured: PixelFrame,
): OutputVerdict {
  const ok =
    measured.width >= target.width * (1 - OUTPUT_FRAME_TOLERANCE) &&
    measured.height >= target.height * (1 - OUTPUT_FRAME_TOLERANCE);
  return ok ? 'TARGET_MATCHED' : 'PROVIDER_OUTPUT_MISMATCH';
}

/** Three consecutive mismatches downgrade a tier from FULL_PARITY to VERIFY. */
export const PARITY_REGRESSION_THRESHOLD = 3;

export interface TierParityState {
  parityStatus: ParityStatus;
  consecutiveMismatches: number;
  /** Set when a downgraded tier must stop being offered. */
  tierDisabled: boolean;
}

/**
 * Pure regression state machine.
 *
 *  - A matched run resets the mismatch counter (status untouched).
 *  - The third consecutive mismatch on a tier that was FULL_PARITY (its target
 *    frame is provider-verified, so a mismatch is a real provider regression)
 *    downgrades it to VERIFY AND disables it.
 *  - A grandfathered UNVERIFIED or already-VERIFY tier is NEVER auto-disabled:
 *    its target frame is an assumption, so a mismatch is not proof of anything.
 */
export function applyOutputMeasurement(
  state: TierParityState,
  verdict: OutputVerdict,
): TierParityState & { downgraded: boolean } {
  if (verdict === 'TARGET_MATCHED') {
    return {
      parityStatus: state.parityStatus,
      consecutiveMismatches: 0,
      tierDisabled: state.tierDisabled,
      downgraded: false,
    };
  }
  const consecutiveMismatches = state.consecutiveMismatches + 1;
  const wasFullParity = state.parityStatus === 'FULL_PARITY';
  const downgraded = wasFullParity && consecutiveMismatches >= PARITY_REGRESSION_THRESHOLD;
  return {
    parityStatus: downgraded ? 'VERIFY' : state.parityStatus,
    consecutiveMismatches,
    tierDisabled: downgraded ? true : state.tierDisabled,
    downgraded,
  };
}

/**
 * The ONLY way back: a passing smoke test on this exact route clears the
 * mismatch counter, re-enables the tier and restores FULL_PARITY.
 */
export function applySmokeTestPass(_state: TierParityState): TierParityState {
  return {
    parityStatus: 'FULL_PARITY',
    consecutiveMismatches: 0,
    tierDisabled: false,
  };
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


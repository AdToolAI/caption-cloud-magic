/**
 * Topaz video model catalogue — the authoritative list of what AdTool can
 * really run through `POST /video/express`.
 *
 * Every entry below was taken from the published Topaz OpenAPI schema of the
 * create-express-request endpoint (`UpscaleFilter.model` /
 * `FrameInterpolationFilter.model` enums) and the per-model documentation
 * pages, re-verified against the live docs on 2026-09-07.
 *
 * DELIBERATELY ABSENT — and why:
 *   • Starlight (`slhq-1`, `slp-2.6`), Astra (`ast-2`), Gaia 2 Animation
 *     (`ganim-1`), Video Colorization (`color-1`): these are NOT part of the
 *     express `UpscaleFilter` enum. They run through Topaz's separate
 *     per-model `/video/{model}` endpoint with their own parameter schema, so
 *     offering them here would produce a provider rejection.
 *   • Hyperion (`hyp-1`) and Stabilization (`stab-1`): in the express enum,
 *     but they are not upscalers. `stab-1` additionally REQUIRES
 *     `rollingShutterCorrection` or the request 400s. They are out of scope
 *     for "enhance/upscale" and are not offered as a fake upscale mode.
 * Nothing here is hidden for pricing convenience: a model is either runnable
 * and listed, or not runnable and named right here with the reason.
 *
 * A mirror of this file lives at `src/config/videoEnhanceModels/topazCatalog.ts`
 * and a parity test asserts both sides describe the same models.
 */


export type TopazSpecialty =
  | 'general'
  | 'natural'
  | 'detail'
  | 'faces'
  | 'cgi'
  | 'denoise'
  | 'deblur'
  | 'legacy';

/** Credit consumption family — decides which published credit table applies. */
export type TopazCreditFamily = 'precision' | 'restoration';

export interface TopazVideoModel {
  /** AdTool mode id. Stored on the run and used by the rate card. */
  id: string;
  /** Topaz short code that travels in the filter `model` field. */
  slug: string;
  name: string;
  specialty: TopazSpecialty;
  creditFamily: TopazCreditFamily;
  /**
   * true ONLY for models whose own documentation page lists the full manual
   * parameter block (`auto: 'Manual'` + compression/details/noise/blur/halo):
   * Proteus, Rhea, Nyx and Theia. Every other model is model-code only here —
   * their parameter surface is not documented for the express route, and a
   * slider we cannot map to a documented field would be a fake control.
   */
  manualParameters: boolean;
  /**
   * Upscale factor the model is trained for. The Topaz docs state these as
   * absolutes ("pnat-1 is a 2x upscale only model", Rhea "operates natively at
   * a 4x scale") with no tolerance window — so a target frame that asks for a
   * different factor is REJECTED instead of silently mis-run.
   */
  fixedUpscale?: number;
  /** Same family, different training. Available to the adapter, not the UI. */
  variants?: { slug: string; label: string }[];
  /**
   * false while no billed AdTool run has confirmed the credit consumption for
   * this model. Such a model is visible with a "beta" marker but CANNOT be
   * started by a normal customer (see `isTopazModelStartable`); the hard
   * multiplier cap and the post-run true-up protect the test runs.
   */
  costVerified: boolean;

}

export const TOPAZ_VIDEO_MODELS: TopazVideoModel[] = [
  {
    id: 'proteus',
    slug: 'prob-4',
    name: 'Proteus',
    specialty: 'general',
    creditFamily: 'precision',
    manualParameters: true,
    costVerified: true,
  },
  {
    id: 'proteus-natural',
    slug: 'pnat-1',
    name: 'Proteus Natural',
    specialty: 'natural',
    creditFamily: 'precision',
    manualParameters: false,
    fixedUpscale: 2,
    costVerified: false,
  },
  {
    id: 'rhea',
    slug: 'rhea-1',
    name: 'Rhea',
    specialty: 'detail',
    creditFamily: 'precision',
    manualParameters: true,
    fixedUpscale: 4,
    costVerified: false,
  },
  {
    id: 'iris',
    slug: 'iris-3',
    name: 'Iris',
    specialty: 'faces',
    creditFamily: 'precision',
    manualParameters: true,
    variants: [{ slug: 'iris-2', label: 'Iris Medium Quality' }],
    costVerified: false,
  },
  {
    id: 'artemis',
    slug: 'ahq-12',
    name: 'Artemis',
    specialty: 'general',
    creditFamily: 'precision',
    manualParameters: true,
    variants: [
      { slug: 'alq-13', label: 'Artemis Low Quality' },
      { slug: 'alqs-2', label: 'Artemis Medium Quality' },
      { slug: 'amqs-2', label: 'Artemis Medium Halo' },
      { slug: 'amq-13', label: 'Artemis Strong Halo' },
      { slug: 'aaa-9', label: 'Artemis Aliasing / Moire' },
    ],
    costVerified: false,
  },
  {
    id: 'gaia',
    slug: 'ghq-5',
    name: 'Gaia',
    specialty: 'cgi',
    creditFamily: 'precision',
    manualParameters: true,
    variants: [{ slug: 'gcg-5', label: 'Gaia CG' }],
    costVerified: false,
  },
  {
    id: 'nyx',
    slug: 'nyx-3',
    name: 'Nyx',
    specialty: 'denoise',
    creditFamily: 'restoration',
    manualParameters: true,
    variants: [
      { slug: 'nxl-1', label: 'Nyx XL' },
      { slug: 'nxf-1', label: 'Nyx Fast' },
    ],
    costVerified: false,
  },
  {
    id: 'themis',
    slug: 'thm-2',
    name: 'Themis 2',
    specialty: 'deblur',
    creditFamily: 'restoration',
    manualParameters: true,
    costVerified: false,
  },
  {
    id: 'dione',
    slug: 'ddv-3',
    name: 'Dione',
    specialty: 'legacy',
    creditFamily: 'precision',
    manualParameters: true,
    variants: [
      { slug: 'dtv-4', label: 'Dione TV' },
      { slug: 'dtd-4', label: 'Dione Robust' },
      { slug: 'dtvs-2', label: 'Dione Dehalo' },
      { slug: 'dtds-2', label: 'Dione Robust Dehalo' },
    ],
    costVerified: false,
  },
];

export const TOPAZ_DEFAULT_MODEL_ID = 'proteus';

export const TOPAZ_VIDEO_MODEL_IDS: string[] = TOPAZ_VIDEO_MODELS.map((m) => m.id);

export function topazVideoModel(id: string): TopazVideoModel | undefined {
  return TOPAZ_VIDEO_MODELS.find((m) => m.id === id);
}

export function topazVideoModelOrDefault(id: string | undefined): TopazVideoModel {
  return topazVideoModel(id ?? '') ?? TOPAZ_VIDEO_MODELS[0];
}

// ---------------------------------------------------------------------------
// Frame interpolation
// ---------------------------------------------------------------------------

export interface TopazInterpolationModel {
  id: string;
  slug: string;
  name: string;
  /** Roughly half the credit cost of the quality tier of the same family. */
  fast: boolean;
}

export const TOPAZ_INTERPOLATION_MODELS: TopazInterpolationModel[] = [
  { id: 'apollo', slug: 'apo-8', name: 'Apollo', fast: false },
  { id: 'apollo-fast', slug: 'apf-2', name: 'Apollo Fast', fast: true },
  { id: 'chronos', slug: 'chr-2', name: 'Chronos', fast: false },
  { id: 'chronos-fast', slug: 'chf-3', name: 'Chronos Fast', fast: true },
  { id: 'aion', slug: 'aion-1', name: 'Aion', fast: false },
];

export const TOPAZ_DEFAULT_INTERPOLATION_ID = 'apollo';

export function topazInterpolationModel(id: string | undefined): TopazInterpolationModel {
  return (
    TOPAZ_INTERPOLATION_MODELS.find((m) => m.id === id) ??
    TOPAZ_INTERPOLATION_MODELS.find((m) => m.id === TOPAZ_DEFAULT_INTERPOLATION_ID)!
  );
}

// ---------------------------------------------------------------------------
// Output quality (encoder contract)
// ---------------------------------------------------------------------------

/**
 * How much the master is compressed. Topaz defaults `dynamicCompressionLevel`
 * to `High` — the SMALLEST file and the weakest quality — so leaving it out
 * means silently shipping the most compressed variant. AdTool always sends it.
 */
export type TopazOutputQuality = 'efficient' | 'high' | 'master';

export interface TopazEncoderContract {
  dynamicCompressionLevel: 'High' | 'Mid' | 'Low';
  videoEncoder: 'H265';
  videoProfile: 'Main10';
  container: 'mp4';
}

export const TOPAZ_OUTPUT_QUALITY: Record<TopazOutputQuality, TopazEncoderContract> = {
  efficient: {
    dynamicCompressionLevel: 'High',
    videoEncoder: 'H265',
    videoProfile: 'Main10',
    container: 'mp4',
  },
  high: {
    dynamicCompressionLevel: 'Mid',
    videoEncoder: 'H265',
    videoProfile: 'Main10',
    container: 'mp4',
  },
  master: {
    dynamicCompressionLevel: 'Low',
    videoEncoder: 'H265',
    videoProfile: 'Main10',
    container: 'mp4',
  },
};

export const TOPAZ_DEFAULT_OUTPUT_QUALITY: TopazOutputQuality = 'high';

export function topazOutputQuality(value: string | undefined): TopazOutputQuality {
  return value === 'efficient' || value === 'high' || value === 'master'
    ? value
    : TOPAZ_DEFAULT_OUTPUT_QUALITY;
}

// ---------------------------------------------------------------------------
// Manual parameters
// ---------------------------------------------------------------------------

/**
 * The subset of `UpscaleFilter` parameters AdTool exposes, with the exact
 * field name and range from the provider schema. Anything outside this table
 * never reaches Topaz.
 */
export const TOPAZ_MANUAL_PARAMS: Record<string, { field: string; min: number; max: number }> = {
  compression: { field: 'compression', min: -1, max: 1 },
  details: { field: 'details', min: -1, max: 1 },
  noise: { field: 'noise', min: -1, max: 1 },
  sharpness: { field: 'blur', min: -1, max: 1 },
  halo: { field: 'halo', min: -1, max: 1 },
};

export type TopazManualParamKey = keyof typeof TOPAZ_MANUAL_PARAMS;

/** Clamped, whitelisted manual parameters. Empty object = run on autopilot. */
export function topazManualFilterParams(
  values: Record<string, unknown> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!values) return out;
  for (const [key, spec] of Object.entries(TOPAZ_MANUAL_PARAMS)) {
    const raw = values[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    out[spec.field] = Math.min(spec.max, Math.max(spec.min, raw));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scale contract
// ---------------------------------------------------------------------------

/** Deviation tolerated before a fixed-factor model is considered mis-used. */
export const TOPAZ_SCALE_TOLERANCE = 0.2;

export interface TopazScaleVerdict {
  ok: boolean;
  requiredFactor?: number;
  actualFactor?: number;
}

/**
 * Proteus Natural is a 2x-only model, Rhea a 4x-only model. Running them at a
 * different factor does not fail at the provider — it silently produces a
 * result the model was never trained for. We reject instead.
 */
export function topazScaleFits(
  model: TopazVideoModel,
  source: { width: number; height: number },
  target: { width: number; height: number },
): TopazScaleVerdict {
  if (!model.fixedUpscale) return { ok: true };
  const sourceShort = Math.min(source.width, source.height) || 1;
  const targetShort = Math.min(target.width, target.height);
  const factor = targetShort / sourceShort;
  const low = model.fixedUpscale * (1 - TOPAZ_SCALE_TOLERANCE);
  const high = model.fixedUpscale * (1 + TOPAZ_SCALE_TOLERANCE);
  return {
    ok: factor >= low && factor <= high,
    requiredFactor: model.fixedUpscale,
    actualFactor: factor,
  };
}

// ---------------------------------------------------------------------------
// Credit consumption
// ---------------------------------------------------------------------------

/**
 * Credits per second of OUTPUT at 30 fps.
 *
 * `precision` — published Proteus credit table (720p 1 credit / 10 s,
 * 1080p 2 / 10 s, 4K 6 / 10 s; 2K interpolated by pixel count).
 * `restoration` — published Nyx / Themis frames-per-credit table
 * (1080p 518 frames per credit, 4K 129; 720p and 2K by pixel count).
 */
export const TOPAZ_CREDITS_PER_SECOND: Record<
  TopazCreditFamily,
  { '720p': number; '1080p': number; '2k': number; '4k': number }
> = {
  precision: { '720p': 0.1, '1080p': 0.2, '2k': 0.35, '4k': 0.6 },
  restoration: { '720p': 0.026, '1080p': 0.058, '2k': 0.103, '4k': 0.233 },
};

export function topazCreditFamilyForMode(mode: string): TopazCreditFamily {
  return topazVideoModelOrDefault(mode).creditFamily;
}

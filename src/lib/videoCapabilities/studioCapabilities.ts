/**
 * Studio Capability Selector
 * ---------------------------------------------------------------------------
 * The ONE client-side source of technical truth for the AI Video Studio.
 *
 * Every startable option the Generate UI offers (mode, native resolution,
 * duration, aspect ratio, fps, exact pixel frame) is derived here from the
 * generated mirror of the canonical registry — `src/config/videoModelSpecs.ts`,
 * itself generated from `supabase/functions/_shared/videoModelSpecs.ts`.
 *
 * Hard rules:
 *  1. No second hand-maintained capability table. Labels, icons, taglines,
 *     ordering and prices stay in `aiVideoModelRegistry`; MODES, RESOLUTIONS,
 *     DURATIONS, ASPECT RATIOS, FPS and AVAILABILITY come from here.
 *  2. Native generation only. `enhanceUpscaleTiers` are an Enhance/Upscale
 *     concern and never enter a native resolution selector.
 *  3. Locked tiers (`available: false` / no smoke test) are never startable.
 *     They may be rendered disabled with a reason, never as normal options.
 *  4. No silent fallbacks: an invalid selection is reported, never rewritten.
 *     Only the FIRST initialisation of an untouched field may pick a default.
 *  5. The server stays authoritative — this layer mirrors its gate, it does
 *     not replace it.
 */

import {
  getModeSpec,
  getVideoModelSpec,
  isResolutionTierAvailable,
  projectTargetFrame,
  resolveGenerationMode,
  supportsEndOnly,
  supportsPairedEndFrame,
  validateCapability,
  type CapabilityViolation,
  type ModeConstraint,
  type ModeControls,
  type ModeInputs,
  type ModeSpec,
  type PixelFrame,
  type ResolutionSpec,
  type VideoMode,
  type VideoModelSpec,
} from '@/config/videoModelSpecs';
import { tx } from '@/lib/i18nText';

export type { VideoMode, PixelFrame, CapabilityViolation, ModeInputs, ModeConstraint };

export interface ResolutionOption {
  /** Provider label exactly as the registry spells it ("1080p", "4K"). */
  label: string;
  shortEdge: number;
  /** False = locked tier. Render disabled with `lockedReason`, never startable. */
  startable: boolean;
  lockedReason?: string;
  /** Durations valid at THIS tier (narrower than the mode default when set). */
  durations: number[];
  native: boolean;
  parityStatus: ResolutionSpec['parityStatus'];
  /**
   * True only when the exact target frame of this tier is provider-backed.
   * A generically derived frame table is an ASSUMPTION and must never be shown
   * as exact pixels.
   */
  pixelsVerified: boolean;
}

export interface StudioCapabilities {
  /** False when the model/mode pair does not exist in the canonical registry. */
  supported: boolean;
  modelAvailable: boolean;
  /** All modes the model exposes on its audited route. */
  modes: VideoMode[];
  resolutions: ResolutionOption[];
  /** Startable resolution labels only. */
  resolutionLabels: string[];
  durations: number[];
  aspectRatios: string[];
  fps: number[];
  audio: boolean;
  smartDuration: boolean;
  /** Canonical input slots of this mode (first/last frame, images, videos, audios). */
  inputs: ModeInputs;
  controls: ModeControls;
  constraints: ModeConstraint[];
}

const EMPTY: StudioCapabilities = {
  supported: false,
  modelAvailable: false,
  modes: [],
  resolutions: [],
  resolutionLabels: [],
  durations: [],
  aspectRatios: [],
  fps: [],
  audio: false,
  smartDuration: false,
  inputs: {},
  controls: {},
  constraints: [],
};

function lockedReasonFor(spec: VideoModelSpec, tier: ResolutionSpec): string {
  // Rule 3a: a model-level outage is NOT a missing smoke test — name the real
  // release status instead of inventing a tier-level reason.
  if (!spec.available) {
    return tx({
      de: `${spec.displayName}: Modell ist aktuell nicht startbar (Status: ${spec.releaseStatus}).`,
      en: `${spec.displayName}: model cannot be started right now (status: ${spec.releaseStatus}).`,
      es: `${spec.displayName}: el modelo no se puede iniciar ahora mismo (estado: ${spec.releaseStatus}).`,
    });
  }
  if (!tier.available) {
    return tx({
      de: `${tier.label}: Stufe ist gesperrt, bis ein Smoke-Test auf ${spec.apiRoute} die echten Pixel misst.`,
      en: `${tier.label}: tier is locked until a smoke test on ${spec.apiRoute} measures the real pixels.`,
      es: `${tier.label}: nivel bloqueado hasta que una prueba real en ${spec.apiRoute} mida los píxeles reales.`,
    });
  }
  return tx({
    de: `${tier.label}: neue Stufe ohne bestandenen Smoke-Test auf ${spec.apiRoute}.`,
    en: `${tier.label}: new tier without a passed smoke test on ${spec.apiRoute}.`,
    es: `${tier.label}: nivel nuevo sin una prueba real superada en ${spec.apiRoute}.`,
  });
}

function toResolutionOption(spec: VideoModelSpec, mode: ModeSpec, tier: ResolutionSpec): ResolutionOption {
  // Rule 3: an unavailable MODEL can never have a startable tier.
  const startable = spec.available && isResolutionTierAvailable(tier);
  return {
    label: tier.label,
    shortEdge: tier.shortEdge,
    startable,
    ...(startable ? {} : { lockedReason: lockedReasonFor(spec, tier) }),
    durations: tier.durations ?? mode.durations,
    native: tier.native,
    parityStatus: tier.parityStatus,
    pixelsVerified: startable && tier.sizingRuleVerified,
  };
}

/** Technical options for one (model x mode). Native tiers only. */
export function getStudioCapabilities(modelId: string, mode: VideoMode): StudioCapabilities {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return EMPTY;
  const modeSpec = getModeSpec(spec, mode);
  if (!modeSpec) {
    // Rule 4: an unsupported mode stays unsupported — never resolved to another.
    return { ...EMPTY, modelAvailable: spec.available, modes: spec.modes.map((m) => m.mode) };
  }
  // Rule 2: native tiers only — enhanceUpscaleTiers live on a different axis.
  const nativeTiers = modeSpec.resolutions.filter((r) => r.native);
  const resolutions = nativeTiers
    .map((tier) => toResolutionOption(spec, modeSpec, tier))
    .sort((a, b) => b.shortEdge - a.shortEdge);
  return {
    supported: true,
    modelAvailable: spec.available,
    modes: spec.modes.map((m) => m.mode),
    resolutions,
    resolutionLabels: resolutions.filter((r) => r.startable).map((r) => r.label),
    durations: [...modeSpec.durations],
    aspectRatios: [...modeSpec.aspectRatios],
    fps: [...(modeSpec.fps ?? [])],
    audio: modeSpec.audio,
    smartDuration: !!modeSpec.controls.smartDuration,
    inputs: { ...modeSpec.inputs },
    controls: { ...modeSpec.controls },
    constraints: [...(modeSpec.constraints ?? [])],
  };
}


/**
 * Union of the technical options across all modes of a model. Used where the
 * UI has to render before the concrete mode is known (model dropdown badges,
 * the quick-settings bar on an empty form).
 */
export function getModelCapabilityUnion(modelId: string): StudioCapabilities {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return EMPTY;
  const merged = spec.modes
    .map((m) => getStudioCapabilities(modelId, m.mode))
    .filter((c) => c.supported);
  if (!merged.length) return { ...EMPTY, modelAvailable: spec.available };

  const resolutions: ResolutionOption[] = [];
  for (const c of merged) {
    for (const r of c.resolutions) {
      const existing = resolutions.find((x) => x.label === r.label);
      if (!existing) resolutions.push({ ...r });
      else if (r.startable && !existing.startable) Object.assign(existing, r);
    }
  }
  resolutions.sort((a, b) => b.shortEdge - a.shortEdge);
  const uniqNum = (arr: number[]) => [...new Set(arr)].sort((a, b) => a - b);
  const uniqStr = (arr: string[]) => [...new Set(arr)];
  const maxOf = (pick: (i: ModeInputs) => { min: number; max: number } | undefined) => {
    const found = merged.map((c) => pick(c.inputs)).filter((x): x is { min: number; max: number } => !!x);
    return found.length ? { min: Math.min(...found.map((f) => f.min)), max: Math.max(...found.map((f) => f.max)) } : undefined;
  };
  const inputs: ModeInputs = {
    ...(merged.some((c) => c.inputs.firstFrame) ? { firstFrame: true } : {}),
    ...(merged.some((c) => c.inputs.lastFrame) ? { lastFrame: true } : {}),
    ...(maxOf((i) => i.images) ? { images: maxOf((i) => i.images)! } : {}),
    ...(maxOf((i) => i.videos) ? { videos: maxOf((i) => i.videos)! } : {}),
    ...(maxOf((i) => i.audios) ? { audios: maxOf((i) => i.audios)! } : {}),
  };
  return {
    supported: true,
    modelAvailable: spec.available,
    modes: spec.modes.map((m) => m.mode),
    resolutions,
    resolutionLabels: resolutions.filter((r) => r.startable).map((r) => r.label),
    durations: uniqNum(merged.flatMap((c) => c.durations)),
    aspectRatios: uniqStr(merged.flatMap((c) => c.aspectRatios)),
    fps: uniqNum(merged.flatMap((c) => c.fps)),
    audio: merged.some((c) => c.audio),
    smartDuration: merged.some((c) => c.smartDuration),
    inputs,
    controls: Object.assign({}, ...merged.map((c) => c.controls)) as ModeControls,
    constraints: merged.flatMap((c) => c.constraints),
  };
}

/* ─────────────── Canonical input selectors (no hand-maintained mirror) ───────────────
 * Everything below reads `ModeInputs` / `ModeConstraint` straight from the
 * canonical registry. The UI must use these instead of re-declaring provider
 * knowledge in `aiVideoModelRegistry`.
 */

/** True when ANY mode of the model accepts a last frame (end-frame guidance). */
export function supportsLastFrame(modelId: string, mode?: VideoMode): boolean {
  const caps = mode ? getStudioCapabilities(modelId, mode) : getModelCapabilityUnion(modelId);
  return !!caps.inputs.lastFrame;
}

/** Max reference images the canonical registry documents (0 = not supported). */
export function maxReferenceImages(modelId: string, mode?: VideoMode): number {
  const caps = mode ? getStudioCapabilities(modelId, mode) : getModelCapabilityUnion(modelId);
  return caps.inputs.images?.max ?? 0;
}

/** True when the model takes a reference/source video on any mode. */
export function supportsReferenceVideo(modelId: string, mode?: VideoMode): boolean {
  const caps = mode ? getStudioCapabilities(modelId, mode) : getModelCapabilityUnion(modelId);
  return (caps.inputs.videos?.max ?? 0) > 0;
}

/**
 * Canonical constraint under which the `reference` mode accepts images
 * (Veo 3.1: 16:9 + 8 s). Returns null when the model has no reference mode or
 * the registry documents no constraint.
 */
export function referenceModeRequirement(
  modelId: string,
): { aspectRatios?: string[]; durations?: number[]; reason: string } | null {
  const spec = getVideoModelSpec(modelId);
  const modeSpec = spec ? getModeSpec(spec, 'reference') : undefined;
  const c = (modeSpec?.constraints ?? []).find((x) => x.aspectRatios || x.durations);
  if (!c) return null;
  return {
    ...(c.aspectRatios ? { aspectRatios: [...c.aspectRatios] } : {}),
    ...(c.durations ? { durations: [...c.durations] } : {}),
    reason: c.reason,
  };
}


/** Durations valid at a concrete tier (tier override wins over the mode list). */
export function durationsFor(modelId: string, mode: VideoMode, resolutionLabel?: string): number[] {
  const caps = getStudioCapabilities(modelId, mode);
  if (!resolutionLabel) return caps.durations;
  const tier = caps.resolutions.find((r) => r.label.toLowerCase() === resolutionLabel.toLowerCase());
  return tier ? tier.durations : caps.durations;
}

/**
 * Exact provider-backed frame for a (model x mode x tier x ratio).
 *
 * Returns a frame ONLY when
 *   a) the tier is startable (model available + tier available/smoke-tested),
 *   b) `sizingRuleVerified === true` — a provider frame table, an explicit
 *      provider sizing reference or a measured smoke test, and
 *   c) the aspect ratio is documented in `framesByAspectRatio`.
 *
 * A grandfathered/UNVERIFIED tier only carries a generically derived frame
 * table. That is an assumption, never "exact pixels", so it returns null.
 */
export function exactFrame(
  modelId: string,
  mode: VideoMode,
  resolutionLabel: string,
  aspectRatio: string,
): PixelFrame | null {
  const spec = getVideoModelSpec(modelId);
  if (!spec || !spec.available) return null;
  const modeSpec = getModeSpec(spec, mode);
  const tier = modeSpec?.resolutions.find(
    (r) => r.native && r.label.toLowerCase() === resolutionLabel.toLowerCase(),
  );
  if (!tier) return null;
  if (!isResolutionTierAvailable(tier)) return null;
  if (!tier.sizingRuleVerified) return null;
  if (!tier.framesByAspectRatio[aspectRatio]) return null;
  return projectTargetFrame(tier, aspectRatio);
}

/** "3840×2160" — exact pixel truth for the UI, or null when unverified. */
export function exactFrameLabel(
  modelId: string,
  mode: VideoMode,
  resolutionLabel: string,
  aspectRatio: string,
): string | null {
  const frame = exactFrame(modelId, mode, resolutionLabel, aspectRatio);
  return frame ? `${frame.width}×${frame.height}` : null;
}


export interface StudioSelection {
  modelId: string;
  mode: VideoMode;
  resolution?: string;
  duration?: number;
  aspectRatio?: string;
  fps?: number;
}

/**
 * Mirrors the server gate for the CURRENT selection. Returns null when the
 * combination is startable, otherwise the violation to surface in the UI.
 * The caller must block the start — never rewrite the value.
 */
export function validateStudioSelection(sel: StudioSelection): CapabilityViolation | null {
  // `-1` is the provider-side smart duration sentinel; the gate sees no duration.
  const smart = sel.duration === -1;
  return validateCapability({
    modelId: sel.modelId,
    mode: sel.mode,
    ...(sel.resolution ? { resolution: sel.resolution } : {}),
    ...(sel.duration != null && !smart ? { durationSeconds: sel.duration } : {}),
    ...(sel.aspectRatio ? { aspectRatio: sel.aspectRatio } : {}),
    ...(sel.fps != null ? { fps: sel.fps } : {}),
  });
}

/**
 * Mode the studio is generating in, derived STRICTLY from the inputs actually
 * attached. Never adjusted to what a model happens to support.
 */
export function deriveStudioMode(inputs: {
  modelId?: string;
  hasStartImage?: boolean;
  hasEndImage?: boolean;
  hasReferenceImages?: boolean;
  hasReferenceVideo?: boolean;
}): VideoMode {
  // ONE resolver, shared with the edge functions through the generated mirror:
  // an end image without a start image is `lastFrame`, never `t2v`.
  return resolveGenerationMode(inputs.modelId ?? '', {
    hasFirstFrame: !!inputs.hasStartImage,
    hasLastFrame: !!inputs.hasEndImage,
    hasReferenceImages: !!inputs.hasReferenceImages,
    hasVideo: !!inputs.hasReferenceVideo,
  });
}

/**
 * True when the model has a route that accepts a SINGLE end image without a
 * first frame — the exact contract behind the "at the end" placement.
 * `supportsLastFrame` is weaker: it is also true for first+last pairing.
 */
export function supportsEndOnlyPlacement(modelId: string): boolean {
  return supportsEndOnly(modelId);
}

/** True when the model can pair a first frame with an end frame. */
export function supportsFirstLastPair(modelId: string): boolean {
  return supportsPairedEndFrame(modelId);
}

/**
 * Canonical audio truth for the CURRENT mode. A model that generates sound in
 * one mode does not automatically do so in another, so the studio asks per
 * mode instead of reading a model-level flag.
 */
export function audioSupportedForMode(modelId: string, mode: VideoMode): boolean {
  return getStudioCapabilities(modelId, mode).audio;
}

/**
 * Does this model expose that mode at all?
 * There is deliberately no `resolveSupportedMode()` any more: if the derived
 * mode does not exist for the chosen model, `getStudioCapabilities()` returns
 * unsupported and `validateStudioSelection()` reports a `mode` violation. The
 * user removes the conflicting input or switches the model — the studio never
 * bends the mode to something the provider was not asked for.
 */
export function modeSupported(modelId: string, mode: VideoMode): boolean {
  const spec = getVideoModelSpec(modelId);
  return !!spec?.modes.some((m) => m.mode === mode);
}

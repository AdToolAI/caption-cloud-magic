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
  validateCapability,
  type CapabilityViolation,
  type ModeSpec,
  type PixelFrame,
  type ResolutionSpec,
  type VideoMode,
  type VideoModelSpec,
} from '@/config/videoModelSpecs';

export type { VideoMode, PixelFrame, CapabilityViolation };

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
};

function lockedReasonFor(spec: VideoModelSpec, tier: ResolutionSpec): string {
  if (!tier.available) {
    return `${tier.label}: Tier ist gesperrt, bis ein Smoke-Test auf ${spec.apiRoute} die echten Pixel misst.`;
  }
  return `${tier.label}: neuer Tier ohne bestandenen Smoke-Test auf ${spec.apiRoute}.`;
}

function toResolutionOption(spec: VideoModelSpec, mode: ModeSpec, tier: ResolutionSpec): ResolutionOption {
  const startable = isResolutionTierAvailable(tier);
  return {
    label: tier.label,
    shortEdge: tier.shortEdge,
    startable,
    ...(startable ? {} : { lockedReason: lockedReasonFor(spec, tier) }),
    durations: tier.durations ?? mode.durations,
    native: tier.native,
    parityStatus: tier.parityStatus,
  };
}

/** Technical options for one (model x mode). Native tiers only. */
export function getStudioCapabilities(modelId: string, mode: VideoMode): StudioCapabilities {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return EMPTY;
  const modeSpec = getModeSpec(spec, mode);
  if (!modeSpec) {
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
 * Returns null when the registry documents no frame — never a guess.
 */
export function exactFrame(
  modelId: string,
  mode: VideoMode,
  resolutionLabel: string,
  aspectRatio: string,
): PixelFrame | null {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return null;
  const modeSpec = getModeSpec(spec, mode);
  const tier = modeSpec?.resolutions.find(
    (r) => r.native && r.label.toLowerCase() === resolutionLabel.toLowerCase(),
  );
  if (!tier) return null;
  if (!tier.framesByAspectRatio[aspectRatio]) return null;
  return projectTargetFrame(tier, aspectRatio);
}

/** "3840×2160" — exact pixel truth for the UI, or null when undocumented. */
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
 * Mode the studio is generating in, derived from the inputs actually attached.
 * Kept here so the UI and the capability lookup can never disagree.
 */
export function deriveStudioMode(inputs: {
  hasStartImage?: boolean;
  hasEndImage?: boolean;
  hasReferenceImages?: boolean;
  hasReferenceVideo?: boolean;
}): VideoMode {
  if (inputs.hasStartImage && inputs.hasEndImage) return 'firstLast';
  if (inputs.hasReferenceVideo) return 'v2v';
  if (inputs.hasStartImage) return 'i2v';
  if (inputs.hasReferenceImages) return 'reference';
  return 't2v';
}

/**
 * Picks the mode that actually exists for this model, closest to the derived
 * one. Used only to LOOK UP options — never to rewrite a user's choice.
 */
export function resolveSupportedMode(modelId: string, desired: VideoMode): VideoMode {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return desired;
  if (spec.modes.some((m) => m.mode === desired)) return desired;
  const fallbackOrder: VideoMode[] = ['t2v', 'i2v', 'reference', 'firstLast', 'v2v'];
  for (const m of fallbackOrder) {
    if (spec.modes.some((x) => x.mode === m)) return m;
  }
  return spec.modes[0]?.mode ?? desired;
}

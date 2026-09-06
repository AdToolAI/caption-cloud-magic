/**
 * Client mirror of the target frame contract
 * (supabase/functions/_shared/video-enhance-frame.ts).
 *
 * The UI must be able to say, before a run starts, exactly which pixel frame
 * will be delivered. The server stays the authority; a parity test asserts
 * both sides project the same frames.
 */

import type { VideoResolution } from '@/config/videoEnhanceModels';

export interface Frame {
  width: number;
  height: number;
}

export const RESOLUTION_FRAME: Record<VideoResolution, { long: number; short: number }> = {
  '720p': { long: 1280, short: 720 },
  '1080p': { long: 1920, short: 1080 },
  '2k': { long: 2560, short: 1440 },
  '4k': { long: 3840, short: 2160 },
};

export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

function even(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function resolveTargetFrame(
  resolution: VideoResolution,
  sourceWidth: number,
  sourceHeight: number,
): Frame {
  const frame = RESOLUTION_FRAME[resolution];
  return isPortrait(sourceWidth, sourceHeight)
    ? { width: frame.short, height: frame.long }
    : { width: frame.long, height: frame.short };
}

export type LabelReading = 'orientation_aware' | 'line_count';

export const ENGINE_LABEL_READING: Record<string, LabelReading> = {
  'bytedance-vcube': 'orientation_aware',
  'topaz-video-upscale': 'line_count',
};

export function projectProviderOutput(
  modelId: string,
  resolution: VideoResolution,
  sourceWidth: number,
  sourceHeight: number,
): Frame {
  const frame = RESOLUTION_FRAME[resolution];
  const reading = ENGINE_LABEL_READING[modelId] ?? 'orientation_aware';
  if (reading === 'orientation_aware') {
    return resolveTargetFrame(resolution, sourceWidth, sourceHeight);
  }
  const height = frame.short;
  const width = sourceHeight > 0 ? even((sourceWidth * height) / sourceHeight) : frame.long;
  return { width, height };
}

const FRAME_TOLERANCE = 0.02;

export function frameMeetsTarget(projected: Frame, target: Frame): boolean {
  return (
    projected.width >= target.width * (1 - FRAME_TOLERANCE) &&
    projected.height >= target.height * (1 - FRAME_TOLERANCE)
  );
}

export function formatFrame(frame: Frame): string {
  return `${frame.width}×${frame.height}`;
}

// ---------------------------------------------------------------------------
// Upscale gate — mirror of supabase/functions/_shared/video-enhance-frame.ts
// ---------------------------------------------------------------------------

export const MIN_UPSCALE_GAIN = 1.15;

export type UpscaleRejection = 'downscale' | 'no_op';

export interface UpscaleVerdict {
  ok: boolean;
  reason: UpscaleRejection | null;
  shortSideGain: number;
  pixelGain: number;
}

export function evaluateUpscale(target: Frame, source: Frame): UpscaleVerdict {
  const sourceShort = Math.min(source.width, source.height) || 1;
  const targetShort = Math.min(target.width, target.height);
  const shortSideGain = targetShort / sourceShort;
  const sourcePixels = Math.max(1, source.width * source.height);
  const pixelGain = (target.width * target.height) / sourcePixels;

  if (target.width < source.width || target.height < source.height) {
    return { ok: false, reason: 'downscale', shortSideGain, pixelGain };
  }
  if (shortSideGain < MIN_UPSCALE_GAIN) {
    return { ok: false, reason: 'no_op', shortSideGain, pixelGain };
  }
  return { ok: true, reason: null, shortSideGain, pixelGain };
}

// ---------------------------------------------------------------------------
// Resolution choices — what each tier means for THIS source, before the start
// ---------------------------------------------------------------------------

export interface ResolutionChoice {
  resolution: VideoResolution;
  /** Exact frame this tier promises for the source orientation. */
  frame: Frame;
  /** Whether ordering this tier would actually add pixels. */
  verdict: UpscaleVerdict;
}

/**
 * Describes every offered tier against the measured source, so a picker can
 * print the exact target frame next to each label and disable tiers that
 * would be a no-op or a downscale — instead of only disabling the start
 * button after the fact.
 */
export function describeResolutionChoices(
  resolutions: VideoResolution[],
  sourceWidth: number,
  sourceHeight: number,
): ResolutionChoice[] {
  const source = { width: sourceWidth, height: sourceHeight };
  return resolutions.map((resolution) => {
    const frame = resolveTargetFrame(resolution, sourceWidth, sourceHeight);
    return { resolution, frame, verdict: evaluateUpscale(frame, source) };
  });
}

/** Smallest offered tier that is a real upscale for the source, if any. */
export function firstUpscaleResolution(
  resolutions: VideoResolution[],
  sourceWidth: number,
  sourceHeight: number,
): VideoResolution | null {
  const ordered = [...resolutions].sort(
    (a, b) => RESOLUTION_FRAME[a].short - RESOLUTION_FRAME[b].short,
  );
  return describeResolutionChoices(ordered, sourceWidth, sourceHeight)
    .find((choice) => choice.verdict.ok)?.resolution ?? null;
}

/**
 * Which engine really runs for a tier: the requested one when it meets the
 * promised frame, otherwise the first offered engine that does, else `null`
 * (no engine can deliver the frame). Mirror of the server's `planDelivery`.
 */
export function resolveExecutionEngine(
  requestedModelId: string,
  candidateModelIds: string[],
  resolution: VideoResolution,
  sourceWidth: number,
  sourceHeight: number,
): { executionModelId: string | null; routed: boolean } {
  const target = resolveTargetFrame(resolution, sourceWidth, sourceHeight);
  if (frameMeetsTarget(projectProviderOutput(requestedModelId, resolution, sourceWidth, sourceHeight), target)) {
    return { executionModelId: requestedModelId, routed: false };
  }
  for (const candidate of candidateModelIds) {
    if (candidate === requestedModelId) continue;
    if (frameMeetsTarget(projectProviderOutput(candidate, resolution, sourceWidth, sourceHeight), target)) {
      return { executionModelId: candidate, routed: true };
    }
  }
  return { executionModelId: null, routed: false };
}

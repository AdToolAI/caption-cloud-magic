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

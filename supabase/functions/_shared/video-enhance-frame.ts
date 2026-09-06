/**
 * Target frame contract for Video Enhance.
 *
 * A resolution label is a PROMISE about the delivered frame, not a hint:
 *   4K   = 3840 on the long side, 2160 on the short side
 *   2K   = 2560 / 1440
 *   1080p= 1920 / 1080
 *   720p = 1280 / 720
 * A portrait source ordered at 4K must come back as 2160x3840 — the same
 * pixel count a landscape source gets, only turned.
 *
 * The engines do NOT agree on this:
 *   - ByteDance vCube reads the label orientation-aware (measured run
 *     014661bc: 1080x1920 -> 2160x3840).
 *   - Topaz reads the label as a target LINE COUNT and therefore puts 2160 on
 *     the height whatever the orientation (measured runs ee9fdb0e and
 *     b9b479d4: 1080x1920 and 720x1280 both -> 1216x2160).
 *
 * This module is the single place that knows both facts. It is pure, so the
 * client mirror (src/lib/videoEnhance/targetFrame.ts) can assert parity.
 */

import type { VideoResolution } from './video-enhance-models.ts';

export interface Frame {
  width: number;
  height: number;
}

/** Long side / short side per label. */
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

/** What the customer is promised for this label and this source orientation. */
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

/** How a given engine actually reads the label. */
export type LabelReading = 'orientation_aware' | 'line_count';

export const ENGINE_LABEL_READING: Record<string, LabelReading> = {
  'bytedance-vcube': 'orientation_aware',
  'topaz-video-upscale': 'line_count',
};

/** The frame this engine will really return for this source. */
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
  // Line-count engines pin the SHORT-side number onto the height and keep the
  // source aspect ratio, so a portrait clip barely grows.
  const height = frame.short;
  const width = sourceHeight > 0 ? even((sourceWidth * height) / sourceHeight) : frame.long;
  return { width, height };
}

/** Tolerance for "the engine met the promise" (encoder rounding only). */
const FRAME_TOLERANCE = 0.02;

export function frameMeetsTarget(projected: Frame, target: Frame): boolean {
  return (
    projected.width >= target.width * (1 - FRAME_TOLERANCE) &&
    projected.height >= target.height * (1 - FRAME_TOLERANCE)
  );
}

export type DeliveryStrategy =
  /** The chosen engine delivers the promised frame itself. */
  | 'native'
  /** The chosen engine cannot; a capable engine runs instead. */
  | 'engine_routed'
  /** No available engine can deliver the promised frame. */
  | 'unreachable';

export interface DeliveryPlan {
  requestedModelId: string;
  executionModelId: string;
  strategy: DeliveryStrategy;
  target: Frame;
  projected: Frame;
  portrait: boolean;
  /** Growth on the short side vs. the source — the honest "is this worth it". */
  shortSideGain: number;
  reason: string | null;
}

/**
 * Decide WHICH engine runs so the promised frame is actually delivered.
 * The customer never has to switch anything by hand.
 */
export function planDelivery(params: {
  requestedModelId: string;
  resolution: VideoResolution;
  sourceWidth: number;
  sourceHeight: number;
  /** Engines that may run for this user right now, in preference order. */
  availableModelIds: string[];
}): DeliveryPlan {
  const { requestedModelId, resolution, sourceWidth, sourceHeight } = params;
  const target = resolveTargetFrame(resolution, sourceWidth, sourceHeight);
  const portrait = isPortrait(sourceWidth, sourceHeight);
  const sourceShort = Math.min(sourceWidth, sourceHeight) || 1;

  const requested = projectProviderOutput(requestedModelId, resolution, sourceWidth, sourceHeight);
  if (frameMeetsTarget(requested, target)) {
    return {
      requestedModelId,
      executionModelId: requestedModelId,
      strategy: 'native',
      target,
      projected: requested,
      portrait,
      shortSideGain: Math.min(requested.width, requested.height) / sourceShort,
      reason: null,
    };
  }

  for (const candidate of params.availableModelIds) {
    if (candidate === requestedModelId) continue;
    const projected = projectProviderOutput(candidate, resolution, sourceWidth, sourceHeight);
    if (frameMeetsTarget(projected, target)) {
      return {
        requestedModelId,
        executionModelId: candidate,
        strategy: 'engine_routed',
        target,
        projected,
        portrait,
        shortSideGain: Math.min(projected.width, projected.height) / sourceShort,
        reason: 'requested_engine_cannot_reach_target_frame',
      };
    }
  }

  return {
    requestedModelId,
    executionModelId: requestedModelId,
    strategy: 'unreachable',
    target,
    projected: requested,
    portrait,
    shortSideGain: Math.min(requested.width, requested.height) / sourceShort,
    reason: 'no_engine_reaches_target_frame',
  };
}

// ---------------------------------------------------------------------------
// Upscale gate — a paid enhancement must actually add pixels
// ---------------------------------------------------------------------------

/**
 * Minimum growth on the short side before an order counts as an upscale.
 * Below this the customer would pay for a re-encode of their own file.
 */
export const MIN_UPSCALE_GAIN = 1.15;

export type UpscaleRejection = 'downscale' | 'no_op';

export interface UpscaleVerdict {
  ok: boolean;
  reason: UpscaleRejection | null;
  shortSideGain: number;
  pixelGain: number;
}

/**
 * Compares the PROMISED target frame with the measured source frame.
 * 1080x1920 -> 1080x1920 is a no-op, 1080x1920 -> 720p is a downscale; both are
 * rejected before any money moves, in the estimate path and in the start path.
 */
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

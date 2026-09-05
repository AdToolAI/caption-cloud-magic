import {
  availableFps,
  availableTiers,
  getVideoEnhanceModel,
  outputsFor,
  RESOLUTION_ORDER,
  RESOLUTION_PIXELS,
  visibleVideoEnhanceModels,
  type EnhanceConfig,
  type SourceMetadata,
  type VideoResolution,
} from '@/config/videoEnhanceModels';

/**
 * One recommendation engine for every entry point.
 *
 * "Recommended" and "High quality" are SEMANTIC INTENTS, not fixed presets.
 * The concrete model, mode, resolution and FPS are recomputed from the source
 * metadata, the destination and the currently available capabilities — the
 * resulting configuration is always shown to the user.
 */

export type EnhanceDestination = 'reels' | 'tiktok' | 'youtube' | 'youtube_4k' | 'web' | 'archive';
export type EnhanceIntent = 'recommended' | 'high_quality';

export interface RecommendationInput extends SourceMetadata {
  destination?: EnhanceDestination;
  intent?: EnhanceIntent;
}

export interface Recommendation {
  /** `null` = source is already good enough; enhancing would waste money. */
  config: EnhanceConfig | null;
  reason:
    | 'already_optimal'
    | 'ai_source_social'
    | 'ai_source_large'
    | 'camera_source'
    | 'restoration'
    | 'no_model_available';
}

const DESTINATION_TARGET: Record<EnhanceDestination, VideoResolution> = {
  reels: '1080p',
  tiktok: '1080p',
  web: '1080p',
  youtube: '2k',
  youtube_4k: '4k',
  archive: '4k',
};

const AI_SOURCE_HINTS = ['seedance', 'kling', 'hailuo', 'veo', 'sora', 'runway', 'modelark', 'omni'];

export function isAiGeneratedSource(sourceModel?: string): boolean {
  if (!sourceModel) return false;
  const id = sourceModel.toLowerCase();
  return AI_SOURCE_HINTS.some((hint) => id.includes(hint));
}

export function sourceResolutionBucket(width: number, height: number): VideoResolution {
  const pixels = Math.max(width, height) * Math.min(width, height);
  const bucket = RESOLUTION_ORDER.find((r) => {
    const t = RESOLUTION_PIXELS[r];
    return pixels <= t.width * t.height * 1.05;
  });
  return bucket ?? '4k';
}

function pickFps(modelId: string, mode: string, resolution: VideoResolution, sourceFps: number) {
  const model = getVideoEnhanceModel(modelId);
  if (!model) return null;
  const options = availableFps(model, mode, resolution);
  if (options.length === 0) return null;
  const rounded = Math.round(sourceFps);
  // Keep the source cadence when the model supports it — never sell 60 fps by
  // default, interpolation changes the look of the footage.
  if (options.includes(rounded)) return rounded;
  return options.reduce((best, fps) =>
    Math.abs(fps - rounded) < Math.abs(best - rounded) ? fps : best,
  );
}

function buildConfig(
  modelId: string,
  mode: string,
  resolution: VideoResolution,
  source: SourceMetadata,
): EnhanceConfig | null {
  const model = getVideoEnhanceModel(modelId);
  if (!model) return null;
  const combos = outputsFor(model, mode);
  if (!combos.some((c) => c.resolution === resolution)) return null;
  const tier = availableTiers(model)[0];
  if (!tier) return null;
  const fps = pickFps(modelId, mode, resolution, source.fps);
  if (fps === null) return null;
  return { modelId, mode, resolution, fps, tier };
}

function highestAvailable(
  modelId: string,
  mode: string,
  cap: VideoResolution,
): VideoResolution | null {
  const model = getVideoEnhanceModel(modelId);
  if (!model) return null;
  const allowed = outputsFor(model, mode).map((o) => o.resolution);
  const capIndex = RESOLUTION_ORDER.indexOf(cap);
  for (let i = capIndex; i >= 0; i--) {
    if (allowed.includes(RESOLUTION_ORDER[i])) return RESOLUTION_ORDER[i];
  }
  return null;
}

export function recommendEnhancement(input: RecommendationInput): Recommendation {
  const available = new Set(visibleVideoEnhanceModels().map((m) => m.id));
  if (available.size === 0) return { config: null, reason: 'no_model_available' };

  const intent = input.intent ?? 'recommended';
  const destination = input.destination ?? 'web';
  const target = DESTINATION_TARGET[destination];
  const sourceBucket = sourceResolutionBucket(input.width, input.height);

  const aiSource = isAiGeneratedSource(input.sourceModel);
  const preferred = aiSource ? 'bytedance-vcube' : 'topaz-video-upscale';
  const modelId = available.has(preferred) ? preferred : [...available][0];
  const mode = aiSource && modelId === 'bytedance-vcube' ? 'aigc' : 'standard';
  const resolvedMode = getVideoEnhanceModel(modelId)?.processingModes.some((m) => m.id === mode)
    ? mode
    : (getVideoEnhanceModel(modelId)?.processingModes[0]?.id ?? mode);

  // Already at or above the destination and not asked for more: do nothing.
  const sourceIndex = RESOLUTION_ORDER.indexOf(sourceBucket);
  const targetIndex = RESOLUTION_ORDER.indexOf(target);
  if (intent === 'recommended' && sourceIndex >= targetIndex) {
    return { config: null, reason: 'already_optimal' };
  }

  const cap =
    intent === 'high_quality'
      ? RESOLUTION_ORDER[Math.max(targetIndex, Math.min(sourceIndex + 1, RESOLUTION_ORDER.length - 1))]
      : target;
  const resolution = highestAvailable(modelId, resolvedMode, cap);
  if (!resolution) return { config: null, reason: 'no_model_available' };

  const config = buildConfig(modelId, resolvedMode, resolution, input);
  if (!config) return { config: null, reason: 'no_model_available' };

  return {
    config,
    reason: aiSource
      ? targetIndex >= RESOLUTION_ORDER.indexOf('4k')
        ? 'ai_source_large'
        : 'ai_source_social'
      : 'camera_source',
  };
}

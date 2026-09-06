/**
 * Video Enhance — model registry types.
 *
 * The registry describes WHAT a model can do. It never builds a provider
 * request (that is the adapter inside the edge function) and it never decides
 * whether a run may start (that is the backend switch + allowlist).
 *
 * Capabilities are expressed as VALID COMBINATIONS, never as independent
 * `maxResolution` / `maxFps` ceilings — otherwise the UI would offer pairs the
 * provider rejects.
 */

export interface LocalizedText {
  en: string;
  de: string;
  es: string;
}

export type VideoEnhanceCapability =
  | 'upscale'
  | 'fps_interpolation'
  | 'aigc_enhance'
  | 'ugc_enhance'
  | 'restoration';

export type VideoResolution = '720p' | '1080p' | '2k' | '4k';

export const RESOLUTION_PIXELS: Record<VideoResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};

/** Ordered from small to large — used by the recommendation engine. */
export const RESOLUTION_ORDER: VideoResolution[] = ['720p', '1080p', '2k', '4k'];

export type QualityTier = 'standard' | 'pro';

export interface ProcessingModeDefinition {
  id: string;
  label: LocalizedText;
  hint?: LocalizedText;
  /** Best suited source material — drives the recommendation engine. */
  suitedFor: ('ai_generated' | 'camera' | 'ugc' | 'archive')[];
}

/** One allowed resolution together with the FPS values valid AT that resolution. */
export interface OutputCombination {
  resolution: VideoResolution;
  fps: number[];
}

export interface VideoEnhanceModelDefinition {
  id: string;
  /** Real model name — always visible in the UI. No black box. */
  name: string;
  vendor: string;
  provider: 'replicate';
  /** Provider-side identifier, consumed only by the adapter. */
  providerModelId: string;
  /**
   * Which provider schema version these combinations were read from. Values
   * from other model versions are never mixed in.
   */
  providerSchemaRef: string;
  positioning: LocalizedText;
  description: LocalizedText;
  bestFor: LocalizedText[];
  capabilities: VideoEnhanceCapability[];
  processingModes: ProcessingModeDefinition[];
  /** Combinations valid for every mode unless `outputsByMode` overrides them. */
  outputs: OutputCombination[];
  outputsByMode?: Record<string, OutputCombination[]>;
  qualityTiers: QualityTier[];
  /** Tiers that need a verified provider entitlement before being offered. */
  entitlementTiers?: QualityTier[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  /** Typical processing time range in seconds — a range, never a promise. */
  typicalProcessingSeconds?: [number, number];
  /** Visible in production UI. Stays false until the live gates passed. */
  enabled: boolean;
  /** Feature flag that can enable the model ahead of a global rollout. */
  featureFlag?: string;
  /** Backend switch name; the frontend flag alone never unlocks a run. */
  backendFlag: string;
}

export interface EnhanceConfig {
  modelId: string;
  mode: string;
  /**
   * true only when the customer actively picked the footage type. A UI
   * default is not a choice: without this flag the server derives the
   * ByteDance scene from the clip's provenance (generated → aigc,
   * uploaded → ugc, unknown → common).
   */
  modeExplicit?: boolean;
  resolution: VideoResolution;
  /** `null` keeps the source frame rate. */
  fps: number | null;
  tier: QualityTier;
}

/** Server-measured source facts. Never taken from the client payload. */
export interface SourceMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container: string;
  sizeBytes: number;
  /** Which pipeline produced the source, when known. */
  sourceModel?: string;
}

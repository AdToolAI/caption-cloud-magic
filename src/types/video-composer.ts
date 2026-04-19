// AI Video Composer — Scene-Based Video Assembly Types

import type { TextOverlay as DirectorCutTextOverlay } from '@/types/directors-cut';
import type { ComposerVisualStyle } from '@/config/composerVisualStyles';

export type { ComposerVisualStyle };

/**
 * Re-exported global text overlay shape (shared with Director's Cut).
 * Lives on AssemblyConfig.globalTextOverlays — overlays span the FULL video
 * timeline, independent of scene boundaries.
 */
export type GlobalTextOverlay = DirectorCutTextOverlay;

export type ComposerCategory = 'product-ad' | 'corporate-ad' | 'storytelling' | 'custom';

export type ComposerStatus = 'draft' | 'storyboard' | 'generating' | 'assembling' | 'preview' | 'completed' | 'failed';

export type SceneType = 'hook' | 'problem' | 'solution' | 'demo' | 'social-proof' | 'cta' | 'custom';

export type ClipSource = 'ai-hailuo' | 'ai-kling' | 'ai-sora' | 'stock' | 'upload';

export type ClipQuality = 'standard' | 'pro';

export type ClipStatus = 'pending' | 'generating' | 'ready' | 'failed';

export type TransitionStyle = 'none' | 'fade' | 'crossfade' | 'wipe' | 'slide' | 'zoom';

export type ColorGradingPreset = 'none' | 'cinematic-warm' | 'cool-blue' | 'vintage-film' | 'high-contrast' | 'moody-dark';

export type TextPosition = 'top' | 'center' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type TextAnimation = 'none' | 'fade-in' | 'scale-bounce' | 'slide-left' | 'slide-right' | 'word-by-word' | 'glow-pulse';

export type ComposerMode = 'ai' | 'manual';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export type EmotionalTone = 'professional' | 'energetic' | 'emotional' | 'funny' | 'luxury' | 'minimal' | 'dramatic' | 'friendly';

/**
 * Recurring on-screen character profile.
 * - `appearance`: physical description (face, age, hair, build) — used sparingly.
 * - `signatureItems`: clothing / objects / props — repeated in EVERY scene where
 *   the character (or a part of them) is visible. AI is reliable at repeating
 *   props/clothing, much less so at faces — this is the Sherlock-Holmes anchor.
 */
export interface ComposerCharacter {
  id: string;
  name: string;
  appearance: string;
  signatureItems: string;
}

/**
 * Per-scene shot strategy for character continuity. Set by the storyboard AI
 * (or manually by the user) to vary camera framing across scenes — only 2-3
 * scenes show the full face, the rest use detail / silhouette / POV / back-
 * shot framing so face inconsistencies between independent video generations
 * are not noticed.
 */
export type CharacterShotType = 'full' | 'profile' | 'back' | 'detail' | 'pov' | 'silhouette' | 'absent';

export interface CharacterShot {
  characterId: string;
  shotType: CharacterShotType;
}

export interface TextOverlayConfig {
  text: string;
  position: TextPosition;
  animation: TextAnimation;
  fontSize: number;
  color: string;
  fontFamily?: string;
}

export interface ComposerBriefing {
  mode: ComposerMode;
  productName: string;
  productDescription: string;
  usps: string[];
  targetAudience: string;
  tone: EmotionalTone;
  duration: number; // 15-90 seconds
  aspectRatio: AspectRatio;
  brandColors: string[];
  logoUrl?: string;
  defaultQuality?: ClipQuality;
  /** Visual style applied to every AI-generated scene (Comic, Realistic, Cinematic, …). */
  visualStyle?: ComposerVisualStyle;
  /** Recurring characters that should look consistent across scenes. */
  characters?: ComposerCharacter[];
}

export interface ComposerScene {
  id: string;
  projectId: string;
  orderIndex: number;
  sceneType: SceneType;
  durationSeconds: number;
  clipSource: ClipSource;
  clipQuality: ClipQuality;
  aiPrompt?: string;
  stockKeywords?: string;
  uploadUrl?: string;
  uploadType?: 'video' | 'image';
  /** Optional reference image used as a visual guide for AI sources (image-to-video). */
  referenceImageUrl?: string;
  /** Optional shot-strategy hint for character continuity. */
  characterShot?: CharacterShot;
  clipUrl?: string;
  clipStatus: ClipStatus;
  textOverlay: TextOverlayConfig;
  transitionType: TransitionStyle;
  transitionDuration: number;
  replicatePredictionId?: string;
  retryCount: number;
  costEuros: number;
}

export type SubtitlePosition = 'top' | 'bottom';

export interface SubtitlesStyle {
  font: string;
  size: number;
  color: string;
  background: string; // rgba or hex w/ alpha; '' = no box
  position: SubtitlePosition;
}

export interface SubtitleSegmentWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: SubtitleSegmentWord[];
}

export interface SubtitlesConfig {
  enabled: boolean;
  language: string; // 'de' | 'en' | 'es' | …
  style: SubtitlesStyle;
  /** Optional pre-generated timed segments (from `generate-subtitles` edge function). */
  segments?: SubtitleSegment[];
}

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type WatermarkSize = 'small' | 'medium' | 'large';

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  size: WatermarkSize;
  /** 0.3 – 1.0 */
  opacity: number;
}

export interface AssemblyConfig {
  colorGrading: ColorGradingPreset;
  transitionStyle: TransitionStyle;
  kineticText: boolean;
  voiceover: VoiceoverConfig | null;
  music: MusicConfig | null;
  beatSync: boolean;
  subtitles?: SubtitlesConfig;
  /**
   * Timeline-based text overlays that span across the full video — independent
   * of scene boundaries. Replaces the legacy per-scene `ComposerScene.textOverlay`.
   */
  globalTextOverlays?: GlobalTextOverlay[];
  /**
   * Toggle for the entire text-overlays feature. When `false`, overlays are kept
   * in storage but not rendered in preview or final export. `undefined` defaults
   * to enabled (backwards-compat for older drafts).
   */
  textOverlaysEnabled?: boolean;
  /** Configurable watermark overlay rendered above all scenes. */
  watermark?: WatermarkConfig;
}

export interface VoiceoverConfig {
  enabled: boolean;
  voiceId: string;
  voiceName: string;
  script: string;
  audioUrl?: string;
  /** Playback / synthesis speed multiplier (0.7 – 1.2). */
  speed?: number;
  /** ElevenLabs stability (0–1). */
  stability?: number;
  /** ElevenLabs similarity boost (0–1). */
  similarityBoost?: number;
  /** ElevenLabs style exaggeration (0–1). */
  styleExaggeration?: number;
  /** ElevenLabs speaker boost flag. */
  useSpeakerBoost?: boolean;
  /** Estimated VO duration in seconds — used by the renderer to extend the
   *  composition timeline so crossfade overlap doesn't cut off audio. */
  durationSeconds?: number;
}

export interface MusicConfig {
  enabled: boolean;
  trackUrl: string;
  trackName: string;
  genre: string;
  mood: string;
  volume: number; // 0-100
  isUpload: boolean;
}

export interface ComposerProject {
  id: string;
  userId: string;
  title: string;
  category: ComposerCategory;
  briefing: ComposerBriefing;
  status: ComposerStatus;
  storyboard: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  outputUrl?: string;
  thumbnailUrl?: string;
  totalCostEuros: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

// Default values
export const DEFAULT_BRIEFING: ComposerBriefing = {
  mode: 'ai',
  productName: '',
  productDescription: '',
  usps: [],
  targetAudience: '',
  tone: 'professional',
  duration: 30,
  aspectRatio: '16:9',
  brandColors: [],
  defaultQuality: 'standard',
  visualStyle: 'realistic',
  characters: [],
};

export const DEFAULT_SUBTITLES_CONFIG: SubtitlesConfig = {
  enabled: false,
  language: 'de',
  style: {
    font: 'Inter',
    size: 36,
    color: '#FFFFFF',
    background: 'rgba(0,0,0,0.55)',
    position: 'bottom',
  },
};

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: false,
  text: '',
  position: 'bottom-right',
  size: 'medium',
  opacity: 0.7,
};

export const DEFAULT_ASSEMBLY_CONFIG: AssemblyConfig = {
  colorGrading: 'none',
  transitionStyle: 'fade',
  kineticText: false,
  voiceover: null,
  music: null,
  beatSync: false,
  subtitles: DEFAULT_SUBTITLES_CONFIG,
  globalTextOverlays: [],
  watermark: DEFAULT_WATERMARK_CONFIG,
};

export const DEFAULT_TEXT_OVERLAY: TextOverlayConfig = {
  text: '',
  position: 'bottom',
  animation: 'fade-in',
  fontSize: 48,
  color: '#FFFFFF',
};

// Scene type labels
export const SCENE_TYPE_LABELS: Record<SceneType, { de: string; en: string; es: string }> = {
  hook: { de: 'Hook', en: 'Hook', es: 'Gancho' },
  problem: { de: 'Problem', en: 'Problem', es: 'Problema' },
  solution: { de: 'Lösung', en: 'Solution', es: 'Solución' },
  demo: { de: 'Demo', en: 'Demo', es: 'Demo' },
  'social-proof': { de: 'Social Proof', en: 'Social Proof', es: 'Prueba Social' },
  cta: { de: 'Call to Action', en: 'Call to Action', es: 'Llamada a la Acción' },
  custom: { de: 'Eigene Szene', en: 'Custom Scene', es: 'Escena Personalizada' },
};

// Clip source labels
export const CLIP_SOURCE_LABELS: Record<ClipSource, { de: string; en: string }> = {
  'ai-hailuo': { de: 'KI (Hailuo)', en: 'AI (Hailuo)' },
  'ai-kling': { de: 'KI (Kling)', en: 'AI (Kling)' },
  'ai-sora': { de: 'KI (Sora)', en: 'AI (Sora)' },
  stock: { de: 'Stock Video', en: 'Stock Video' },
  upload: { de: 'Eigener Upload', en: 'Own Upload' },
};

// Estimated costs per clip source × quality tier — EUR per second
// Standard = lower resolution (Hailuo 768p / Kling 720p / Sora std)
// Pro = higher resolution (Hailuo 1080p / Kling 1080p / Sora pro)
export const CLIP_SOURCE_COSTS: Record<ClipSource, Record<ClipQuality, number>> = {
  'ai-hailuo': { standard: 0.15, pro: 0.20 },
  'ai-kling':  { standard: 0.15, pro: 0.21 },
  'ai-sora':   { standard: 0.25, pro: 0.53 },
  stock:       { standard: 0, pro: 0 },
  upload:      { standard: 0, pro: 0 },
};

// Quality tier labels & resolution hints
export const QUALITY_LABELS: Record<ClipSource, Record<ClipQuality, string>> = {
  'ai-hailuo': { standard: 'Standard 768p', pro: 'Pro 1080p' },
  'ai-kling':  { standard: 'Standard 720p', pro: 'Pro 1080p' },
  'ai-sora':   { standard: 'Standard',      pro: 'Pro' },
  stock:       { standard: '-', pro: '-' },
  upload:      { standard: '-', pro: '-' },
};

/** Returns total cost for a clip in EUR. */
export function getClipCost(source: ClipSource, quality: ClipQuality, durationSec: number): number {
  return (CLIP_SOURCE_COSTS[source]?.[quality] ?? 0) * durationSec;
}

/** Returns the per-second rate. */
export function getClipRate(source: ClipSource, quality: ClipQuality): number {
  return CLIP_SOURCE_COSTS[source]?.[quality] ?? 0;
}

export const CATEGORY_LABELS: Record<ComposerCategory, { de: string; en: string; es: string }> = {
  'product-ad': { de: 'Produktvideo', en: 'Product Ad', es: 'Anuncio de Producto' },
  'corporate-ad': { de: 'Unternehmenswerbung', en: 'Corporate Ad', es: 'Anuncio Corporativo' },
  storytelling: { de: 'Storytelling', en: 'Storytelling', es: 'Storytelling' },
  custom: { de: 'Allgemeiner Editor', en: 'General Editor', es: 'Editor General' },
};

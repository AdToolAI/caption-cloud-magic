// AI Video Composer — Scene-Based Video Assembly Types

import type { TextOverlay as DirectorCutTextOverlay } from '@/types/directors-cut';
import type { ComposerVisualStyle } from '@/config/composerVisualStyles';
import type { SceneEffectConfig, SceneEffectId } from '@/remotion/components/effects';

export type { ComposerVisualStyle, SceneEffectConfig, SceneEffectId };

/**
 * Re-exported global text overlay shape (shared with Director's Cut).
 * Lives on AssemblyConfig.globalTextOverlays — overlays span the FULL video
 * timeline, independent of scene boundaries.
 */
export type GlobalTextOverlay = DirectorCutTextOverlay;

export type ComposerCategory = 'product-ad' | 'corporate-ad' | 'storytelling' | 'custom';

export type ComposerStatus = 'draft' | 'storyboard' | 'generating' | 'assembling' | 'preview' | 'completed' | 'failed';

export type SceneType = 'hook' | 'problem' | 'solution' | 'demo' | 'social-proof' | 'cta' | 'custom';

export type ClipSource =
  | 'ai-hailuo'
  | 'ai-kling'
  | 'ai-sora'
  | 'ai-wan'
  | 'ai-seedance'
  | 'ai-luma'
  | 'ai-veo'
  | 'ai-image'
  | 'stock'
  | 'stock-image'
  | 'upload';

export type StockMediaSource = 'pixabay' | 'pexels';

export type VideoMode = 'video' | 'image' | 'mixed';

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
  /**
   * Video generation mode:
   * - 'video' (default): AI video clips (Hailuo/Kling/Sora) — premium quality
   * - 'image': AI-generated still images with Ken-Burns animation — ~6x cheaper
   * - 'mixed': Hero scenes as video, supporting scenes as image
   */
  videoMode?: VideoMode;
  /**
   * Stock-First Auto-Director hint:
   * When true, the storyboard AI prefers free Pexels/Pixabay stock footage for
   * generic B-roll / establishing / lifestyle scenes (`clipSource = 'stock'`)
   * instead of paid AI video generation. Default false.
   */
  preferStock?: boolean;
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
  /**
   * AI-selected (or user-overridden) visual effects layered above this scene's
   * clip / image. Frame-deterministic, Lambda-safe.
   */
  effects?: SceneEffectConfig[];
  /**
   * Director Presets — camera/lens/lighting/mood/film-stock modifier IDs that
   * are appended to the AI prompt before generation (Phase 3).
   */
  directorModifiers?: {
    camera?: string;
    lens?: string;
    lighting?: string;
    mood?: string;
    filmStock?: string;
  };
  /**
   * Shot Director — per-scene cinematography (Framing, Angle, Movement, Lighting).
   * Selection IDs map to `src/config/shotDirector.ts`. Appended to the AI prompt
   * as English suffix via `buildShotPromptSuffix`. Complementary to
   * `directorModifiers` (which covers Lens/Film Stock/Mood).
   */
  shotDirector?: {
    framing?: string;
    angle?: string;
    movement?: string;
    lighting?: string;
  };
  /** Stock media metadata when clipSource === 'stock' or 'stock-image'. */
  stockMediaThumb?: string;
  stockMediaSource?: StockMediaSource;
  stockMediaAuthor?: { name: string; url?: string };
  /**
   * Block K — Structured Prompt Composer.
   * `promptSlots` holds the 6-slot representation; `promptMode` decides which
   * editor the user sees ('free' = textarea, 'structured' = slot grid).
   * `appliedStylePresetId` records which style preset was last applied for
   * usage stats / re-apply UX.
   */
  promptSlots?: {
    subject?: string;
    action?: string;
    setting?: string;
    timeWeather?: string;
    style?: string;
    negative?: string;
  };
  promptMode?: 'free' | 'structured';
  /**
   * Block K-P2 — User-defined slot order (excluding `negative`, which is
   * always pinned at the end). Persisted in `composer_scenes.prompt_slot_order`.
   */
  promptSlotOrder?: Array<'subject' | 'action' | 'setting' | 'timeWeather' | 'style'>;
  appliedStylePresetId?: string;
  /**
   * Block M — Hybrid Production.
   * `hybridMode` marks how this scene was created from another scene:
   *   - 'forward'   → continues a source scene (anchored on its last frame)
   *   - 'backward'  → precedes a source scene (anchored on its first frame)
   *   - 'bridge'    → morphs between two scenes
   *   - 'style-ref' → uses another video as a style anchor
   * `firstFrameUrl` / `endReferenceImageUrl` cache anchor frames so we don't
   *   re-extract on every regeneration.
   * `hybridTargetSceneId` points back to the source scene that anchored this one.
   */
  hybridMode?: 'forward' | 'backward' | 'bridge' | 'style-ref';
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  endReferenceImageUrl?: string;
  hybridTargetSceneId?: string;
  /**
   * Continuity Guardian (Reference-Chaining 2.0).
   * `continuityDriftScore` (0-100) is computed by `detect-scene-drift` against
   * the previous scene's last frame. Lower = more consistent. `…Label` is a
   * short human-readable diff summary (e.g. "lighting changed, character missing").
   * `continuityAutoRepair` opts the scene into automatic re-generation
   * with a locked reference image when drift exceeds the threshold.
   */
  continuityDriftScore?: number;
  continuityDriftLabel?: string;
  continuityAutoRepair?: boolean;
  /**
   * Continuity Pro-Layer: when `continuityLocked` is true the scene's
   * `lockReferenceUrl` is treated as the immutable anchor for any
   * downstream re-renders / drift checks.
   */
  continuityLocked?: boolean;
  lockReferenceUrl?: string;
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
  'ai-hailuo':   { de: 'KI (Hailuo)', en: 'AI (Hailuo)' },
  'ai-kling':    { de: 'KI (Kling)', en: 'AI (Kling)' },
  'ai-sora':     { de: 'KI (Sora)', en: 'AI (Sora)' },
  'ai-wan':      { de: 'KI (Wan 2.5)', en: 'AI (Wan 2.5)' },
  'ai-seedance': { de: 'KI (Seedance)', en: 'AI (Seedance)' },
  'ai-luma':     { de: 'KI (Luma Ray 2)', en: 'AI (Luma Ray 2)' },
  'ai-veo':      { de: 'KI (Veo 3.1) 🎵', en: 'AI (Veo 3.1) 🎵' },
  'ai-image':    { de: 'KI Bild (Gemini)', en: 'AI Image (Gemini)' },
  stock:         { de: 'Stock Video', en: 'Stock Video' },
  'stock-image': { de: 'Stock Bild', en: 'Stock Image' },
  upload:        { de: 'Eigener Upload', en: 'Own Upload' },
};

// Estimated costs per clip source × quality tier — EUR per second
export const CLIP_SOURCE_COSTS: Record<ClipSource, Record<ClipQuality, number>> = {
  'ai-hailuo':   { standard: 0.15, pro: 0.20 },
  'ai-kling':    { standard: 0.15, pro: 0.21 },
  'ai-sora':     { standard: 0.25, pro: 0.53 },
  'ai-wan':      { standard: 0.10, pro: 0.18 },
  'ai-seedance': { standard: 0.12, pro: 0.20 },
  'ai-luma':     { standard: 0.20, pro: 0.32 },
  // Veo 3.1: standard = Lite 720p (Replicate $0.05/s → 75% margin), pro = Pro 1080p (Replicate $0.40/s → 71% margin)
  'ai-veo':      { standard: 0.20, pro: 1.40 },
  'ai-image':    { standard: 0.01, pro: 0.015 },
  stock:         { standard: 0, pro: 0 },
  'stock-image': { standard: 0, pro: 0 },
  upload:        { standard: 0, pro: 0 },
};

// Quality tier labels & resolution hints
export const QUALITY_LABELS: Record<ClipSource, Record<ClipQuality, string>> = {
  'ai-hailuo':   { standard: 'Standard 768p', pro: 'Pro 1080p' },
  'ai-kling':    { standard: 'Standard 720p', pro: 'Pro 1080p' },
  'ai-sora':     { standard: 'Standard',      pro: 'Pro' },
  'ai-wan':      { standard: 'Standard 720p', pro: 'Pro 1080p' },
  'ai-seedance': { standard: 'Standard 720p', pro: 'Pro 1080p' },
  'ai-luma':     { standard: 'Ray 2 720p',    pro: 'Ray 2 720p+' },
  'ai-veo':      { standard: 'Lite 720p +Audio', pro: 'Pro 1080p +Audio' },
  'ai-image':    { standard: 'Nano Banana 2', pro: 'Gemini 3 Pro' },
  stock:         { standard: '-', pro: '-' },
  'stock-image': { standard: '-', pro: '-' },
  upload:        { standard: '-', pro: '-' },
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

// ─── Ad Director — campaign metadata persisted on composer_projects.ad_meta ──
export type AdCutdownType = '15s' | '6s-hook';

export interface AdCampaignVariantScript {
  id: string;
  lines: string[];
}

export interface AdCampaignMeta {
  framework: string;
  tonality: string;
  format: string;
  goal: string;
  brandKitApplied: boolean;
  variantStrategy?: string;
  complianceAcknowledgedAt: string;
  renderAllVariants: boolean;
  cutdowns: AdCutdownType[];
  autoLogoEndcard: boolean;
  allVariantScripts?: AdCampaignVariantScript[];
}

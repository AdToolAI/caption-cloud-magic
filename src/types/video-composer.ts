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
  | 'ai-runway'
  | 'ai-pika'
  | 'ai-vidu'
  | 'ai-happyhorse'
  | 'ai-image'
  | 'stock'
  | 'stock-image'
  | 'upload';

export type StockMediaSource = 'pixabay' | 'pexels';

export type VideoMode = 'video' | 'image' | 'mixed';

export type ClipQuality = 'standard' | 'pro';

export type ClipStatus = 'pending' | 'generating' | 'ready' | 'failed';

// =============================================================================
// Phase 2 — Performance Layer
// =============================================================================
// Compact per-character direction for facial expression, gesture, gaze, and
// energy. Each axis is a small enum (Shot-Director-style); they all default
// to "unset" so empty performance never injects boilerplate into the prompt.

export type PerformanceExpression =
  | 'neutral'
  | 'warm-smile'
  | 'curious'
  | 'concerned'
  | 'confident'
  | 'surprised';

export type PerformanceGesture =
  | 'still'
  | 'hand-on-chin'
  | 'open-palms'
  | 'point'
  | 'cross-arms'
  | 'lean-in';

export type PerformanceGaze =
  | 'to-camera'
  | 'to-speaker'
  | 'away'
  | 'down-thinking';

/** 1 (subtle) … 5 (big). Stored as integer; emitted only when set. */
export type PerformanceEnergy = 1 | 2 | 3 | 4 | 5;

export interface ScenePerformance {
  expression?: PerformanceExpression;
  gesture?: PerformanceGesture;
  gaze?: PerformanceGaze;
  energy?: PerformanceEnergy;
}


export type TransitionStyle = 'none' | 'fade' | 'crossfade' | 'wipe' | 'slide' | 'zoom';

/**
 * Phase 4 — Artlist-style minimal transition palette.
 * The composer UI only exposes these two by default ("hard cut" + "soft morph").
 * The wider TransitionStyle union remains valid for power-user / legacy data.
 */
export const DEFAULT_COMPOSER_TRANSITIONS: TransitionStyle[] = ['none', 'crossfade'];
export const DEFAULT_SCENE_TRANSITION: TransitionStyle = 'crossfade';

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
  /**
   * If linked from the Avatar / Brand Character Library, this is the source id.
   * When present, the composer uses the portrait as i2v anchor frame and the
   * Gemini-generated identity-card prompt for far stronger face consistency.
   */
  brandCharacterId?: string;
  /** Hedra-optimised portrait or original reference image — used as i2v anchor. */
  referenceImageUrl?: string;
  /** Pre-built identity-card prompt fragment from the Brand Character. */
  identityCardPrompt?: string;
  /**
   * How often this character should appear in the storyboard.
   * - `cameo`   → 1–2 scenes (~20%) — short appearance only
   * - `balanced` → 40–60% (default — current behaviour)
   * - `lead`    → 80–100% — present in nearly every scene
   */
  appearanceFrequency?: 'cameo' | 'balanced' | 'lead';
  /**
   * When true, the linked portrait is forced as the i2v first frame for every
   * scene where the character appears (very rigid, "photo-to-video" look).
   * Default false — the portrait then only acts as a look reference (description
   * anchor + signature items in the prompt) so the AI keeps the character
   * recognisable without locking the opening frame.
   */
  usePortraitAsFirstFrame?: boolean;
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
  /**
   * Optional saved outfit look (`avatar_outfit_looks.id`) for this scene.
   * When set, the anchor compositor uses the outfit cover image instead of the
   * avatar's default portrait, and the identity-card prompt appends
   * `Wearing: <outfit name>`. When null/undefined → default portrait.
   */
  outfitLookId?: string | null;
  /**
   * Manual per-character Action override (user-typed, UI language).
   * When non-empty, this slot is LOCKED — `applyActionsToPrompt` pins it
   * into the `[CastActions]` marker block at the top of the provider
   * prompt with strict priority over Director-generated text. Empty →
   * fall back to whatever Scene-Director produced.
   */
  actionUser?: string;
  /** Auto-translated English mirror of `actionUser`. Cached server-side. */
  actionEn?: string;
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
  /**
   * Manual override of script-speaker labels → briefed character IDs.
   * Only used in LITERAL mode (when `productDescription` contains a script
   * with `NAME:` markers). Populated by the ScriptSpeakerMapper UI and
   * consumed by `buildBriefingText` to emit an authoritative Speaker Map
   * block for the deep-parser. Labels absent from the map fall back to the
   * server's fuzzy name-match.
   */
  speakerMap?: Record<string, string>;
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
  /** Optional shot-strategy hint for character continuity (primary cast slot — kept for backwards-compat). */
  characterShot?: CharacterShot;
  /**
   * Multi-character cast for this scene (max 4). When >1, the anchor compositor
   * (Nano Banana 2 / Vidu Q2) places ALL of them in the first frame.
   * `characterShot` is treated as the primary (= characterShots[0]) for older
   * pipeline code paths; new code should prefer `characterShots`.
   */
  characterShots?: CharacterShot[];
  /**
   * Character IDs the user explicitly removed from the cast of this scene.
   * The prompt→cast auto-sync (`syncCastFromPrompt`) MUST skip these so a
   * removed character does not silently reappear just because their name
   * still occurs in the scene prompt. Cleared when the storyboard regenerates
   * the scene end-to-end (new prompt + new cast from the LLM).
   */
  dismissedCharacterIds?: string[];
  /**
   * Per-scene dialog screenplay (one block per line, "NAME: text").
   * When set, the SceneDialogStudio generates HeyGen lip-sync clips per
   * speaker and auto-spawns sub-scenes for shot-reverse-shot.
   */
  dialogScript?: string;
  /** Canonical ID-referenced dialog turns; names in dialogScript are display-only. */
  dialogTurns?: Array<{
    turnId?: string;
    characterId: string;
    displayName?: string;
    text: string;
    mood?: string;
    delivery?: string;
    order?: number;
  }>;
  /**
   * Map of characterId → voice config.
   *  - Legacy: plain string = ElevenLabs voiceId
   *  - New:    { engine, voiceId, voiceName?, provider? }
   * Both formats are accepted at runtime via `resolveDialogVoice()`.
   */
  dialogVoices?: Record<string, string | DialogVoiceCfg>;
  /**
   * Local apply-time guard: character IDs that have spoken turns and therefore
   * must be present in `dialogVoices`. Not persisted as its own DB column.
   */
  requiredDialogSpeakerIds?: string[];
  /**
   * Take-System A/B/C — per-line voiceover takes (Phase B).
   *
   * Map of `lineKey -> DialogTakeBundle`, where `lineKey` is built via
   * `dialogLineKey(index, text)` so that re-ordering or editing a line
   * naturally invalidates its takes.
   *
   * Up to 3 takes per line. The bundle's `active` field points to the
   * take whose `audioUrl` should be used when rendering this scene.
   * When no active take exists, SceneDialogStudio falls back to live
   * TTS synthesis just like before Phase B.
   *
   * Persisted as `composer_scenes.dialog_takes` (JSONB).
   */
  dialogTakes?: Record<string, DialogTakeBundle>;
  /**
   * Render-Engine override. `auto` (default) lets `recommendEngineForScene()`
   * decide. `heygen` forces HeyGen Photo-Avatar lip-sync. `broll` forces the
   * classic Hailuo/etc. clip without lip-sync. `sync-polish` runs Hailuo +
   * Sync.so polish pass after generation. Persisted as `engine_override`.
   */
  engineOverride?: 'auto' | 'broll' | 'sync-polish' | 'cinematic-sync' | 'sync-segments' | 'native-dialogue';
  /**
   * Master switch for dialog & lip-sync UI in the composer.
   * When true: script editor + speaker picker are shown, model picker
   * is filtered to native-dialogue-capable models only (HappyHorse / Kling 3 / Veo 3.1).
   * When false: B-roll mode — all 11 models available, no script UI.
   * Persisted as `dialog_mode`.
   */
  dialogMode?: boolean;
  /**
   * Override: when true, send the character portrait directly as i2v first-frame
   * instead of composing a scene-aware anchor. Use only when the user explicitly
   * wants a face-locked opening (e.g. tight close-up).
   */
  forcePortraitAsFirstFrame?: boolean;
  /**
   * Stage A — World Assets as Visual References.
   * When true, prepareSceneAnchor will NOT forward location/building/prop
   * reference images to compose-scene-anchor (Nano Banana 2). Use when a
   * generic scene is desired and the saved World assets would over-constrain
   * the composition. Default false (always-on world refs).
   */
  ignoreWorldRefs?: boolean;
  clipUrl?: string;
  clipStatus: ClipStatus;
  /**
   * Seconds to skip at the start of clipUrl playback.
   * Hides the frozen reference-image opening frame that i2v providers
   * (Hailuo, Kling, Wan, Seedance, Luma, Veo, Sora) produce in the first
   * 3-12 frames. Default 0 for stock / upload / ai-image.
   */
  clipLeadInTrimSeconds?: number;
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
  /**
   * Action-First Cinematic Pipeline (June 2026).
   *
   * Describes what the character physically does during the shot and what
   * happens around them. Set by Scene-Director or manually by the user.
   * Routed into the i2v prompt with HIGHER priority than cast/dialog so
   * Hailuo/Kling render real action (driving, walking, gesturing) instead
   * of collapsing the shot into a static "talking-head bust".
   *
   * `motionIntensity` also informs `recommendEngineForScene`: anything
   * ≥ `subtle` with dialog routes to `cinematic-sync` (Hailuo plate +
   * Sync.so polish) instead of HeyGen Photo-Avatar.
   *
   * Persisted as `composer_scenes.action_beat` (JSONB).
   */
  actionBeat?: {
    /** What the character physically does. English. */
    characterAction?: string;
    /** What happens around the character (env, weather, light, props). English. */
    environmentMotion?: string;
    /** Drives the Engine Router. `static` = direct-address bust. */
    motionIntensity?: 'static' | 'subtle' | 'moderate' | 'high';
  };
  /**
   * Realism style preset (`cinematic-spot` | `documentary` | `lifestyle-hero`).
   * Primes Scene-Director system context, Shot-Director defaults, color
   * grade, and Sync.so quality tier in one click. Persisted as
   * `composer_scenes.realism_preset`.
   */
  realismPreset?: 'cinematic-spot' | 'documentary' | 'lifestyle-hero';

  /**
   * Manual Scene-Action override (user-typed, UI language). When non-empty,
   * `applyActionsToPrompt` pins it into the `[SceneAction]` marker block at
   * the top of the provider prompt, overriding what the Scene-Director (or
   * Auto-Director) produced. Empty → director output wins.
   */
  sceneActionUser?: string;
  /** Auto-translated English mirror of `sceneActionUser`. Cached server-side. */
  sceneActionEn?: string;

  /**
   * Phase 2 — per-character Performance Layer (Mimik / Gestik / Blick / Energy).
   * Optional; emitted as a compact `[4 PERFORMANCE]` block between SHOT and
   * DIALOG only when at least one field is set. Never read by the lip-sync
   * pipeline (Sync.so / HeyGen / compose-dialog-segments work off `audioPlan`).
   * Keyed by `characterId` so reordering cast does not lose direction.
   */
  performance?: Record<string, ScenePerformance>;



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
  /**
   * UUID FK to `motion_studio_style_presets.id` — set by the manual
   * StylePresetPicker in the composer. MUST be a valid UUID or undefined.
   */
  appliedStylePresetId?: string;
  /**
   * Slug of a clientside Cinematic Style Preset (see
   * `src/config/cinematicStylePresets.ts`, e.g. 'commercial-glossy').
   * Set by the Ad Director when it auto-builds scenes. NOT a UUID.
   * Persisted as `composer_scenes.cinematic_preset_slug` (TEXT).
   */
  cinematicPresetSlug?: string;
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
  /**
   * Phase C.1 runtime-only annotations from `propagateDialogLock`. Not
   * persisted; the snake_case persistence mapper ignores them.
   *  - 'self'      → this scene owns its lockReferenceUrl
   *  - 'inherited' → lock came from an earlier same-cast dialog scene
   *  - null        → no lock active
   */
  lockSource?: 'self' | 'inherited' | null;
  lockSourceSceneIndex?: number | null;
  /**
   * Phase C.2 — Force-Own override. Transient, not persisted. When true,
   * `propagateDialogLock` skips inheritance for this scene so the user can
   * break out of a same-cast lock group; the next render will then compose a
   * fresh anchor and persist its own `lockReferenceUrl` as a new self-lock.
   */
  noInheritLock?: boolean;
  /**
   * Two-Shot Hook pipeline stage. Set by `compose-twoshot-audio`,
   * `compose-video-clips` (master clip) and `compose-twoshot-lipsync`:
   *   audio → anchor → master_clip → lipsync_1 → lipsync_2 → continuity → done
   * Drives the multi-stage progress overlay in `SceneClipProgress`.
   */
  twoshotStage?:
    | 'audio'
    | 'anchor'
    | 'master_clip'
    | 'lipsync_1'
    | 'lipsync_2'
    | 'continuity'
    | 'done'
    | null;
  /**
   * Per-scene audio toggle for AI models that natively produce sound
   * (Sora 2 / Sora 2 Pro, Veo 3.1, Kling 3 Omni). When `false`:
   *   - Veo / Kling: `generate_audio` flag is set to false at generation.
   *   - Sora 2: clip is generated normally, then muted by the stitch step
   *     (`-an` ffmpeg flag) since Sora has no API-level audio toggle.
   * Defaults to `true` for backwards-compat with existing scenes.
   */
  withAudio?: boolean;
  /**
   * Lip-sync the scene's character video to the voiceover slice.
   * - Hailuo: voiceover is passed inline as `audio` (no extra cost).
   * - Other providers: post-hoc via `lip-sync-video` (sync-labs, ~8 credits).
   */
  lipSyncWithVoiceover?: boolean;

  /** Sync.so post-step status: when set, clipUrl is the lip-synced version. */
  lipSyncAppliedAt?: string | null;
  /** Original silent clip URL — kept so we can re-sync against a new VO. */
  lipSyncSourceClipUrl?: string | null;
  /** running | done | failed | null. */
  lipSyncStatus?: string | null;

  /**
   * Director Console — Audio Plan v1.
   *
   * First-class, deterministic per-speaker timing for this scene. Set by
   * `SceneDialogStudio` after TTS completes and treated as the **single
   * source of truth** by every downstream consumer (lip-sync, prompt
   * composer, audio playback). Once `dialogLockedAt` is set, the
   * derived `aiPrompt` is rebuilt from this plan — no other panel may
   * silently overwrite the timing block.
   */
  audioPlan?: AudioPlan;
  /** ISO timestamp set when `audioPlan` was finalized via TTS. */
  dialogLockedAt?: string | null;

  /**
   * Frame-First (Artlist-Style) Continuity:
   * When this scene was created via "Continue from frame", this points to the
   * source scene whose extracted still is used as `referenceImageUrl` here.
   * Persisted to `composer_scenes.continuity_source_scene_id`.
   */
  continuationSourceSceneId?: string | null;
  /**
   * Position (seconds) inside the source scene's clip where the user picked
   * the still. Lets us re-extract on demand. Maps to
   * `composer_scenes.frame_pick_seconds`.
   */
   framePickSeconds?: number | null;
  /**
   * Phase 5.1 — Fast-Preview Layer (LTX, ~3s low-res proxy).
   * `previewClipUrl` is a tiny 384px MP4 generated by `generate-fast-preview`
   * so the user can sanity-check composition while the HQ render still runs.
   * Maps to `composer_scenes.preview_clip_url` / `preview_status`.
   * `previewStatus`: idle = not requested, generating = LTX in-flight,
   * ready = playable proxy available, failed = LTX errored (button re-enables).
   */
  previewClipUrl?: string | null;
  previewStatus?: 'idle' | 'generating' | 'ready' | 'failed' | null;
  /**
   * Phase 5.3 — Reroll Pro: Seed-Lock + Variant-Grid.
   * `seed` is the master seed used (or to be used) for the HQ render.
   * `seedVariations` is up to 4 LTX Fast-Preview takes the user can pick from.
   * Maps to `composer_scenes.seed` (INTEGER) / `seed_variations` (JSONB).
   */
  seed?: number | null;
  seedVariations?: SceneSeedVariant[];
  /**
   * Wardrobe selection (Stage 19). Picked from `AvatarWardrobeSheet` themed
   * outfit grid in the Avatar mode. Persisted only on the client scene draft
   * for now — the image url is used as the avatar-stage display image and as
   * the optional reference image for downstream renders.
   */
  /**
   * Stage 21 — Hierarchical wardrobe theme packs.
   * `themePack` is a composite string `${theme}:${subPack}` (e.g. "historical:medieval",
   * "business:startup"). Plain theme strings ("historical") are accepted for
   * backwards-compat with Stage 19/20 data.
   */
  selectedOutfit?: {
    variantId: string;
    outfitId: string;
    label: string;
    imageUrl: string;
    themePack: string;
  };
}

/** One LTX Fast-Preview variant inside `composer_scenes.seed_variations`. */
export interface SceneSeedVariant {
  seed: number;
  status: 'generating' | 'ready' | 'failed';
  previewUrl?: string;
  predictionId?: string;
  createdAt: string;
}

export interface AudioPlanSpeaker {
  /** Cast character id (matches ComposerCharacter.id). */
  characterId: string;
  /** Display name as written in the script. */
  name: string;
  /** Cumulative start time within the scene, seconds. */
  startSec: number;
  /** Cumulative end time within the scene, seconds. */
  endSec: number;
  /** Spoken line, verbatim. */
  text: string;
  /** Voice engine identifier (elevenlabs | hume). */
  engine?: 'elevenlabs' | 'hume';
  /** Voice id passed to the TTS provider. */
  voiceId?: string;
  /** Public URL of the rendered TTS clip — also used as audio source-of-truth. */
  audioUrl?: string;
  /**
   * Per-turn Shot Director override (Phase 3.1). When set, the values win
   * over the scene-level `shotDirector` for this dialog turn — emitted as a
   * `[6 DIALOG SHOTS]` block by composeFinalPrompt, and treated as the
   * authoritative per-clip shot direction by the SRS / cinematic-sync
   * sub-scene spawner.
   *
   * Stored inside the existing `composer_scenes.audio_plan` JSONB column —
   * no schema migration. Empty = inherit scene defaults.
   */
  shotDirector?: import('@/config/shotDirector').ShotSelection;
}

export interface AudioPlanTwoshot {
  url?: string;
  speakers?: Array<Record<string, unknown>>;
  spokenSec?: number;
  totalSec?: number;
  /** When true, the canonical merged dialogue lives at `url` and the lipsync
   *  MP4 only embeds the LAST pass's voice. Preview/render must mute the
   *  embedded video audio and play `url` instead. */
  useExternalAudio?: boolean;
  embeddedAudio?: boolean;
  generatedAt?: string;
  lipsyncedAt?: string;
  passes?: number;
}

export interface AudioPlan {
  version: 1;
  /** Per-speaker timing (in script order). */
  speakers: AudioPlanSpeaker[];
  /** Total spoken duration including inter-speaker gaps, seconds. */
  totalSec: number;
  /** Inter-speaker gap actually used to compute `startSec`/`endSec`. */
  interSpeakerGapSec: number;
  /** UI / VO language at lock time. */
  language?: 'de' | 'en' | 'es';
  /** ISO timestamp when this plan was generated. */
  generatedAt: string;
  /** Two-Shot multi-speaker pipeline metadata. */
  twoshot?: AudioPlanTwoshot;
}

/**
 * Take-System A/B/C — one rendered voiceover take for a single dialog line.
 *
 * Stored inside `DialogTakeBundle.takes`. Each take is an immutable record of
 * the TTS render: same line + same voice on a different day produces a new
 * take, not an overwrite. Up to 3 takes per line (A/B/C).
 */
export interface DialogTake {
  id: string;
  audioUrl: string;
  durationSec: number;
  engine: 'elevenlabs' | 'hume';
  voiceId: string;
  voiceName?: string;
  /** Optional ElevenLabs custom-voice id when `isCustom` was true at render. */
  elevenlabsVoiceId?: string;
  isCustom?: boolean;
  provider?: string;
  /** ISO timestamp when this take was generated. */
  createdAt: string;
  /** Short label (e.g. "A", "B", "C"). Derived from index, persisted for clarity. */
  label?: string;
}

export interface DialogTakeBundle {
  /** Take id to use when rendering this line, or null = fall back to live TTS. */
  active: string | null;
  takes: DialogTake[];
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
  /** True when the script was auto-generated from briefing+scenes on first
   *  Voiceover-tab visit (used to avoid re-running and to allow safe re-fills). */
  autoScriptGenerated?: boolean;

  // ── Voice Studio 2.0: Multi-Speaker mode ─────────────────────────
  /** When true, the script is parsed as multi-speaker (Speaker: text) and
   *  rendered via `generate-multi-speaker-vo` instead of `generate-voiceover`. */
  multiSpeaker?: boolean;
  /** Per-speaker voice mapping: speakerId → engine + voice + tuning. */
  speakerMap?: Record<string, MultiSpeakerVoiceCfg>;
  /** Inter-speaker gap in milliseconds (default 180ms). */
  segmentGapMs?: number;
  /** Per-segment timings produced by the stitcher — used for timeline UI. */
  segmentTimings?: Array<{ speakerId: string; startSec: number; endSec: number }>;
  /** Per-segment overrides keyed by parsed segment index (Voice Studio 2.0 → Pro-Satz Cards). */
  segmentOverrides?: Record<number, { stability?: number; style?: number; speed?: number }>;
}

export interface MultiSpeakerVoiceCfg {
  engine: 'elevenlabs' | 'hume';
  /** ElevenLabs voice id, OR Hume voice NAME (e.g. "Ito"). */
  voiceId: string;
  /** Display label used in the SpeakerMappingBar. */
  voiceName?: string;
  // ElevenLabs tuning
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  // Hume tuning
  description?: string;
  provider?: 'HUME_AI' | 'CUSTOM_VOICE';
}

/**
 * Per-speaker voice config used by SceneDialogStudio (per-scene dialog editor).
 * Lighter than MultiSpeakerVoiceCfg — only what we need for HeyGen lip-sync.
 */
export interface DialogVoiceCfg {
  engine: 'elevenlabs' | 'hume';
  /** ElevenLabs voiceId, OR Hume voice NAME, OR custom-voice row id. */
  voiceId: string;
  voiceName?: string;
  /** ElevenLabs only — set when voiceId references a `custom_voices` row. */
  isCustom?: boolean;
  /** ElevenLabs only — real ElevenLabs id when isCustom=true. */
  elevenlabsVoiceId?: string;
  /** Hume only — defaults to HUME_AI. */
  provider?: 'HUME_AI' | 'CUSTOM_VOICE';
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
  transitionStyle: 'crossfade',
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
  'ai-runway':   { de: 'KI (Runway Gen-4 V2V)', en: 'AI (Runway Gen-4 V2V)' },
  'ai-pika':     { de: 'KI (Pika 2.2)', en: 'AI (Pika 2.2)' },
  'ai-vidu':     { de: 'KI (Vidu Q2 Multi-Ref)', en: 'AI (Vidu Q2 Multi-Ref)' },
  'ai-happyhorse': { de: 'KI (HappyHorse 1.0)', en: 'AI (HappyHorse 1.0)' },
  'ai-image':    { de: 'KI Bild (Gemini)', en: 'AI Image (Gemini)' },
  stock:         { de: 'Stock Video', en: 'Stock Video' },
  'stock-image': { de: 'Stock Bild', en: 'Stock Image' },
  upload:        { de: 'Eigener Upload', en: 'Own Upload' },
};

// Estimated costs per clip source × quality tier — EUR per second
// Normalized 14.07.2026 — exactly 3.00× Replicate cost margin across all video models.
// Keep aligned with `src/lib/cost/videoProviderMargins.ts` and `supabase/functions/_shared/clip-costs.ts`.
export const CLIP_SOURCE_COSTS: Record<ClipSource, Record<ClipQuality, number>> = {
  'ai-hailuo':   { standard: 0.14, pro: 0.23 },
  'ai-kling':    { standard: 0.18, pro: 0.30 },
  'ai-sora':     { standard: 0.60, pro: 1.35 },
  'ai-wan':      { standard: 0.12, pro: 0.21 },
  'ai-seedance': { standard: 0.09, pro: 0.18 }, // Mini = 0.06 (see registry)
  'ai-luma':     { standard: 0.21, pro: 0.36 },
  // Veo 3.1: standard = Lite 720p, pro = Pro 1080p
  'ai-veo':      { standard: 0.45, pro: 3.30 },
  'ai-runway':   { standard: 0.24, pro: 0.24 },
  'ai-pika':     { standard: 0.12, pro: 0.27 },
  // Vidu Q2: flat €0.66 per 5s clip → 0.13 €/s for parity
  'ai-vidu':     { standard: 0.13, pro: 0.13 },
  // HappyHorse 1.0: standard = 720p, pro = 1080p
  'ai-happyhorse': { standard: 0.42, pro: 0.84 },
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
  'ai-runway':   { standard: 'Aleph 720p',        pro: 'Aleph 720p' },
  'ai-pika':     { standard: 'Pika 720p',         pro: 'Pika 1080p' },
  'ai-vidu':     { standard: 'Vidu Q2 1080p',     pro: 'Vidu Q2 1080p' },
  'ai-happyhorse': { standard: 'HappyHorse 720p',  pro: 'HappyHorse 1080p' },
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
  /**
   * Stage A — Multi-Aspect-Bundling. When set, the spawner clones the master
   * into additional sibling projects with the briefing's aspectRatio swapped to
   * each ratio in this list. The master's own ratio is excluded from spawning.
   * No extra AI cost — children reuse the master's clip URLs verbatim and the
   * Remotion renderer crops/letterboxes per child briefing.aspectRatio.
   */
  aspectRatios?: AspectRatio[];
}

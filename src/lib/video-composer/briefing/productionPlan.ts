/**
 * ProductionPlan — Stage 2 evolution of the BriefingManifest.
 *
 * This is the user-facing, fully-validated "drehbuch" that sits between
 * the raw briefing text and the Composer storyboard. The plan is the
 * single source of truth: the storyboard is generated 1:1 from it, never
 * directly from the raw text again.
 *
 * Crucially, this schema is INTENTIONALLY DECOUPLED from the lipsync
 * pipeline DB tables (`dialog_shots`, `syncso_*`, `composer_scenes.dialog_*`).
 * Apply writes only the same Composer-UI fields the manual editor writes.
 */

import { z } from 'zod';
import {
  BriefingManifest,
  type TBriefingManifest,
  type TBriefingScene,
} from './manifestSchema';

// ── Resolution layer (Pass B fills these in) ─────────────────────────────────

export const ResolvedCast = z.object({
  /** Original mention key from the briefing, e.g. "@founder-avatar". */
  mentionKey: z.string(),
  /**
   * Library brand_character.id (base avatar UUID), null when no match.
   * MUST be a base brand_characters.id — never `outfit:` / `catalog:` /
   * `lib:` prefixed. The dedicated `outfitLookId` field below carries
   * outfit selection. This is the `CastRef` invariant enforced by the
   * apply/UI layers.
   */
  characterId: z.string().nullable(),
  /** Resolved display name (library or fallback to mentionKey). */
  characterName: z.string(),
  /** Library portrait if known. */
  referenceImageUrl: z.string().nullable().optional(),
  /**
   * Optional saved-outfit (`avatar_outfit_looks.id`) — fully decoupled
   * from `characterId`. UI shows two dropdowns; the anchor compositor
   * uses the outfit cover image when set.
   */
  outfitLookId: z.string().nullable().optional(),
  /**
   * Default-Outfit-Preset id (see `src/config/defaultOutfitPresets.ts`).
   * Prompt-only: never resolves to a library outfit and never sets
   * `outfitLookId`. When set alongside `outfitLookId`, the library look
   * wins. Applied by `useApplyProductionPlan` as an English wardrobe
   * hint appended to the scene prompt.
   */
  outfitPreset: z.string().nullable().optional(),
  /** Free-text outfit hint from the briefing (creative description, NOT a library ID). */
  outfit: z.string().optional(),
  /** ElevenLabs voice id this character should speak with, when known. */
  voiceId: z.string().nullable().optional(),
  voiceName: z.string().optional(),
  /** True if the resolver auto-picked this voice from the catalog (no default_voice_id on the character). UI shows a "⚡ AI" badge. */
  voiceAutoAssigned: z.boolean().optional(),
  /**
   * Explicit shot framing for THIS cast member in this scene. Overrides
   * the scene-default derived from `shotDirector.framing`. Useful for
   * 2-shot scenes where each character needs a different framing
   * (e.g. one in close-up, one in profile).
   */
  shotType: z.enum(['full', 'profile', 'back', 'detail', 'pov', 'silhouette']).optional(),
});


export const ResolvedLocation = z.object({
  mentionKey: z.string(),
  locationId: z.string().nullable(),
  locationName: z.string(),
  referenceImageUrl: z.string().nullable().optional(),
  /**
   * Free-text setting description (ENGLISH, cinematic). Populated when the
   * briefing describes a location that is NOT in the user's library — e.g.
   * "Split-screen: modern startup office / cozy home office at dawn".
   * When present AND locationId is null, `useApplyProductionPlan` appends
   * this as `Setting: …` to the i2v anchor prompt so the AI can render
   * arbitrary backdrops without forcing a library entry.
   */
  description: z.string().max(600).optional(),
});

// ── Plan-Scene (richer than BriefingScene) ───────────────────────────────────

export const PlanScene = z.object({
  index: z.number().int().min(1),
  label: z.string().max(120).optional(),
  /** Pain / Reveal / CTA / etc. */
  beat: z.string().max(80).optional(),

  durationSec: z.number().min(1).max(60).catch(5),

  /** Composer engineOverride — kept narrow to existing union. Fremdwerte fallen auf 'auto' zurück. */
  engine: z.enum([
    'auto', 'broll', 'sync-polish', 'cinematic-sync', 'sync-segments', 'native-dialogue',
  ]).default('auto').catch('auto'),

  /** Whether this scene needs lip-sync. Only sets `dialogMode` on NEW scenes; existing rows untouched. */
  lipSync: z.boolean().default(false),

  voiceover: z.object({
    text: z.string().default(''),
    timecodeStartSec: z.number().min(0).optional(),
    timecodeEndSec: z.number().min(0).optional(),
    delivery: z.string().max(280).optional(),
    speedMultiplier: z.number().min(0.7).max(1.3).optional(),
  }).optional(),

  cast: z.array(ResolvedCast).default([]),
  location: ResolvedLocation.optional(),

  shotDirector: z.object({
    framing: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    lighting: z.string().optional(),
    stylePreset: z.string().max(80).optional(),
  }).optional(),

  /** English anchor / i2v prompt hint. */
  anchorPromptEN: z.string().max(2000).optional(),

  performance: z.object({
    mimik: z.string().max(120).optional(),
    gestik: z.string().max(120).optional(),
    blick: z.string().max(120).optional(),
    energy: z.number().int().min(1).max(5).optional(),
  }).optional(),

  /**
   * v230 — Per-character performance map keyed by cast `mentionKey`
   * (with leading "@"). When present, `useApplyProductionPlan` writes
   * one ScenePerformance per cast member; otherwise it falls back to
   * fanning out the flat `performance` field to all speakers.
   */
  performances: z.record(z.string(), z.object({
    mimik: z.string().max(120).optional(),
    gestik: z.string().max(120).optional(),
    blick: z.string().max(120).optional(),
    energy: z.number().int().min(1).max(5).optional(),
  })).optional(),

  // ── Stage-2 schema extensions ────────────────────────────────────────────
  /** Stock-footage keywords for B-Roll search (Pexels/Pixabay). */
  brollHints: z.array(z.string().max(80)).max(12).optional(),
  /** Brand-Kit anchors for this scene (logo endcard, color override, etc.). */
  brandAnchor: z.object({
    logoEndcard: z.boolean().optional(),
    primaryColorOverride: z.string().max(16).optional(),
    accentColorOverride: z.string().max(16).optional(),
    fontOverride: z.string().max(80).optional(),
    note: z.string().max(240).optional(),
  }).optional(),
  /** Negative prompt scoped to this scene (in addition to the global one). */
  negativePromptScene: z.string().max(1000).optional(),
  /** Continuity hint, e.g. "same position as S01", "match wardrobe S02". */
  continuityHint: z.string().max(240).optional(),
  /** Music cue marker for this scene. */
  musicCue: z.object({
    energy: z.enum(['low', 'mid', 'high', 'drop', 'silent']).optional(),
    marker: z.string().max(80).optional(),
    note: z.string().max(240).optional(),
  }).optional(),
  /** Explicit per-turn dialog (used by cinematic-sync / native-dialogue). */
  dialogTurns: z.array(z.object({
    speakerMentionKey: z.string().max(80),
    /**
     * v217 — canonical Charakter-UUID des Sprechers. Server-gebunden im
     * `bindTurnSpeakerIds`-Pass. Client-Voice-Binding läuft AUSSCHLIESSLICH
     * über dieses Feld; `speakerMentionKey` bleibt nur als Diagnose-Slug.
     */
    speakerCharacterId: z.string().uuid().nullable().optional(),
    text: z.string().max(1000),
    mood: z.string().max(80).optional(),
    delivery: z.string().max(240).optional(),
  })).max(20).optional(),

  // ── Stage-3 plan→storyboard mapping completion ──────────────────────────
  /**
   * Transition into THIS scene (applied to `composer_scenes.transition_type`
   * + `transition_duration`). Restricted to the engine's `TransitionStyle`
   * union; fremde Werte fallen über `.catch` auf 'crossfade' zurück.
   */
  transition: z.object({
    type: z.enum(['none', 'fade', 'crossfade', 'wipe', 'slide', 'zoom']).default('crossfade').catch('crossfade'),
    durationSec: z.number().min(0).max(3).default(0.4),
  }).optional(),
  /**
   * Per-scene burnt-in text overlay (mapped to `composer_scenes.text_overlay`).
   * Independent of the global subtitle track.
   */
  textOverlay: z.object({
    text: z.string().max(280),
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
    animation: z.enum(['none', 'fade-in', 'scale-bounce', 'slide-left', 'slide-right', 'word-by-word', 'glow-pulse']).default('fade-in').catch('fade-in'),
    fontSizePx: z.number().int().min(16).max(160).optional(),
    color: z.string().max(16).optional(),
  }).optional(),
  /**
   * Scene-level creative tone (e.g. "cinematic", "documentary", "luxury").
   * Drives `realismPreset` selection at apply-time when set; otherwise the
   * briefing-level tone wins.
   */
  tone: z.string().max(80).optional(),
  /**
   * Deterministic master seed for the HQ render (mapped to
   * `composer_scenes.seed`). When set, downstream i2v providers receive it
   * so reroll / continuity is reproducible.
   */
  seed: z.number().int().min(0).max(2_147_483_647).optional(),

  /**
   * v202 — Canonical Cast & World asset references produced by the resolver.
   * Mirrors `composer_scenes.scene_assets`. When present, the applier writes
   * this straight into the DB so no JIT-backfill is needed on first
   * compose-video-clips dispatch. Empty array is valid (broll-only scene).
   */
  sceneAssets: z.array(z.object({
    type: z.enum(['character', 'location', 'building', 'prop', 'style']),
    id: z.string(),
    variantId: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
  })).optional(),
});

export const PlanVoice = z.object({
  // v243 — provider is informational; server may send other strings.
  // Keeping this as z.literal('elevenlabs') caused the whole plan to be
  // rejected client-side and drove the false "local-fallback" badge.
  provider: z.string().optional(),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  model: z.string().default('eleven_multilingual_v2'),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speakerBoost: z.boolean().optional(),
  speed: z.number().min(0.7).max(1.3).optional(),
  requestStitching: z.boolean().default(true),
}).partial().passthrough().optional();

export const PlanCaptions = z.object({
  enabled: z.boolean().default(true),
  source: z.enum(['auto-from-vo', 'manual']).default('auto-from-vo'),
  font: z.string().default('Inter Bold'),
  sizePx: z.number().int().min(16).max(160).default(64),
  color: z.string().default('#FFFFFF'),
  strokeColor: z.string().default('#000000'),
  strokePx: z.number().int().min(0).max(16).default(4),
  highlightColor: z.string().default('#F5C76A'),
  maxWordsPerCue: z.number().int().min(1).max(12).default(4),
  position: z.enum(['top', 'bottom', 'center']).default('bottom'),
  safeZonePct: z.number().int().min(0).max(40).default(18),
  burnIn: z.boolean().default(true),
  highlightWords: z.array(z.string()).default([]),
}).partial().optional();

export const PlanProject = z.object({
  name: z.string().max(160).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']).optional(),
  fps: z.number().int().optional(),
  totalDurationSec: z.number().min(1).max(600).optional(),
  platforms: z.array(z.string()).optional(),
});

export const PlanUnresolved = z.object({
  field: z.string(),
  reason: z.string(),
  suggestion: z.string().optional(),
  // v243 — tolerate unknown severities from newer server passes.
  severity: z.enum(['info', 'warn', 'error']).catch('warn').default('warn'),
}).passthrough();

/**
 * Per-scene AI-enrichment trail. Lists the dotted field paths that the
 * gap-fill pass added on top of what the user actually wrote in the
 * briefing (e.g. "shotDirector.lighting", "performance.gestik"). The UI
 * renders a ✨ badge next to these fields so creators see what is theirs
 * and what the AI invented.
 *
 * Lipsync invariant: this is metadata ONLY. It never reaches dialog_shots,
 * syncso_* or composer_scenes.dialog_*. The applier strips it before write.
 */
export const PlanSceneMeta = z.object({
  aiFilled: z.array(z.string()).default([]),
}).partial();

/**
 * Top-level enrichment metadata produced by Pass 0 (mode detection)
 * and Pass 0.5 (research). Cached server-side in
 * `briefing_research_cache`; surfaced to the UI as the "Pre-Apply
 * Summary" footer.
 */
export const PlanMeta = z.object({
  /** storytelling | brand | product | educational | other */
  mode: z.string().max(40).optional(),
  /** Confidence of the mode detection 0..1. */
  modeConfidence: z.number().min(0).max(1).optional(),
  /** Compact research bullets the gap-fill pass leaned on. */
  research: z.array(z.object({
    fact: z.string().max(400),
    source: z.string().max(120).optional(),
  })).max(20).optional(),
  /** Plan-level dotted paths that were AI-filled (not per-scene). */
  aiFilled: z.array(z.string()).max(40).optional(),
  /** Cache hit info — pure telemetry, safe to ignore in UI. */
  researchCacheHit: z.boolean().optional(),
  /**
   * Provenance of this plan:
   *  - 'ai'             — produced by briefing-deep-parse
   *  - 'ai-partial'     — AI plan, but some scenes/fields were dropped in Zod
   *  - 'local-fallback' — produced by useStoryboardTransition.buildLocalFallbackPlan
   *                       when the edge function timed out / failed
   */
  source: z.enum(['ai', 'ai-partial', 'local-fallback']).optional(),
  /**
   * v213 — Briefing Fidelity telemetry. Present when LITERAL mode kicked
   * in (the user shipped an explicit script). Surfaced as a chip in the
   * ProductionPlanSheet footer.
   */
  fidelity: z.object({
    mode: z.enum(['literal', 'auto']),
    repairedTexts: z.number().int().min(0),
    repairedSpeakers: z.number().int().min(0),
    scenesMatched: z.number().int().min(0),
    scenesInScript: z.number().int().min(0),
  }).partial({ repairedTexts: true, repairedSpeakers: true, scenesMatched: true, scenesInScript: true }).optional(),
  /**
   * T-1 — Debug envelope attached client-side from the briefing-deep-parse
   * response. Only rendered when the ProductionPlanSheet is opened with
   * `?debug=1` in the URL. Free-form on purpose: shape mirrors the server's
   * response envelope (models used, timings, ensemble/strict-cast stats).
   */
  debug: z.record(z.string(), z.any()).optional(),
}).partial().passthrough();

export const ProductionPlan = z.object({
  project: PlanProject.optional(),
  scenes: z.array(PlanScene.extend({ _meta: PlanSceneMeta.optional() }).passthrough()).default([]),
  voice: PlanVoice,
  captions: PlanCaptions,
  negativePrompt: z.string().max(4000).optional(),
  unresolved: z.array(PlanUnresolved).default([]),
  /** Briefing-Intelligence v2 metadata. Optional for backward compat. */
  _meta: PlanMeta.optional(),
}).passthrough();

export type TProductionPlan = z.infer<typeof ProductionPlan>;
export type TPlanScene = z.infer<typeof PlanScene>;
export type TResolvedCast = z.infer<typeof ResolvedCast>;
export type TResolvedLocation = z.infer<typeof ResolvedLocation>;

// Re-export manifest pieces (Pass A still emits them).
export { BriefingManifest };
export type { TBriefingManifest, TBriefingScene };

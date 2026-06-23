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
  /** Library brand_character.id, null when no match was found. */
  characterId: z.string().nullable(),
  /** Resolved display name (library or fallback to mentionKey). */
  characterName: z.string(),
  /** Library portrait if known. */
  referenceImageUrl: z.string().nullable().optional(),
  /** Optional outfit hint from the briefing. */
  outfit: z.string().optional(),
  /** ElevenLabs voice id this character should speak with, when known. */
  voiceId: z.string().nullable().optional(),
  voiceName: z.string().optional(),
});

export const ResolvedLocation = z.object({
  mentionKey: z.string(),
  locationId: z.string().nullable(),
  locationName: z.string(),
  referenceImageUrl: z.string().nullable().optional(),
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
    'auto', 'broll', 'heygen', 'sync-polish', 'cinematic-sync', 'sync-segments', 'native-dialogue',
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
    text: z.string().max(1000),
    mood: z.string().max(80).optional(),
    delivery: z.string().max(240).optional(),
  })).max(20).optional(),
});

export const PlanVoice = z.object({
  provider: z.literal('elevenlabs').default('elevenlabs'),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  model: z.string().default('eleven_multilingual_v2'),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speakerBoost: z.boolean().optional(),
  speed: z.number().min(0.7).max(1.3).optional(),
  requestStitching: z.boolean().default(true),
}).partial().optional();

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
  severity: z.enum(['info', 'warn', 'error']).default('warn'),
});

export const ProductionPlan = z.object({
  project: PlanProject.optional(),
  scenes: z.array(PlanScene).default([]),
  voice: PlanVoice,
  captions: PlanCaptions,
  negativePrompt: z.string().max(4000).optional(),
  unresolved: z.array(PlanUnresolved).default([]),
});

export type TProductionPlan = z.infer<typeof ProductionPlan>;
export type TPlanScene = z.infer<typeof PlanScene>;
export type TResolvedCast = z.infer<typeof ResolvedCast>;
export type TResolvedLocation = z.infer<typeof ResolvedLocation>;

// Re-export manifest pieces (Pass A still emits them).
export { BriefingManifest };
export type { TBriefingManifest, TBriefingScene };

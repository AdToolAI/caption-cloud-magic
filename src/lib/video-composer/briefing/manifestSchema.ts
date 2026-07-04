/**
 * Shared schema for the Briefing Manifest — the structured output of
 * `parse-briefing` that the BriefingApplySheet renders and
 * `useApplyBriefingManifest` writes into Composer state.
 *
 * Keep this file framework-agnostic: it must run in both the React client
 * AND inside Supabase Edge Functions (Deno). No imports outside zod.
 */

import { z } from 'zod';

// ── Enums (kept narrow so Gemini's tool-calling state machine stays small) ──

export const AspectRatioEnum = z.enum(['16:9', '9:16', '1:1', '4:5']);
export const EngineEnum = z.enum([
  'auto', 'broll', 'sync-polish', 'cinematic-sync', 'sync-segments', 'native-dialogue',
]);

export const FramingEnum = z.enum([
  'extreme-wide', 'wide', 'medium-wide', 'medium', 'medium-close-up', 'close-up', 'extreme-close-up',
]);
export const AngleEnum = z.enum([
  'eye-level', 'low-angle', 'high-angle', 'dutch-angle', 'over-the-shoulder', 'three-quarter', 'profile', 'frontal',
]);
export const MovementEnum = z.enum([
  'static', 'slow-push-in', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down',
  'tracking', 'handheld', 'orbital', 'crane-up', 'crane-down', 'lean-in',
]);
export const LightingEnum = z.enum([
  'natural', 'soft-window', 'hard-window', 'golden-hour', 'blue-hour', 'low-key', 'high-key',
  'rim', 'backlit', 'practical', 'studio-softbox', 'neon', 'overcast',
]);

// ── Sub-shapes ───────────────────────────────────────────────────────────────

export const BriefingScene = z.object({
  index: z.number().int().min(1),
  label: z.string().max(80).optional(),
  durationSec: z.number().min(1).max(60),
  engine: EngineEnum.default('auto'),

  voiceover: z.object({
    text: z.string().default(''),
    timecodeStartSec: z.number().min(0).optional(),
    timecodeEndSec: z.number().min(0).optional(),
    delivery: z.string().max(280).optional(),
    speedMultiplier: z.number().min(0.7).max(1.3).optional(),
  }).optional(),

  cast: z.array(z.object({
    mentionKey: z.string(),         // e.g. "@founder-avatar" or plain name
    outfit: z.string().optional(),
  })).default([]),

  location: z.object({
    mentionKey: z.string(),
  }).optional(),

  shotDirector: z.object({
    framing: FramingEnum.optional(),
    angle: AngleEnum.optional(),
    movement: MovementEnum.optional(),
    lighting: LightingEnum.optional(),
    stylePreset: z.string().max(80).optional(),
  }).optional(),

  /** English anchor / i2v prompt hint — used as the AI scene prompt. */
  anchorPromptEN: z.string().max(2000).optional(),

  performance: z.object({
    mimik: z.string().max(120).optional(),
    gestik: z.string().max(120).optional(),
    blick: z.string().max(120).optional(),
    energy: z.number().int().min(1).max(5).optional(),
  }).optional(),
});

export const BriefingVoice = z.object({
  provider: z.enum(['elevenlabs']).default('elevenlabs'),
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

export const BriefingCaptions = z.object({
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

export const BriefingProject = z.object({
  name: z.string().max(160).optional(),
  aspectRatio: AspectRatioEnum.optional(),
  fps: z.number().int().refine((v) => v === 24 || v === 25 || v === 30 || v === 60).optional(),
  totalDurationSec: z.number().min(1).max(600).optional(),
  platforms: z.array(z.string()).optional(),
});

export const BriefingUnresolved = z.object({
  field: z.string(),
  reason: z.string(),
  suggestion: z.string().optional(),
});

// ── Top-level manifest ───────────────────────────────────────────────────────

export const BriefingManifest = z.object({
  project: BriefingProject.optional(),
  scenes: z.array(BriefingScene).default([]),
  voice: BriefingVoice,
  captions: BriefingCaptions,
  negativePrompt: z.string().max(2000).optional(),
  unresolved: z.array(BriefingUnresolved).default([]),
});

export type TBriefingManifest = z.infer<typeof BriefingManifest>;
export type TBriefingScene = z.infer<typeof BriefingScene>;

// ── JSON Schema (for Gemini tool-calling, kept narrow + flat) ────────────────
// We hand-write this to keep enum lists short and avoid zod-to-json-schema
// inflating the constrained-decoding state machine.

export const BRIEFING_TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    project: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:5'] },
        fps: { type: 'integer', enum: [24, 25, 30, 60] },
        totalDurationSec: { type: 'number' },
        platforms: { type: 'array', items: { type: 'string' } },
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          label: { type: 'string' },
          durationSec: { type: 'number' },
          engine: {
            type: 'string',
            enum: ['auto', 'broll', 'heygen', 'sync-polish', 'cinematic-sync', 'sync-segments', 'native-dialogue'],
          },
          voiceover: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              timecodeStartSec: { type: 'number' },
              timecodeEndSec: { type: 'number' },
              delivery: { type: 'string' },
              speedMultiplier: { type: 'number' },
            },
          },
          cast: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mentionKey: { type: 'string' },
                outfit: { type: 'string' },
              },
              required: ['mentionKey'],
            },
          },
          location: {
            type: 'object',
            properties: { mentionKey: { type: 'string' } },
            required: ['mentionKey'],
          },
          shotDirector: {
            type: 'object',
            properties: {
              framing: { type: 'string', enum: FramingEnum.options },
              angle: { type: 'string', enum: AngleEnum.options },
              movement: { type: 'string', enum: MovementEnum.options },
              lighting: { type: 'string', enum: LightingEnum.options },
              stylePreset: { type: 'string' },
            },
          },
          anchorPromptEN: { type: 'string' },
          performance: {
            type: 'object',
            properties: {
              mimik: { type: 'string' },
              gestik: { type: 'string' },
              blick: { type: 'string' },
              energy: { type: 'integer' },
            },
          },
        },
        required: ['index', 'durationSec'],
      },
    },
    voice: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['elevenlabs'] },
        voiceId: { type: 'string' },
        voiceName: { type: 'string' },
        model: { type: 'string' },
        stability: { type: 'number' },
        similarityBoost: { type: 'number' },
        style: { type: 'number' },
        speakerBoost: { type: 'boolean' },
        speed: { type: 'number' },
        requestStitching: { type: 'boolean' },
      },
    },
    captions: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        source: { type: 'string', enum: ['auto-from-vo', 'manual'] },
        font: { type: 'string' },
        sizePx: { type: 'integer' },
        color: { type: 'string' },
        strokeColor: { type: 'string' },
        strokePx: { type: 'integer' },
        highlightColor: { type: 'string' },
        maxWordsPerCue: { type: 'integer' },
        position: { type: 'string', enum: ['top', 'bottom', 'center'] },
        safeZonePct: { type: 'integer' },
        burnIn: { type: 'boolean' },
        highlightWords: { type: 'array', items: { type: 'string' } },
      },
    },
    negativePrompt: { type: 'string' },
    unresolved: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          reason: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['field', 'reason'],
      },
    },
  },
  required: ['scenes'],
} as const;

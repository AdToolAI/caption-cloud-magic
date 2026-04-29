/**
 * AI Video Model Registry
 * --------------------------------------------------------------
 * Single source of truth for all video models exposed in the
 * unified AI Video Toolkit (/ai-video-studio).
 *
 * Adding a new model = one entry here. The Toolkit UI reads
 * capabilities, durations, resolutions, and pricing dynamically
 * and dispatches to the matching edge function.
 */

import type { Currency } from './pricing';
import {
  Film, Volume2, Zap, Wand2, Eye, Camera, Video, Sparkles, TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { KLING_VIDEO_MODELS } from './klingVideoCredits';
import { VEO_VIDEO_MODELS } from './veoVideoCredits';
import { LTX_VIDEO_MODELS } from './ltxVideoCredits';
import { WAN_VIDEO_MODELS } from './wanVideoCredits';
import { HAILUO_VIDEO_MODELS } from './hailuoVideoCredits';
import { LUMA_VIDEO_MODELS } from './lumaVideoCredits';
import { SEEDANCE_VIDEO_MODELS } from './seedanceVideoCredits';
import { GROK_VIDEO_MODELS } from './grokVideoCredits';
import { AI_VIDEO_MODELS as SORA_VIDEO_MODELS } from './aiVideoCredits';

export type ToolkitModelGroup = 'recommended' | 'fast' | 'premium' | 'audio';

export interface ToolkitModel {
  /** Stable id matching the value the edge function expects in `body.model`. */
  id: string;
  /** Display name shown in the dropdown. */
  name: string;
  /** Short provider label, e.g. "Kuaishou", "Google". */
  provider: string;
  /** Family used to slot into the provider tab/icon. */
  family: 'kling' | 'veo' | 'ltx' | 'wan' | 'hailuo' | 'luma' | 'seedance' | 'grok' | 'sora' | 'runway';
  /** Edge function name to invoke (without `supabase.functions.invoke()` prefix). */
  edgeFunction: string;
  /** Grouping in the dropdown. */
  group: ToolkitModelGroup;
  /** Icon for the dropdown item / hero. */
  icon: LucideIcon;
  capabilities: {
    t2v: boolean;
    i2v: boolean;
    /** Video-to-Video: accepts a reference clip as motion / style source. */
    v2v?: boolean;
    audio: boolean;
  };
  /** Allowed durations in seconds (used to render the slider/select). */
  durations: number[];
  /** Quality/resolution label for the badge. */
  resolution: string;
  /** Aspect ratios this model supports. */
  aspectRatios: string[];
  /** Cost per second per currency. */
  costPerSecond: Record<Currency, number>;
  /** Optional small badge shown next to the model name. */
  badge?: string;
  /** Set to 'sora2' to gate the model behind a Sora-2 access flag. */
  requiresAccess?: 'sora2';
  /** Short marketing line shown under the model name. */
  tagline?: string;
  /** Legacy URL that used to host the dedicated studio (used for redirect compat). */
  legacyRoute: string;
}

const sharedAspect = ['16:9', '9:16', '1:1'];

export const AI_VIDEO_TOOLKIT_MODELS: ToolkitModel[] = [
  /* ─────────── Recommended ─────────── */
  {
    id: 'kling-3-standard',
    name: KLING_VIDEO_MODELS['kling-3-standard'].name,
    provider: 'Kuaishou',
    family: 'kling',
    edgeFunction: 'generate-kling-video',
    group: 'recommended',
    icon: Film,
    capabilities: { t2v: true, i2v: true, v2v: true, audio: true },
    durations: [3, 5, 8, 10, 15],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-3-standard'].costPerSecond,
    badge: 'Empfohlen',
    tagline: 'Realistische Bewegungen · Native Audio',
    legacyRoute: '/kling-video-studio',
  },
  {
    id: 'kling-3-pro',
    name: KLING_VIDEO_MODELS['kling-3-pro'].name,
    provider: 'Kuaishou',
    family: 'kling',
    edgeFunction: 'generate-kling-video',
    group: 'premium',
    icon: Film,
    capabilities: { t2v: true, i2v: true, v2v: true, audio: true },
    durations: [3, 5, 8, 10, 15],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-3-pro'].costPerSecond,
    badge: 'Premium',
    tagline: '1080p · Premium-Qualität',
    legacyRoute: '/kling-video-studio',
  },

  /* ─────────── Audio-native ─────────── */
  {
    id: 'veo-3.1-lite-720p',
    name: VEO_VIDEO_MODELS['veo-3.1-lite-720p'].name,
    provider: 'Google',
    family: 'veo',
    edgeFunction: 'generate-veo-video',
    group: 'audio',
    icon: Volume2,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [4, 6, 8],
    resolution: '720p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: VEO_VIDEO_MODELS['veo-3.1-lite-720p'].costPerSecond,
    badge: 'Native Audio',
    tagline: 'Native Audio · Lite',
    legacyRoute: '/veo-video-studio',
  },
  {
    id: 'veo-3.1-fast',
    name: VEO_VIDEO_MODELS['veo-3.1-fast'].name,
    provider: 'Google',
    family: 'veo',
    edgeFunction: 'generate-veo-video',
    group: 'audio',
    icon: Volume2,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [4, 6, 8],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: VEO_VIDEO_MODELS['veo-3.1-fast'].costPerSecond,
    tagline: 'Schnell · 1080p · Audio',
    legacyRoute: '/veo-video-studio',
  },
  {
    id: 'veo-3.1-pro',
    name: VEO_VIDEO_MODELS['veo-3.1-pro'].name,
    provider: 'Google',
    family: 'veo',
    edgeFunction: 'generate-veo-video',
    group: 'premium',
    icon: Volume2,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [4, 6, 8],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: VEO_VIDEO_MODELS['veo-3.1-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Beste Audio + Video Qualität',
    legacyRoute: '/veo-video-studio',
  },
  {
    id: 'grok-imagine',
    name: GROK_VIDEO_MODELS['grok-imagine'].name,
    provider: 'xAI',
    family: 'grok',
    edgeFunction: 'generate-grok-video',
    group: 'audio',
    icon: TrendingUp,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [6, 12],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: GROK_VIDEO_MODELS['grok-imagine'].costPerSecond,
    badge: 'Trending',
    tagline: 'Viral · Native Audio',
    legacyRoute: '/grok-video-studio',
  },

  /* ─────────── Fast & cheap ─────────── */
  {
    id: 'ltx-standard',
    name: LTX_VIDEO_MODELS['ltx-standard'].name,
    provider: 'Lightricks',
    family: 'ltx',
    edgeFunction: 'generate-ltx-video',
    group: 'fast',
    icon: Zap,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [4, 6, 8],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: LTX_VIDEO_MODELS['ltx-standard'].costPerSecond,
    badge: 'Schnell & Günstig',
    tagline: 'Schnellster Generator',
    legacyRoute: '/ltx-video-studio',
  },
  {
    id: 'ltx-pro',
    name: LTX_VIDEO_MODELS['ltx-pro'].name,
    provider: 'Lightricks',
    family: 'ltx',
    edgeFunction: 'generate-ltx-video',
    group: 'fast',
    icon: Zap,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [4, 6, 8],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: LTX_VIDEO_MODELS['ltx-pro'].costPerSecond,
    tagline: '1080p · sehr günstig',
    legacyRoute: '/ltx-video-studio',
  },
  {
    id: 'wan-2-6-standard',
    name: WAN_VIDEO_MODELS['wan-2-6-standard'].name,
    provider: 'Wan Video',
    family: 'wan',
    edgeFunction: 'generate-wan-video',
    group: 'fast',
    icon: Wand2,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-6-standard'].costPerSecond,
    badge: 'Neu',
    tagline: 'Wan 2.6 · Budget-Champion',
    legacyRoute: '/wan-video-studio',
  },
  {
    id: 'wan-2-6-pro',
    name: WAN_VIDEO_MODELS['wan-2-6-pro'].name,
    provider: 'Wan Video',
    family: 'wan',
    edgeFunction: 'generate-wan-video',
    group: 'premium',
    icon: Wand2,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-6-pro'].costPerSecond,
    tagline: 'Wan 2.6 · 1080p',
    legacyRoute: '/wan-video-studio',
  },
  {
    id: 'wan-standard',
    name: WAN_VIDEO_MODELS['wan-standard'].name,
    provider: 'Wan Video',
    family: 'wan',
    edgeFunction: 'generate-wan-video',
    group: 'fast',
    icon: Wand2,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-standard'].costPerSecond,
    tagline: 'Wan 2.5 · stabile Klassik',
    legacyRoute: '/wan-video-studio',
  },

  /* ─────────── Realistic / cinematic ─────────── */
  {
    id: 'hailuo-standard',
    name: HAILUO_VIDEO_MODELS['hailuo-standard'].name,
    provider: 'MiniMax',
    family: 'hailuo',
    edgeFunction: 'generate-hailuo-video',
    group: 'recommended',
    icon: Eye,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [6, 10],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: HAILUO_VIDEO_MODELS['hailuo-standard'].costPerSecond,
    tagline: 'Realistische Gesichter & Bewegung',
    legacyRoute: '/hailuo-video-studio',
  },
  {
    id: 'hailuo-pro',
    name: HAILUO_VIDEO_MODELS['hailuo-pro'].name,
    provider: 'MiniMax',
    family: 'hailuo',
    edgeFunction: 'generate-hailuo-video',
    group: 'premium',
    icon: Eye,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [6, 10],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: HAILUO_VIDEO_MODELS['hailuo-pro'].costPerSecond,
    badge: 'Premium',
    tagline: '1080p · Realistic Pro',
    legacyRoute: '/hailuo-video-studio',
  },
  {
    id: 'luma-standard',
    name: LUMA_VIDEO_MODELS['luma-standard'].name,
    provider: 'Luma AI',
    family: 'luma',
    edgeFunction: 'generate-luma-video',
    group: 'recommended',
    icon: Camera,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 9],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-standard'].costPerSecond,
    tagline: 'Cinematic · Camera Concepts',
    legacyRoute: '/luma-video-studio',
  },
  {
    id: 'luma-pro',
    name: LUMA_VIDEO_MODELS['luma-pro'].name,
    provider: 'Luma AI',
    family: 'luma',
    edgeFunction: 'generate-luma-video',
    group: 'premium',
    icon: Camera,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 9],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Cinematic Pro · 1080p',
    legacyRoute: '/luma-video-studio',
  },
  {
    id: 'seedance-standard',
    name: SEEDANCE_VIDEO_MODELS['seedance-standard'].name,
    provider: 'ByteDance',
    family: 'seedance',
    edgeFunction: 'generate-seedance-video',
    group: 'recommended',
    icon: Video,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 8, 10, 12],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-standard'].costPerSecond,
    tagline: 'Dynamic Motion',
    legacyRoute: '/seedance-video-studio',
  },
  {
    id: 'seedance-pro',
    name: SEEDANCE_VIDEO_MODELS['seedance-pro'].name,
    provider: 'ByteDance',
    family: 'seedance',
    edgeFunction: 'generate-seedance-video',
    group: 'premium',
    icon: Video,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 8, 10, 12],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Dynamic Motion · 1080p',
    legacyRoute: '/seedance-video-studio',
  },

  /* ─────────── V2V Specialist (Runway) ─────────── */
  {
    id: 'runway-gen4-aleph',
    name: 'Runway Gen-4 Aleph',
    provider: 'Runway',
    family: 'runway',
    edgeFunction: 'generate-runway-video',
    group: 'premium',
    icon: Film,
    capabilities: { t2v: false, i2v: false, v2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    costPerSecond: { EUR: 0.15, USD: 0.15 },
    badge: 'V2V Specialist',
    tagline: 'Restyle & transform existing clips',
    legacyRoute: '/runway-video-studio',
  },

  /* ─────────── Premium / Sora ─────────── */
  {
    id: 'sora-2-standard',
    name: SORA_VIDEO_MODELS['sora-2-standard'].name,
    provider: 'OpenAI',
    family: 'sora',
    edgeFunction: 'generate-sora-chain',
    group: 'premium',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [4, 8, 12],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: SORA_VIDEO_MODELS['sora-2-standard'].costPerSecond,
    badge: 'Sora 2',
    requiresAccess: 'sora2',
    tagline: 'Cinematic Storytelling',
    legacyRoute: '/sora-video-studio',
  },
  {
    id: 'sora-2-pro',
    name: SORA_VIDEO_MODELS['sora-2-pro'].name,
    provider: 'OpenAI',
    family: 'sora',
    edgeFunction: 'generate-sora-chain',
    group: 'premium',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [4, 8, 12],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: SORA_VIDEO_MODELS['sora-2-pro'].costPerSecond,
    badge: 'Sora 2 Pro',
    requiresAccess: 'sora2',
    tagline: 'Top-Tier · Premium Pro',
    legacyRoute: '/sora-video-studio',
  },
];

export const TOOLKIT_GROUP_LABELS: Record<ToolkitModelGroup, { de: string; en: string; es: string }> = {
  recommended: { de: '⭐ Empfohlen', en: '⭐ Recommended', es: '⭐ Recomendado' },
  audio:       { de: '🎵 Mit Native Audio', en: '🎵 Native Audio', es: '🎵 Audio Nativo' },
  fast:        { de: '⚡ Schnell & Günstig', en: '⚡ Fast & Cheap', es: '⚡ Rápido y Barato' },
  premium:     { de: '💎 Premium', en: '💎 Premium', es: '💎 Premium' },
};

export function getToolkitModelById(id: string | null | undefined): ToolkitModel | undefined {
  if (!id) return undefined;
  return AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === id);
}

export function getDefaultToolkitModel(): ToolkitModel {
  return AI_VIDEO_TOOLKIT_MODELS[0];
}

/** Maps a legacy /<family>-video-studio route to a sensible default model id. */
export const LEGACY_ROUTE_TO_MODEL: Record<string, string> = {
  '/kling-video-studio':    'kling-3-standard',
  '/veo-video-studio':      'veo-3.1-fast',
  '/ltx-video-studio':      'ltx-standard',
  '/wan-video-studio':      'wan-2-6-standard',
  '/hailuo-video-studio':   'hailuo-standard',
  '/luma-video-studio':     'luma-standard',
  '/seedance-video-studio': 'seedance-standard',
  '/grok-video-studio':     'grok-imagine',
  '/sora-video-studio':     'sora-2-standard',
};

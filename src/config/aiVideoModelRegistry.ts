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
import { tx } from '@/lib/i18nText';

import { KLING_VIDEO_MODELS } from './klingVideoCredits';
import { VEO_VIDEO_MODELS } from './veoVideoCredits';
import { LTX_VIDEO_MODELS } from './ltxVideoCredits';
import { WAN_VIDEO_MODELS } from './wanVideoCredits';
import { HAILUO_VIDEO_MODELS } from './hailuoVideoCredits';
import { LUMA_VIDEO_MODELS } from './lumaVideoCredits';
import { SEEDANCE_VIDEO_MODELS } from './seedanceVideoCredits';
import { GROK_VIDEO_MODELS } from './grokVideoCredits';
import { AI_VIDEO_MODELS as SORA_VIDEO_MODELS } from './aiVideoCredits';
import { VIDU_VIDEO_MODELS } from './viduVideoCredits';
import { HAPPYHORSE_VIDEO_MODELS } from './happyhorseVideoCredits';

export type ToolkitModelGroup = 'recommended' | 'fast' | 'premium' | 'audio';

export interface ToolkitModel {
  /** Stable id matching the value the edge function expects in `body.model`. */
  id: string;
  /** Display name shown in the dropdown. */
  name: string;
  /** Short provider label, e.g. "Kuaishou", "Google". */
  provider: string;
  /** Family used to slot into the provider tab/icon. */
  family: 'kling' | 'veo' | 'ltx' | 'wan' | 'hailuo' | 'luma' | 'seedance' | 'grok' | 'sora' | 'runway' | 'pika' | 'vidu' | 'happyhorse';
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
    /** Multi-Reference: accepts 1–N reference images blended into one scene. */
    multiRef?: boolean;
    /** Max number of reference images supported when multiRef is true. */
    maxReferences?: number;
    /**
     * True when the model CANNOT generate without at least one reference image
     * (Vidu Reference2V). Models that also support plain text-to-video leave
     * this false so references stay optional.
     */
    multiRefRequired?: boolean;
    /**
     * Native dialogue: model generates video + speech + lip-sync in a single
     * pass. Required for the Composer's Dialog/Lip-Sync mode (Artlist-style).
     * Set true only for models that produce in-frame synchronous mouth
     * articulation matched to the generated audio.
     */
    nativeDialogue?: boolean;
    /**
     * End-frame guidance: model accepts an `endImageUrl` WITHOUT requiring a
     * matching start image. Only Luma Ray 2 satisfies this — Kling requires
     * start+end together, Pika Pikaframes requires both frames.
     */
    endFrame?: boolean;
    /**
     * True identity/subject reference: model can use a reference image as
     * character/style anchor without forcing it into frame 0. Currently
     * Vidu Q2 (referenceImages[]) and Kling 3 Std/Pro (reference_images).
     */
    anchorOnly?: boolean;
    /**
     * True when reference images and a start/end frame are mutually exclusive
     * at the provider (Seedance 2.5 / ModelArk: first-frame, first+last-frame
     * and multi-reference are three separate, non-combinable input modes).
     */
    refExclusive?: boolean;
  };
  /** Allowed durations in seconds (used to render the slider/select). */
  durations: number[];
  /** Quality/resolution label for the badge (default / highest option). */
  resolution: string;
  /**
   * All output resolutions the provider really accepts for this model.
   * Only rendered as a selector when more than one entry exists; the first
   * entry is the default. Omit when the model has exactly one resolution.
   */
  resolutions?: string[];
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
  /** Operational status. Defaults to 'live' when omitted. */
  status?: 'live' | 'beta' | 'maintenance' | 'coming_soon';
  /** Optional human-readable reason shown in tooltip / disabled hint. */
  statusReason?: string;
}

const sharedAspect = ['16:9', '9:16', '1:1'];
/** Kling (all versions) exposes exactly these three ratios. */
const klingAspect = ['16:9', '9:16', '1:1'];
/** Wan 2.5/2.6 `size` enum only covers landscape + portrait — no square. */
const wanLegacyAspect = ['16:9', '9:16'];
/** Wan 2.7 `aspect_ratio` enum. */
const wan27Aspect = ['16:9', '9:16', '1:1', '4:3', '3:4'];
/** Seedance (Replicate) `aspect_ratio` enum. */
const seedanceAspect = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'];
/** Luma Ray 2 `aspect_ratio` enum. */
const lumaRay2Aspect = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'];
/** Luma Ray 3.2 `aspect_ratio` enum (no 9:21). */
const lumaRay32Aspect = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
/** LTX 2.3 (fast + pro) `aspect_ratio` enum. */
const ltxAspect = ['16:9', '9:16'];
/** xai/grok-imagine-video `aspect_ratio` enum (minus "auto"). */
const grokAspect = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'];

export const AI_VIDEO_TOOLKIT_MODELS: ToolkitModel[] = [
  /* ─────────── Kling family ─────────── */
  {
    id: 'kling-2.5-turbo',
    name: KLING_VIDEO_MODELS['kling-2.5-turbo'].name,
    provider: 'Kuaishou',
    family: 'kling',
    edgeFunction: 'generate-kling-video',
    group: 'recommended',
    icon: Film,
    // kwaivgi/kling-v2.5-turbo-pro: duration enum [5,10], no reference_images.
    capabilities: { t2v: true, i2v: true, v2v: false, audio: false, nativeDialogue: false, anchorOnly: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: klingAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-2.5-turbo'].costPerSecond,
    badge: 'Fast',
    tagline: 'Schneller Draft · Iteration',
    legacyRoute: '/kling-video-studio',
  },
  {
    id: 'kling-2.6',
    name: KLING_VIDEO_MODELS['kling-2.6'].name,
    provider: 'Kuaishou',
    family: 'kling',
    edgeFunction: 'generate-kling-video',
    group: 'recommended',
    icon: Film,
    // kwaivgi/kling-v2.6: duration enum [5,10], generate_audio, no start+end,
    // no reference_images, no reference_video.
    capabilities: { t2v: true, i2v: true, v2v: false, audio: true, nativeDialogue: false, anchorOnly: false },
    durations: [5, 10],
    resolution: '1080p',
    aspectRatios: klingAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-2.6'].costPerSecond,
    badge: 'Ambient Audio',
    tagline: 'Sweet Spot · Ambient-Audio',
    legacyRoute: '/kling-video-studio',
  },
  {
    id: 'kling-3',
    name: KLING_VIDEO_MODELS['kling-3'].name,
    provider: 'Kuaishou',
    family: 'kling',
    edgeFunction: 'generate-kling-video',
    group: 'recommended',
    icon: Film,
    // kwaivgi/kling-v3-video: duration 3-15, generate_audio, no dialog field
    // (native lip-sync is Omni-only), no reference_images, no reference_video.
    capabilities: { t2v: true, i2v: true, v2v: false, audio: true, nativeDialogue: false, anchorOnly: false },
    durations: [3, 5, 8, 10, 15],
    resolution: '1080p',
    aspectRatios: klingAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-3'].costPerSecond,
    badge: 'Empfohlen',
    tagline: 'Realistische Bewegungen · Native Audio',
    legacyRoute: '/kling-video-studio',
  },
  {
    id: 'kling-omni',
    name: KLING_VIDEO_MODELS['kling-omni'].name,
    provider: 'Kuaishou',
    family: 'kling',
    // Own edge function — native lip-sync bypasses Sync.so pipeline.
    edgeFunction: 'generate-kling-video',
    group: 'premium',
    icon: Film,
    // kwaivgi/kling-v3-omni-video: duration 3-15, generate_audio + dialog,
    // reference_images (max 7, max 4 with a reference_video) and reference_video.
    capabilities: { t2v: true, i2v: true, v2v: true, audio: true, nativeDialogue: true, anchorOnly: true, multiRef: true, maxReferences: 7 },
    durations: [3, 5, 8, 10, 15],
    resolution: '1080p',
    aspectRatios: klingAspect,
    costPerSecond: KLING_VIDEO_MODELS['kling-omni'].costPerSecond,
    badge: 'Lip-Sync EN',
    tagline: 'Native Lip-Sync EN · DE/ES silent-only',
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
    capabilities: { t2v: true, i2v: true, audio: true, nativeDialogue: true },
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
    capabilities: { t2v: true, i2v: true, audio: true, nativeDialogue: true },
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
    capabilities: { t2v: true, i2v: true, audio: true, nativeDialogue: true },
    durations: [4, 6, 8],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: VEO_VIDEO_MODELS['veo-3.1-pro'].costPerSecond,
    badge: 'Premium',
    tagline: tx({ de: 'Beste Audio + Video Qualität', en: 'Best audio + video quality', es: 'Mejor calidad de audio y vídeo' }),
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
    // xai/grok-imagine-video: duration 1-15, resolution 480p/720p (no 1080p),
    // aspect_ratio enum incl. 4:3/3:4/3:2/2:3, native audio, optional image.
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [5, 6, 10, 12, 15],
    resolution: '720p',
    resolutions: ['720p', '480p'],
    aspectRatios: grokAspect,
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
    // lightricks/ltx-2.3-fast: duration enum 6-20, 1080p+, 16:9/9:16, native audio.
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [6, 8, 10],
    resolution: '1080p',
    aspectRatios: ltxAspect,
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
    tagline: tx({ de: '1080p · sehr günstig', en: '1080p · very cheap', es: '1080p · muy barato' }),
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
    id: 'wan-2-7-standard',
    name: WAN_VIDEO_MODELS['wan-2-7-standard'].name,
    provider: 'Alibaba Wan',
    family: 'wan',
    edgeFunction: 'generate-wan-video',
    group: 'recommended',
    icon: Zap,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-7-standard'].costPerSecond,
    badge: 'Neu',
    tagline: '27B MoE · natives Audio',
    legacyRoute: '/wan-video-studio',
  },
  {
    id: 'wan-2-7-pro',
    name: WAN_VIDEO_MODELS['wan-2-7-pro'].name,
    provider: 'Alibaba Wan',
    family: 'wan',
    edgeFunction: 'generate-wan-video',
    group: 'premium',
    icon: Zap,
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [5, 10],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-7-pro'].costPerSecond,
    badge: 'Premium',
    tagline: '27B MoE · natives Audio · 1080p',
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
    resolution: '768p',
    // MiniMax Hailuo 02 has no aspect-ratio parameter — T2V always renders
    // 16:9, I2V inherits the ratio of the start image.
    aspectRatios: ['16:9'],
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
    // 1080p is capped at 6 s by MiniMax; 10 s only renders at 768p.
    durations: [6],
    resolution: '1080p',
    aspectRatios: ['16:9'],
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
    capabilities: { t2v: true, i2v: true, audio: false, endFrame: true },
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
    capabilities: { t2v: true, i2v: true, audio: false, endFrame: true },
    durations: [5, 9],
    resolution: '1080p',
    aspectRatios: sharedAspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Cinematic Pro · 1080p',
    legacyRoute: '/luma-video-studio',
  },
  {
    id: 'luma-ray32-5s',
    name: LUMA_VIDEO_MODELS['luma-ray32-5s'].name,
    provider: 'Luma AI',
    family: 'luma',
    edgeFunction: 'generate-luma-video',
    group: 'recommended',
    icon: Camera,
    capabilities: { t2v: true, i2v: true, audio: false, endFrame: true },
    durations: [5],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-ray32-5s'].costPerSecond,
    badge: 'Neu',
    tagline: 'Ray 3.2 · neueste Luma-Generation',
    legacyRoute: '/luma-video-studio',
  },
  {
    id: 'luma-ray32-10s',
    name: LUMA_VIDEO_MODELS['luma-ray32-10s'].name,
    provider: 'Luma AI',
    family: 'luma',
    edgeFunction: 'generate-luma-video',
    group: 'premium',
    icon: Camera,
    capabilities: { t2v: true, i2v: true, audio: false, endFrame: true },
    durations: [10],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-ray32-10s'].costPerSecond,
    badge: 'Neu · 10s',
    tagline: tx({ de: `Ray 3.2 ${tx({ de: 'Langclip', en: 'long clip', es: 'clip largo' })} · 10 ${tx({ de: 'Sekunden am Stück', en: 'seconds straight', es: 'segundos seguidos' })}`, en: `Ray 3.2 ${tx({ de: 'Langclip', en: 'long clip', es: 'clip largo' })} · 10 ${tx({ de: 'seconds straight', en: 'seconds straight', es: 'segundos seguidos' })}`, es: `Ray 3.2 ${tx({ de: 'Langclip', en: 'long clip', es: 'clip largo' })} · 10 ${tx({ de: 'Segundos seguidos', en: 'segundos seguidos', es: 'segundos seguidos' })}` }),
    legacyRoute: '/luma-video-studio',
  },
  {
    id: 'seedance-mini',
    name: SEEDANCE_VIDEO_MODELS['seedance-mini'].name,
    provider: 'ByteDance',
    family: 'seedance',
    edgeFunction: 'generate-seedance-video',
    group: 'fast',
    icon: Video,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [3, 5, 8, 10, 12, 15],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-mini'].costPerSecond,
    badge: 'Draft',
    tagline: 'Seedance 1 Lite · günstigster Draft-Renderer',
    legacyRoute: '/seedance-video-studio',
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
    durations: [3, 5, 8, 10, 12, 15],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-standard'].costPerSecond,
    badge: 'Neu',
    tagline: 'Seedance 2.0 Fast · dynamische Motion',
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
    durations: [3, 5, 8, 10, 12, 15],
    resolution: '720p',
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Seedance 2.0 Flagship · beste Motion-Kohärenz',
    legacyRoute: '/seedance-video-studio',
  },
  {
    id: 'seedance-2-5',
    name: SEEDANCE_VIDEO_MODELS['seedance-2-5'].name,
    provider: 'ByteDance',
    family: 'seedance',
    edgeFunction: 'generate-seedance25-video',
    group: 'premium',
    icon: Video,
    // ModelArk contract: 4-30 s, 480p/720p, first-frame OR first+last-frame OR
    // multi-reference (mutually exclusive). No standalone end frame, no audio.
    capabilities: { t2v: true, i2v: true, audio: false, multiRef: true, maxReferences: 7, refExclusive: true },
    durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
    resolution: '720p',
    resolutions: ['720p', '480p'],
    aspectRatios: sharedAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-2-5'].costPerSecond,
    badge: 'Neu',
    tagline: tx({ de: `Seedance 2.5 · ${tx({ de: 'bis 30 s pro Szene', en: 'up to 30s per scene', es: 'hasta 30 s por escena' })} · 720p`, en: `Seedance 2.5 · ${tx({ de: 'up to 30 s per scene', en: 'up to 30s per scene', es: 'hasta 30 s por escena' })} · 720p`, es: `Seedance 2.5 · ${tx({ de: 'hasta 30 s por escena', en: 'hasta 30 s por escena', es: 'hasta 30 s por escena' })} · 720p` }),
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
    costPerSecond: { EUR: 0.24, USD: 0.24 },
    badge: 'V2V Specialist',
    tagline: 'Restyle & transform existing clips',
    legacyRoute: '/runway-video-studio',
  },

  /* ─────────── Pika 2.2 ─────────── */
  {
    id: 'pika-2-2-standard',
    name: 'Pika 2.2',
    provider: 'Pika Labs',
    family: 'pika',
    edgeFunction: 'generate-pika-video',
    group: 'recommended',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    costPerSecond: { EUR: 0.12, USD: 0.12 },
    badge: 'Wartung',
    tagline: 'Smooth motion · Start+End frame morphing',
    legacyRoute: '/pika-video-studio',
    status: 'maintenance',
    statusReason: tx({ de: 'Pika ist temporär offline (Provider-Wartung). Wir aktivieren das Modell wieder, sobald die Pika Labs API stabil läuft.', en: 'Pika is temporarily offline (provider maintenance). We will re-enable the model as soon as the Pika Labs API is stable again.', es: 'Pika está temporalmente fuera de línea (mantenimiento del proveedor). Reactivaremos el modelo en cuanto la API de Pika Labs vuelva a ser estable.' }),
  },
  {
    id: 'pika-2-2-pro',
    name: 'Pika 2.2 Pro',
    provider: 'Pika Labs',
    family: 'pika',
    edgeFunction: 'generate-pika-video',
    group: 'premium',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    costPerSecond: { EUR: 0.27, USD: 0.27 },
    badge: 'Wartung',
    tagline: 'High-fidelity Pika · 1080p',
    legacyRoute: '/pika-video-studio',
    status: 'maintenance',
    statusReason: tx({ de: 'Pika ist temporär offline (Provider-Wartung). Wir aktivieren das Modell wieder, sobald die Pika Labs API stabil läuft.', en: 'Pika is temporarily offline (provider maintenance). We will re-enable the model as soon as the Pika Labs API is stable again.', es: 'Pika está temporalmente fuera de línea (mantenimiento del proveedor). Reactivaremos el modelo en cuanto la API de Pika Labs vuelva a ser estable.' }),
  },

  /* ─────────── Vidu (IDs q2-*, läuft real auf Q3) ─────────── */
  {
    id: 'vidu-q2-reference',
    name: VIDU_VIDEO_MODELS['vidu-q2-reference'].name,
    provider: 'Shengshu AI',
    family: 'vidu',
    edgeFunction: 'generate-vidu-video',
    group: 'recommended',
    icon: Eye,
    capabilities: { t2v: false, i2v: false, audio: false, multiRef: true, maxReferences: 7, multiRefRequired: true, anchorOnly: true },
    durations: [5],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    // Flat €0.66 / 5s ≈ €0.13/s for UI parity (real billing is flat per generation)
    costPerSecond: { EUR: 0.13, USD: 0.13 },
    badge: 'Multi-Ref',
    tagline: tx({ de: 'Bis zu 7 Refs: Charakter + Produkt + Location in einer Szene', en: 'Up to 7 refs: character + product + location in one scene', es: 'Hasta 7 referencias: personaje + producto + ubicación en una escena' }),
    legacyRoute: '/vidu-studio',
  },
  {
    id: 'vidu-q2-i2v',
    name: VIDU_VIDEO_MODELS['vidu-q2-i2v'].name,
    provider: 'Shengshu AI',
    family: 'vidu',
    edgeFunction: 'generate-vidu-video',
    group: 'fast',
    icon: Eye,
    capabilities: { t2v: false, i2v: true, audio: false },
    durations: [5],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    costPerSecond: { EUR: 0.12, USD: 0.12 },
    badge: 'I2V',
    tagline: tx({ de: 'Animiert ein Standbild zu einem 5s-Clip', en: 'Animates a still image into a 5s clip', es: 'Anima una imagen fija en un clip de 5s' }),
    legacyRoute: '/vidu-studio',
  },
  {
    id: 'vidu-q2-t2v',
    name: VIDU_VIDEO_MODELS['vidu-q2-t2v'].name,
    provider: 'Shengshu AI',
    family: 'vidu',
    edgeFunction: 'generate-vidu-video',
    group: 'fast',
    icon: Eye,
    capabilities: { t2v: true, i2v: false, audio: false },
    durations: [5],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1'],
    costPerSecond: { EUR: 0.12, USD: 0.12 },
    badge: 'T2V',
    tagline: tx({ de: '5s Clip aus reinem Prompt', en: '5s clip from pure prompt', es: 'Clip de 5 segundos de Pure Prompt' }),
    legacyRoute: '/vidu-studio',
  },

  /* ─────────── HappyHorse 1.0 (Alibaba) ─────────── */
  {
    id: 'happyhorse-standard',
    name: HAPPYHORSE_VIDEO_MODELS['happyhorse-standard'].name,
    provider: 'Alibaba',
    family: 'happyhorse',
    edgeFunction: 'generate-happyhorse-video',
    group: 'recommended',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false, nativeDialogue: true },
    durations: [3, 5, 8, 10, 12, 15],
    resolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    costPerSecond: HAPPYHORSE_VIDEO_MODELS['happyhorse-standard'].costPerSecond,
    badge: 'Neu · Alibaba',
    tagline: 'Multi-Shot Consistency · Dialog-Driven',
    legacyRoute: '/happyhorse-video-studio',
  },
  {
    id: 'happyhorse-pro',
    name: HAPPYHORSE_VIDEO_MODELS['happyhorse-pro'].name,
    provider: 'Alibaba',
    family: 'happyhorse',
    edgeFunction: 'generate-happyhorse-video',
    group: 'premium',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false, nativeDialogue: true },
    durations: [3, 5, 8, 10, 12, 15],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    costPerSecond: HAPPYHORSE_VIDEO_MODELS['happyhorse-pro'].costPerSecond,
    badge: 'Premium · 1080p',
    tagline: 'Multi-Shot Consistency · 1080p',
    legacyRoute: '/happyhorse-video-studio',
  },

  /* Sora 2 entfernt — OpenAI sunset 2026, Routen migrieren auf Veo 3.1 / Kling 3 Pro. */
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
  '/kling-video-studio':    'kling-3',
  '/veo-video-studio':      'veo-3.1-fast',
  '/ltx-video-studio':      'ltx-standard',
  '/wan-video-studio':      'wan-2-6-standard',
  '/hailuo-video-studio':   'hailuo-standard',
  '/luma-video-studio':     'luma-standard',
  '/seedance-video-studio': 'seedance-standard',
  '/grok-video-studio':     'grok-imagine',
  '/sora-video-studio':     'sora-2-standard',
  '/vidu-studio':           'vidu-q2-reference',
  '/happyhorse-video-studio': 'happyhorse-standard',
};

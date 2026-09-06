import { tx } from '@/lib/i18nText';
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
import { usdFromEur } from '@/lib/cost/fx';
import {
  Film, Volume2, Zap, Wand2, Eye, Camera, Video, Sparkles, TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { VisualInputProfile } from '@/lib/composer/visualInputs/types';


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
    /**
     * Reference audio clips (ModelArk `reference_audio`): the model can take
     * audio as a driving reference for the generated scene.
     */
    refAudio?: boolean;
    /** Max number of reference videos supported when v2v is true. */
    maxReferenceVideos?: number;
    /** Max number of reference audio clips supported when refAudio is true. */
    maxReferenceAudios?: number;
    /**
     * Provider constraints under which reference images are accepted at all.
     * Veo 3.1 for example only honours `reference_images` at 16:9 and 8 s.
     * The UI hides the reference uploader while the constraint is unmet.
     */
    refRequires?: { aspectRatios?: string[]; durations?: number[] };
    /**
     * Provider-side smart duration (`duration: -1`): the model picks the clip
     * length itself. Billed at the maximum duration and corrected downwards
     * once the provider reports the real length.
     */
    smartDuration?: boolean;
  };

  /**
   * Visual-Continuity-System — explicit slot topology for this model.
   * Optional: when omitted, `deriveVisualInputProfile()` builds it from
   * `capabilities`. Set it only where the provider contract cannot be
   * expressed by the flags alone (e.g. Seedance 2.5's exclusive input modes).
   */
  visualInputs?: VisualInputProfile;



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
/** Pika 2.2 (fal.ai `fal-ai/pika/v2.2/*`) `aspect_ratio` enum. */
const pikaAspect = ['16:9', '9:16', '1:1', '4:5', '5:4', '3:2', '2:3'];
/** Vidu Q3 (Replicate `vidu/q3-*`) `aspect_ratio` enum. */
const viduAspect = ['16:9', '9:16', '1:1', '4:3', '3:4'];
/** Vidu Q3 duration range 1–16 s — exposed as a sensible selection. */
const viduDurations = [4, 5, 6, 8, 10, 12, 16];
/** HappyHorse 1.0 (Replicate) `aspect_ratio` enum. */
const happyhorseAspect = ['16:9', '9:16', '1:1', '4:3', '3:4'];
/** HappyHorse 1.0 `duration` enum: every integer from 3 to 15. */
const happyhorseDurations = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const AI_VIDEO_TOOLKIT_MODELS_RAW: ToolkitModel[] = [
  /* ─────────── Seedance 2.5 (top model) ─────────── */
  {
    id: 'seedance-2-5',
    name: SEEDANCE_VIDEO_MODELS['seedance-2-5'].name,
    provider: 'ByteDance',
    family: 'seedance',
    edgeFunction: 'generate-seedance25-video',
    group: 'premium',
    icon: Video,
    // ModelArk contract (docs verified 10.08.2026): 4-30 s or smart duration
    // (-1), 480p/720p, first-frame OR first+last-frame OR multi-reference
    // (mutually exclusive), up to 30 reference images + 10 reference videos +
    // 10 reference audio clips, native audio via `generate_audio`.
    capabilities: {
      t2v: true,
      i2v: true,
      v2v: true,
      audio: true,
      multiRef: true,
      maxReferences: 30,
      maxReferenceVideos: 10,
      maxReferenceAudios: 10,
      refAudio: true,
      refExclusive: true,
      smartDuration: true,
    },
    /**
     * ModelArk accepts exactly ONE input mode per task. First-frame,
     * first+last-frame and multi-reference share a single exclusive slot, so
     * "seamless transition" and "identity references" genuinely compete here.
     * Reference videos live inside the reference budget — that is why
     * `clip-reference` is the continuity mode of choice for this model.
     * Lip-sync (v418, Phase 3a): certified as a master-plate provider behind
     * the `composer.feature.seedance25_lipsync` flag. Plates stay silent
     * unless the scene explicitly opts into the hybrid ambience mode, in
     * which case the prompt forbids speech and a speech gate re-mutes the
     * plate if the model talks anyway.
     */
    visualInputs: {
      mode: 'exclusive',
      modes: ['first-frame', 'first-last-frame', 'references'],
      firstFrame: { supported: true, slot: 'visual-input' },
      endFrame: { supported: true, slot: 'visual-input', requiresFirstFrame: true },
      references: {
        max: 30,
        slot: 'visual-input',
        videos: 10,
        audios: 10,
        character: true,
        product: true,
        location: true,
      },
      lipSync: {
        supported: true,
        requiresIdentityReference: true,
        conflictsWithFirstFrame: false,
        verification: { status: 'verified' },
      },
    },


    durations: [4, 5, 8, 10, 12, 15, 20, 25, 30],
    resolution: '720p',
    resolutions: ['720p', '480p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],

    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-2-5'].costPerSecond,
    badge: 'New',
    tagline: tx({ de: `Seedance 2.5 · ${'bis 30 s pro Szene'} · 720p`, en: `Seedance 2.5 · ${'up to 30s per scene'} · 720p`, es: `Seedance 2.5 · ${'hasta 30 s por escena'} · 720p` }),
    legacyRoute: '/seedance-video-studio',
  },

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
    tagline: tx({ de: 'Schneller Draft · Iteration', en: 'Fast draft · iteration', es: 'Borrador rápido · iteración' }),
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
    tagline: tx({ de: 'Realistische Bewegungen · Native Audio', en: 'Realistic motion · native audio', es: 'Movimiento realista · audio nativo' }),
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
    // google/veo-3.1(-fast): duration [4,6,8], 16:9/9:16, generate_audio,
    // reference_images 1-3 — provider honours them only at 16:9 + 8 s.
    capabilities: {
      t2v: true, i2v: true, audio: true, nativeDialogue: true,
      multiRef: true, maxReferences: 3,
      refRequires: { aspectRatios: ['16:9'], durations: [8] },
    },
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
    capabilities: {
      t2v: true, i2v: true, audio: true, nativeDialogue: true,
      multiRef: true, maxReferences: 3,
      refRequires: { aspectRatios: ['16:9'], durations: [8] },
    },
    durations: [4, 6, 8],
    resolution: '1080p',
    aspectRatios: ['16:9', '9:16'],
    costPerSecond: VEO_VIDEO_MODELS['veo-3.1-fast'].costPerSecond,
    tagline: tx({ de: 'Schnell · 1080p · Audio', en: 'Fast · 1080p · audio', es: 'Rápido · 1080p · audio' }),
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
    capabilities: {
      t2v: true, i2v: true, audio: true, nativeDialogue: true,
      multiRef: true, maxReferences: 3,
      refRequires: { aspectRatios: ['16:9'], durations: [8] },
    },
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
    // lightricks/ltx-2.3-fast: duration enum 6-20 (step 2), 1080p/2k/4k,
    // 16:9/9:16, native audio, last frame + camera motion.
    capabilities: { t2v: true, i2v: true, audio: true, endFrame: true },
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    resolution: '1080p',
    resolutions: ['1080p', '2k', '4k'],
    aspectRatios: ltxAspect,
    costPerSecond: LTX_VIDEO_MODELS['ltx-standard'].costPerSecond,
    badge: tx({ de: "Schnell & Günstig", en: "Fast & Affordable", es: "Rápido y Económico" }),
    tagline: tx({ de: 'Schnellster Generator', en: 'Fastest generator', es: 'Generador más rápido' }),
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
    // lightricks/ltx-2.3-pro: duration enum [6,8,10], 1080p/2k/4k, 16:9/9:16.
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [6, 8, 10],
    resolution: '1080p',
    aspectRatios: ltxAspect,
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
    // wan-2.6: duration enum [5,10,15], size enum only 16:9/9:16, audio is an
    // upload-only input (no generation flag).
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10, 15],
    resolution: '720p',
    aspectRatios: wanLegacyAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-6-standard'].costPerSecond,
    badge: 'New',
    tagline: tx({ de: 'Wan 2.6 · Budget-Champion', en: 'Wan 2.6 · budget champion', es: 'Wan 2.6 · campeón económico' }),
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
    durations: [5, 10, 15],
    resolution: '1080p',
    aspectRatios: wanLegacyAspect,
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
    // wan-2.7: duration 2-15, aspect_ratio enum 16:9/9:16/1:1/4:3/3:4, auto audio.
    capabilities: { t2v: true, i2v: true, audio: true },
    durations: [5, 10, 15],
    resolution: '720p',
    aspectRatios: wan27Aspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-7-standard'].costPerSecond,
    badge: 'New',
    tagline: tx({ de: '27B MoE · natives Audio', en: '27B MoE · native audio', es: '27B MoE · audio nativo' }),
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
    durations: [5, 10, 15],
    resolution: '1080p',
    aspectRatios: wan27Aspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-2-7-pro'].costPerSecond,
    badge: 'Premium',
    tagline: tx({ de: '27B MoE · natives Audio · 1080p', en: '27B MoE · native audio · 1080p', es: '27B MoE · audio nativo · 1080p' }),
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
    // wan-2.5: duration enum [5,10]; the `size` enum has no square option.
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: wanLegacyAspect,
    costPerSecond: WAN_VIDEO_MODELS['wan-standard'].costPerSecond,
    tagline: tx({ de: 'Wan 2.5 · stabile Klassik', en: 'Wan 2.5 · stable classic', es: 'Wan 2.5 · clásico estable' }),
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
    tagline: tx({ de: 'Realistische Gesichter & Bewegung', en: 'Realistic faces & motion', es: 'Rostros y movimiento realistas' }),
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
    aspectRatios: lumaRay2Aspect,
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
    // luma/ray-2-720p has no resolution input — the model renders 720p only.
    resolution: '720p',
    aspectRatios: lumaRay2Aspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-pro'].costPerSecond,
    badge: 'Premium',
    tagline: 'Cinematic Pro · 720p',
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
    // luma/ray-3.2: resolution enum 540p/720p/1080p; start/end frame only at 5 s.
    durations: [5],
    resolution: '720p',
    resolutions: ['720p', '1080p', '540p'],
    aspectRatios: lumaRay32Aspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-ray32-5s'].costPerSecond,
    badge: 'New',
    tagline: tx({ de: 'Ray 3.2 · neueste Luma-Generation', en: 'Ray 3.2 · newest Luma generation', es: 'Ray 3.2 · última generación Luma' }),
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
    // Ray 3.2 accepts start/end frames only at 5 s — the 10 s tier is text-only
    // plus optional prompt guidance, and `loop` is rejected at 10 s.
    capabilities: { t2v: true, i2v: false, audio: false, endFrame: false },
    durations: [10],
    resolution: '720p',
    resolutions: ['720p', '1080p', '540p'],
    aspectRatios: lumaRay32Aspect,
    costPerSecond: LUMA_VIDEO_MODELS['luma-ray32-10s'].costPerSecond,
    badge: 'Neu · 10s',
    tagline: tx({ de: `Ray 3.2 ${'Langclip'} · 10 ${'Sekunden am Stück'}`, en: `Ray 3.2 ${'long clip'} · 10 ${'seconds straight'}`, es: `Ray 3.2 ${'clip largo'} · 10 ${'segundos seguidos'}` }),
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
    // bytedance/seedance-1-lite: 5 s or 10 s, 480p/720p, start + last frame.
    capabilities: { t2v: true, i2v: true, audio: false, endFrame: true },
    durations: [5, 10],
    resolution: '720p',
    resolutions: ['720p', '480p'],
    aspectRatios: seedanceAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-mini'].costPerSecond,
    badge: 'Draft',
    tagline: tx({ de: "Seedance 1 Lite · günstigster Draft-Renderer", en: "Seedance 1 Lite · cheapest draft renderer", es: "Seedance 1 Lite · renderizador de borrador más económico" }),
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
    aspectRatios: seedanceAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-standard'].costPerSecond,
    badge: 'New',
    tagline: tx({ de: 'Seedance 2.0 Fast · dynamische Motion', en: 'Seedance 2.0 Fast · dynamic motion', es: 'Seedance 2.0 Fast · movimiento dinámico' }),
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
    aspectRatios: seedanceAspect,
    costPerSecond: SEEDANCE_VIDEO_MODELS['seedance-pro'].costPerSecond,
    badge: 'Premium',
    tagline: tx({ de: "Seedance 2.0 Flagship · beste Motion-Kohärenz", en: "Seedance 2.0 Flagship · best motion coherence", es: "Seedance 2.0 Flagship · mejor coherencia de movimiento" }),
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
    // Runway Gen-4 Aleph consumes at most 5 s of the source clip per call and
    // accepts one optional reference image.
    capabilities: { t2v: false, i2v: false, v2v: true, audio: false, multiRef: true, maxReferences: 1 },
    durations: [5],
    resolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    costPerSecond: { EUR: 0.18, USD: 0.18 },
    badge: 'V2V Specialist',
    tagline: 'Restyle & transform existing clips',
    legacyRoute: '/runway-video-studio',
  },

  /* ─────────── Pika 2.2 (fal.ai `fal-ai/pika/v2.2/*`) ───────────
   * Provider reality check 11.08.2026: Pika has NO first-party Replicate
   * model — the official developer route is fal.ai. Durations 5/10 s,
   * 720p + 1080p, text-to-video and image-to-video (single start frame),
   * negative prompt + seed supported, no native audio. Pikaframes needs
   * 2–5 keyframes (not a plain end frame), so `endFrame` stays false.
   */
  {
    id: 'pika-2-2-standard',
    name: 'Pika 2.2',
    provider: 'Pika Labs (fal.ai)',
    family: 'pika',
    edgeFunction: 'generate-pika-video',
    group: 'recommended',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '720p',
    aspectRatios: pikaAspect,
    costPerSecond: { EUR: 0.09, USD: 0.09 },
    badge: tx({ de: "Wartung", en: "Maintenance", es: "Mantenimiento" }),
    tagline: 'Smooth motion · 5s/10s · 720p',
    legacyRoute: '/pika-video-studio',
    status: 'maintenance',
    statusReason: tx({ de: 'Pika läuft offiziell nur über die fal.ai-API. Sobald der fal.ai-Zugang hinterlegt ist, schalten wir das Modell wieder frei.', en: 'Pika is only officially available through the fal.ai API. We will re-enable the model as soon as fal.ai access is configured.', es: 'Pika solo está disponible oficialmente a través de la API de fal.ai. Reactivaremos el modelo en cuanto se configure el acceso a fal.ai.' }),
  },
  {
    id: 'pika-2-2-pro',
    name: 'Pika 2.2 Pro',
    provider: 'Pika Labs (fal.ai)',
    family: 'pika',
    edgeFunction: 'generate-pika-video',
    group: 'premium',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: [5, 10],
    resolution: '1080p',
    aspectRatios: pikaAspect,
    costPerSecond: { EUR: 0.2, USD: 0.2 },
    badge: tx({ de: "Wartung", en: "Maintenance", es: "Mantenimiento" }),
    tagline: 'High-fidelity Pika · 5s/10s · 1080p',
    legacyRoute: '/pika-video-studio',
    status: 'maintenance',
    statusReason: tx({ de: 'Pika läuft offiziell nur über die fal.ai-API. Sobald der fal.ai-Zugang hinterlegt ist, schalten wir das Modell wieder frei.', en: 'Pika is only officially available through the fal.ai API. We will re-enable the model as soon as fal.ai access is configured.', es: 'Pika solo está disponible oficialmente a través de la API de fal.ai. Reactivaremos el modelo en cuanto se configure el acceso a fal.ai.' }),
  },

  /* ─────────── Vidu (IDs q2-*, läuft real auf Replicate `vidu/q3-*`) ───────────
   * Verifiziertes Replicate-Input-Schema (11.08.2026):
   *   duration 1–16 (default 5) · resolution 540p/720p/1080p ·
   *   aspect_ratio 16:9|9:16|3:4|4:3|1:1 · start_image · end_image ·
   *   audio (bool, default true) · seed. KEIN reference_images-Array und
   *   KEIN negative_prompt — Multi-Ref existiert auf Replicate nicht.
   */
  {
    id: 'vidu-q2-reference',
    name: VIDU_VIDEO_MODELS['vidu-q2-reference'].name,
    provider: 'Shengshu AI',
    family: 'vidu',
    edgeFunction: 'generate-vidu-video',
    group: 'recommended',
    icon: Eye,
    capabilities: { t2v: true, i2v: true, audio: true, endFrame: true },
    durations: viduDurations,
    resolution: '1080p',
    resolutions: ['540p', '720p', '1080p'],
    aspectRatios: viduAspect,
    costPerSecond: { EUR: 0.265, USD: 0.265 },
    badge: 'Start+End',
    tagline: tx({ de: 'Q3 Pro: Start- und Endframe, natives Audio, bis 16s', en: 'Q3 Pro: start + end frame, native audio, up to 16s', es: 'Q3 Pro: fotograma inicial y final, audio nativo, hasta 16s' }),
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
    capabilities: { t2v: false, i2v: true, audio: true, endFrame: true },
    durations: viduDurations,
    resolution: '1080p',
    resolutions: ['540p', '720p', '1080p'],
    aspectRatios: viduAspect,
    costPerSecond: { EUR: 0.265, USD: 0.265 },
    badge: 'I2V',
    tagline: tx({ de: 'Animiert ein Standbild zu bis zu 16s Video', en: 'Animates a still image into up to 16s of video', es: 'Anima una imagen fija en un vídeo de hasta 16s' }),
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
    capabilities: { t2v: true, i2v: false, audio: true },
    durations: viduDurations,
    resolution: '1080p',
    resolutions: ['540p', '720p', '1080p'],
    aspectRatios: viduAspect,
    costPerSecond: { EUR: 0.145, USD: 0.145 },
    badge: 'T2V',
    tagline: tx({ de: 'Q3 Turbo: schneller Clip aus reinem Prompt, bis 16s', en: 'Q3 Turbo: fast clip from a pure prompt, up to 16s', es: 'Q3 Turbo: clip rápido a partir de un prompt, hasta 16s' }),
    legacyRoute: '/vidu-studio',
  },

  /* ─────────── HappyHorse 1.0 (Alibaba, Replicate `alibaba/happyhorse-1.0`) ───────────
   * Verifiziertes Replicate-Input-Schema (11.08.2026):
   *   duration enum 3…15 · resolution 720p/1080p · aspect_ratio
   *   16:9|9:16|1:1|4:3|3:4 · image (Startframe) · seed.
   *   Kein Audio-Parameter und kein negative_prompt → kein nativer Dialog.
   */
  {
    id: 'happyhorse-standard',
    name: HAPPYHORSE_VIDEO_MODELS['happyhorse-standard'].name,
    provider: 'Alibaba',
    family: 'happyhorse',
    edgeFunction: 'generate-happyhorse-video',
    group: 'recommended',
    icon: Sparkles,
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: happyhorseDurations,
    resolution: '720p',
    aspectRatios: happyhorseAspect,
    costPerSecond: HAPPYHORSE_VIDEO_MODELS['happyhorse-standard'].costPerSecond,
    badge: 'Neu · Alibaba',
    tagline: 'Multi-Shot Consistency · 3–15s · 720p',
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
    capabilities: { t2v: true, i2v: true, audio: false },
    durations: happyhorseDurations,
    resolution: '1080p',
    aspectRatios: happyhorseAspect,
    costPerSecond: HAPPYHORSE_VIDEO_MODELS['happyhorse-pro'].costPerSecond,
    badge: 'Premium · 1080p',
    tagline: 'Multi-Shot Consistency · 3–15s · 1080p',
    legacyRoute: '/happyhorse-video-studio',
  },

  /* Sora 2 entfernt — OpenAI sunset 2026, Routen migrieren auf Veo 3.1 / Kling 3 Pro. */
];

/**
 * USD prices are DERIVED from the maintained EUR price with the shared FX
 * factor (1 EUR ≈ 1.15 USD), so a USD wallet is charged exactly what the UI
 * shows. Never hand-maintain a USD price in the per-provider config files.
 */
export const AI_VIDEO_TOOLKIT_MODELS: ToolkitModel[] = AI_VIDEO_TOOLKIT_MODELS_RAW.map((m) => ({
  ...m,
  costPerSecond: { EUR: m.costPerSecond.EUR, USD: usdFromEur(m.costPerSecond.EUR) },
}));

export const TOOLKIT_GROUP_LABELS: Record<ToolkitModelGroup, { de: string; en: string; es: string }> = {
  recommended: { de: '⭐ Empfohlen', en: '⭐ Recommended', es: '⭐ Recomendado' },
  audio:       { de: '🎵 Mit Native Audio', en: '🎵 Native Audio', es: '🎵 Audio Nativo' },
  fast:        { de: '⚡ Schnell & Günstig', en: '⚡ Fast & Cheap', es: '⚡ Rápido y Barato' },
  premium:     { de: '💎 Premium', en: '💎 Premium', es: '💎 Premium' },
};

/**
 * Professionelle Gruppierung nach der Capability-Registry (videoModelSpecs).
 * Ersetzt die Budget-Optik: Flagship zuerst, Draft/Legacy am Ende.
 */
export const SPEC_GROUP_LABELS: Record<
  'flagship' | 'professional' | 'audio' | 'fast' | 'economy' | 'legacy',
  { de: string; en: string; es: string }
> = {
  flagship:     { de: 'Flagship — höchste native Auflösung', en: 'Flagship — highest native resolution', es: 'Flagship — máxima resolución nativa' },
  professional: { de: 'Professionelle Produktion', en: 'Professional production', es: 'Producción profesional' },
  audio:        { de: 'Native Audio & Dialog', en: 'Native audio & dialogue', es: 'Audio y diálogo nativos' },
  fast:         { de: 'Schnelle Iteration', en: 'Fast iteration', es: 'Iteración rápida' },
  economy:      { de: 'Sparsam / Entwurf', en: 'Economy / draft', es: 'Económico / borrador' },
  legacy:       { de: 'Legacy', en: 'Legacy', es: 'Legado' },
};

/** Fallback, solange ein Modell noch keine Spec hat. */
export const LEGACY_GROUP_TO_SPEC_GROUP: Record<ToolkitModelGroup, keyof typeof SPEC_GROUP_LABELS> = {
  recommended: 'flagship',
  premium: 'professional',
  audio: 'audio',
  fast: 'fast',
};

export function getToolkitModelById(id: string | null | undefined): ToolkitModel | undefined {
  if (!id) return undefined;
  return AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === id);
}

export function getDefaultToolkitModel(): ToolkitModel {
  return AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === 'seedance-2-5') ?? AI_VIDEO_TOOLKIT_MODELS[0];
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

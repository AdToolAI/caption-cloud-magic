/**
 * Build ComposerScene[] from an Ad Director configuration.
 *
 * Stufe 2b extends the original builder with:
 *  - Color roles (primary/secondary/accent/neutral) instead of hardcoded white.
 *  - Brand-font propagation onto every text overlay.
 *  - Optional auto-appended logo endcard scene (static, 0 AI credits).
 *  - Style-reference image URL passed through to AI clip generation
 *    (when the model supports image_input — Wan, Kling, Hailuo, Seedance).
 */

import type {
  ComposerScene,
  ClipSource,
  ClipQuality,
  TransitionStyle,
} from '@/types/video-composer';
import {
  type AdStoryFramework,
  type AdFrameworkId,
  type AdFormatId,
  type AdGoalId,
  getAdStoryFramework,
  distributeFrameworkDurations,
} from '@/config/adStoryFrameworks';
import {
  pickTemplateForBeat,
  type AdSceneTemplate,
} from '@/config/adSceneTemplates';
import type { AdTonalityId } from '@/config/adTonalityProfiles';

/** Subset of brand-kit fields used to style the ad scenes. */
export interface AdBrandKitInput {
  brandName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  fontFamily?: string | null;
  tagline?: string | null;
}

export interface BuildAdScenesInput {
  frameworkId: AdFrameworkId;
  format: AdFormatId;
  goal: AdGoalId;
  tonalityId: AdTonalityId;
  productName: string;
  productDescription?: string;
  defaultClipSource?: ClipSource;
  defaultClipQuality?: ClipQuality;
  defaultTransition?: TransitionStyle;
  /** Per-beat AI-generated voiceover/subtitle line, indexed by beat order. */
  scriptLines?: string[];
  /** Active brand kit — when provided, brand colors + font are used and the
   *  brand name is woven into hook + CTA prompts. */
  brandKit?: AdBrandKitInput | null;
  /** Append a 2-second static logo endcard scene at the end (requires brandKit). */
  appendLogoEndcard?: boolean;
}

export interface BuildAdScenesResult {
  scenes: ComposerScene[];
  totalDurationSec: number;
  framework: AdStoryFramework;
}

const FORMAT_DURATIONS: Record<AdFormatId, number> = {
  'tvc-15': 15,
  'tvc-30': 30,
  'tvc-60': 60,
  'longform': 90,
};

/** Map beat type -> color role for Stufe 2b CI compliance. */
type ColorRole = 'primary' | 'secondary' | 'accent' | 'neutral';

const BEAT_COLOR_ROLE: Record<string, ColorRole> = {
  hook: 'accent',
  problem: 'neutral',
  solution: 'primary',
  demo: 'secondary',
  'social-proof': 'secondary',
  cta: 'primary',
  custom: 'neutral',
};

function resolveBrandColor(role: ColorRole, brand: AdBrandKitInput | null | undefined): string {
  if (!brand) return '#FFFFFF';
  switch (role) {
    case 'primary':   return brand.primaryColor   || brand.accentColor || '#FFFFFF';
    case 'secondary': return brand.secondaryColor || brand.primaryColor || '#FFFFFF';
    case 'accent':    return brand.accentColor    || brand.primaryColor || '#FFFFFF';
    case 'neutral':   return '#FFFFFF';
  }
}

/** Models that accept a reference image as style hint. */
const STYLE_REF_CAPABLE: ReadonlySet<ClipSource> = new Set<ClipSource>([
  'ai-wan',
  'ai-kling',
  'ai-hailuo',
  'ai-seedance',
]);

export function buildAdScenes(input: BuildAdScenesInput): BuildAdScenesResult {
  const framework = getAdStoryFramework(input.frameworkId);
  if (!framework) {
    throw new Error(`Unknown ad framework: ${input.frameworkId}`);
  }

  const totalSec = FORMAT_DURATIONS[input.format];
  const durations = distributeFrameworkDurations(framework, totalSec);

  const clipSource: ClipSource = input.defaultClipSource ?? 'ai-hailuo';
  const clipQuality: ClipQuality = input.defaultClipQuality ?? 'standard';
  const transition: TransitionStyle = input.defaultTransition ?? 'crossfade';

  const brand = input.brandKit ?? null;
  const brandName = brand?.brandName?.trim();
  const brandFont = brand?.fontFamily || undefined;

  const scenes: ComposerScene[] = framework.beats.map((beat, idx) => {
    const template: AdSceneTemplate = pickTemplateForBeat(beat.sceneType);
    const durationSeconds = durations[idx];

    let filledPrompt = template.promptSkeleton
      .replace(/\{PRODUCT\}/g, input.productName || 'the product')
      .replace(/\{FEATURE\}/g, 'its key feature')
      .replace(/\{ENVIRONMENT\}/g, 'natural everyday setting');

    if (brandName && (beat.sceneType === 'hook' || beat.sceneType === 'cta')) {
      filledPrompt += ` Brand identity: ${brandName}.`;
    }
    if (brand?.primaryColor && beat.sceneType === 'cta') {
      filledPrompt += ` Color palette accent: ${brand.primaryColor}.`;
    }
    // Style-reference safety: keep brand mood, prevent logo-bleed in AI frames.
    if (brand?.logoUrl && STYLE_REF_CAPABLE.has(clipSource)) {
      filledPrompt +=
        ' Maintain brand color palette and visual mood; do NOT include the logo itself in the frame.';
    }

    const scriptLine = input.scriptLines?.[idx] ?? '';
    const isCta = beat.sceneType === 'cta';
    const role = BEAT_COLOR_ROLE[beat.sceneType] ?? 'neutral';
    const color = resolveBrandColor(role, brand);

    return {
      id: `ad-${input.frameworkId}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      projectId: '',
      orderIndex: idx,
      sceneType: beat.sceneType,
      durationSeconds,
      clipSource,
      clipQuality,
      aiPrompt: filledPrompt,
      // Pass logo as soft style-reference for capable models. Edge functions
      // already use referenceImageUrl when present.
      referenceImageUrl: brand?.logoUrl && STYLE_REF_CAPABLE.has(clipSource)
        ? brand.logoUrl
        : undefined,
      clipStatus: 'pending',
      textOverlay: {
        text: scriptLine,
        position: isCta ? 'center' : 'bottom',
        animation: 'fade-in',
        fontSize: isCta ? 56 : 48,
        color,
        fontFamily: brandFont,
      },
      transitionType: transition,
      transitionDuration: 0.5,
      retryCount: 0,
      costEuros: 0,
      directorModifiers: {},
      shotDirector: { ...template.shotDirector },
      // NOTE: cinematicPresetId is a clientside SLUG (e.g. 'commercial-glossy'),
      // NOT a UUID — must NOT be written to applied_style_preset_id (UUID FK).
      cinematicPresetSlug: template.cinematicPresetId,
    };
  });

  // Auto-append logo endcard (2s, static, 0 AI credits).
  if (input.appendLogoEndcard && brand?.logoUrl) {
    const endcardBg = brand.primaryColor || '#000000';
    const endcardFg = brand.accentColor || '#FFFFFF';
    const endcardText =
      brand.tagline?.trim() || brandName || input.productName || '';

    scenes.push({
      id: `ad-endcard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      projectId: '',
      orderIndex: scenes.length,
      sceneType: 'cta',
      durationSeconds: 2,
      // Reuse stock-image clipSource as carrier for the static endcard logo —
      // composer renderer already handles image clips via uploadUrl/clipUrl.
      clipSource: 'upload',
      clipQuality: 'standard',
      aiPrompt: '',
      uploadUrl: brand.logoUrl,
      uploadType: 'image',
      clipUrl: brand.logoUrl,
      clipStatus: 'ready',
      textOverlay: {
        text: endcardText,
        position: 'bottom',
        animation: 'fade-in',
        fontSize: 42,
        color: endcardFg,
        fontFamily: brandFont,
      },
      transitionType: 'fade',
      transitionDuration: 0.5,
      retryCount: 0,
      costEuros: 0,
      directorModifiers: { backgroundColor: endcardBg } as any,
      shotDirector: {},
    } as ComposerScene);
  }

  return {
    scenes,
    totalDurationSec: scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
    framework,
  };
}

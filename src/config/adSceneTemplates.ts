/**
 * Ad Scene Templates — 7 reusable building blocks for advertising scenes.
 *
 * Each template provides defaults for a `ComposerScene`: the scene type,
 * a typical duration, a recommended Shot Director selection, a default
 * cinematic preset, and a localized prompt skeleton. Templates are
 * deliberately brand-agnostic — no trademarked names.
 */

import type { SceneType, ComposerScene } from '@/types/video-composer';

export type AdSceneTemplateId =
  | 'hero-product-shot'
  | 'lifestyle-context'
  | 'feature-callout'
  | 'social-proof-cut'
  | 'testimonial-talking-head'
  | 'cta-end-card'
  | 'logo-reveal';

export interface AdSceneTemplate {
  id: AdSceneTemplateId;
  glyph: string;
  label: { de: string; en: string; es: string };
  desc: { de: string; en: string; es: string };
  sceneType: SceneType;
  defaultDurationSec: number;
  shotDirector: NonNullable<ComposerScene['shotDirector']>;
  cinematicPresetId: string;
  /** English prompt skeleton — visuals stay in English for AI quality. */
  promptSkeleton: string;
}

export const AD_SCENE_TEMPLATES: AdSceneTemplate[] = [
  {
    id: 'hero-product-shot',
    glyph: '🏆',
    label: {
      de: 'Hero Product Shot',
      en: 'Hero Product Shot',
      es: 'Plano Heroico del Producto',
    },
    desc: {
      de: 'Produkt im Zentrum, dramatisches Licht, langsamer Push-In.',
      en: 'Product centered, dramatic lighting, slow push-in.',
      es: 'Producto centrado, iluminación dramática, push-in lento.',
    },
    sceneType: 'solution',
    defaultDurationSec: 4,
    shotDirector: {
      framing: 'medium-close-up',
      angle: 'eye-level',
      movement: 'slow-push-in',
      lighting: 'rim-light',
    },
    cinematicPresetId: 'commercial-glossy',
    promptSkeleton:
      'Hero product shot of {PRODUCT}, centered composition, premium studio lighting, glossy reflections, slow camera push-in, shallow depth of field, ultra-detailed, advertising photography quality.',
  },
  {
    id: 'lifestyle-context',
    glyph: '🌅',
    label: {
      de: 'Lifestyle Context',
      en: 'Lifestyle Context',
      es: 'Contexto de Lifestyle',
    },
    desc: {
      de: 'Produkt im echten Leben — Menschen, Umgebung, beiläufig.',
      en: 'Product in real life — people, environment, casual.',
      es: 'Producto en la vida real — personas, entorno, casual.',
    },
    sceneType: 'demo',
    defaultDurationSec: 5,
    shotDirector: {
      framing: 'wide-shot',
      angle: 'eye-level',
      movement: 'handheld-subtle',
      lighting: 'golden-hour',
    },
    cinematicPresetId: 'cinematic-warm',
    promptSkeleton:
      'Lifestyle scene featuring {PRODUCT} naturally integrated, real people in a {ENVIRONMENT}, golden hour light, subtle handheld camera, warm cinematic color grade, authentic mood.',
  },
  {
    id: 'feature-callout',
    glyph: '🔍',
    label: {
      de: 'Feature Callout',
      en: 'Feature Callout',
      es: 'Resaltado de Característica',
    },
    desc: {
      de: 'Macro-Detail einer Funktion. Ideal für Tech-/Beauty-/Food-Werbung.',
      en: 'Macro detail of a feature. Ideal for tech/beauty/food ads.',
      es: 'Detalle macro de una función. Ideal para tech/beauty/food.',
    },
    sceneType: 'demo',
    defaultDurationSec: 3,
    shotDirector: {
      framing: 'extreme-close-up',
      angle: 'eye-level',
      movement: 'orbital-slow',
      lighting: 'soft-key',
    },
    cinematicPresetId: 'commercial-glossy',
    promptSkeleton:
      'Extreme macro close-up highlighting the {FEATURE} of {PRODUCT}, slow orbital camera move, soft key lighting, crisp focus, commercial-grade detail.',
  },
  {
    id: 'social-proof-cut',
    glyph: '📊',
    label: {
      de: 'Social Proof Cut',
      en: 'Social Proof Cut',
      es: 'Corte de Prueba Social',
    },
    desc: {
      de: 'Schnelle Zahl, Award-Badge oder Press-Quote als Zwischenschnitt.',
      en: 'Quick number, award badge or press quote as cutaway.',
      es: 'Cifra rápida, premio o cita de prensa como inserto.',
    },
    sceneType: 'social-proof',
    defaultDurationSec: 2.5,
    shotDirector: {
      framing: 'medium-shot',
      angle: 'eye-level',
      movement: 'static-locked',
      lighting: 'natural-light',
    },
    cinematicPresetId: 'documentary',
    promptSkeleton:
      'Clean cutaway scene supporting a social proof claim about {PRODUCT}, neutral background, natural light, static locked camera, leaving generous negative space for an on-screen number or quote overlay.',
  },
  {
    id: 'testimonial-talking-head',
    glyph: '🎙️',
    label: {
      de: 'Testimonial Talking Head',
      en: 'Testimonial Talking Head',
      es: 'Testimonio (Plano de Cabeza)',
    },
    desc: {
      de: 'Person spricht direkt zur Kamera. Dokumentarisch, ehrlich.',
      en: 'Person speaks directly to camera. Documentary, honest.',
      es: 'Persona habla directo a cámara. Documental, honesto.',
    },
    sceneType: 'social-proof',
    defaultDurationSec: 5,
    shotDirector: {
      framing: 'medium-close-up',
      angle: 'eye-level',
      movement: 'static-locked',
      lighting: 'soft-key',
    },
    cinematicPresetId: 'documentary',
    promptSkeleton:
      'Documentary-style medium close-up of a person speaking directly to camera about {PRODUCT}, soft key light, slightly defocused background, natural skin tones, honest authentic mood.',
  },
  {
    id: 'cta-end-card',
    glyph: '🎯',
    label: {
      de: 'CTA End Card',
      en: 'CTA End Card',
      es: 'Tarjeta Final CTA',
    },
    desc: {
      de: 'Klare Handlungsaufforderung mit Logo und URL.',
      en: 'Clear call to action with logo and URL.',
      es: 'Llamada a la acción clara con logo y URL.',
    },
    sceneType: 'cta',
    defaultDurationSec: 3,
    shotDirector: {
      framing: 'medium-shot',
      angle: 'eye-level',
      movement: 'static-locked',
      lighting: 'high-key',
    },
    cinematicPresetId: 'commercial-glossy',
    promptSkeleton:
      'Clean end-card composition for {PRODUCT}, minimal background in brand colors, high-key lighting, static camera, strong negative space for logo and call-to-action overlay.',
  },
  {
    id: 'logo-reveal',
    glyph: '✨',
    label: {
      de: 'Logo Reveal',
      en: 'Logo Reveal',
      es: 'Revelación de Logo',
    },
    desc: {
      de: 'Animierter Logo-Auftritt. Premium-Finish.',
      en: 'Animated logo entrance. Premium finish.',
      es: 'Aparición animada del logo. Acabado premium.',
    },
    sceneType: 'cta',
    defaultDurationSec: 2,
    shotDirector: {
      framing: 'medium-shot',
      angle: 'eye-level',
      movement: 'slow-push-in',
      lighting: 'rim-light',
    },
    cinematicPresetId: 'commercial-glossy',
    promptSkeleton:
      'Premium animated logo reveal sequence on a deep gradient background, rim light, slow push-in, particle accents in brand colors, cinematic depth.',
  },
];

export function getAdSceneTemplate(id: AdSceneTemplateId): AdSceneTemplate | undefined {
  return AD_SCENE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Map a SceneType beat (from a story framework) to the most appropriate
 * default scene template. Used by `buildAdScenes` to pick a template when
 * the framework only specifies the abstract beat type.
 */
export function pickTemplateForBeat(sceneType: SceneType): AdSceneTemplate {
  switch (sceneType) {
    case 'hook':
      return getAdSceneTemplate('hero-product-shot')!;
    case 'problem':
      return getAdSceneTemplate('lifestyle-context')!;
    case 'solution':
      return getAdSceneTemplate('hero-product-shot')!;
    case 'demo':
      return getAdSceneTemplate('feature-callout')!;
    case 'social-proof':
      return getAdSceneTemplate('social-proof-cut')!;
    case 'cta':
      return getAdSceneTemplate('cta-end-card')!;
    default:
      return getAdSceneTemplate('hero-product-shot')!;
  }
}

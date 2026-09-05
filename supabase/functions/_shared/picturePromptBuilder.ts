/**
 * Picture Studio — deterministic prompt & parameter builder (SHARED).
 *
 * One place decides what a Generate run really sends to a provider:
 *  - which text segments the prompt is assembled from (user text first),
 *  - whether the "how much may change" slider becomes a native provider
 *    parameter (and with which polarity) or a language clause,
 *  - whether transparency is possible at all for the chosen model,
 *  - what the user must be told about it.
 *
 * The UI imports the very same module through `src/config/picturePromptBuilder.ts`
 * so the "what we send" disclosure cannot drift from the request.
 *
 * Pure data + pure functions. No Deno APIs, no network, no provider SDKs.
 */

import { capabilityFor, type PictureMode } from './pictureModelCapabilities.ts';
import {
  resolveRequestedFormat,
  SOURCE_FORMAT,
  type ResolvedFormat,
  type SourceDimensions,
} from './pictureFormatResolution.ts';

export type PictureIntent = PictureMode;

export interface LocalizedText {
  de: string;
  en: string;
  es: string;
}

export type PromptSegmentSource =
  | 'user'
  | 'intent'
  | 'reference'
  | 'style'
  | 'brand'
  | 'negative'
  | 'format';

export interface PromptSegment {
  source: PromptSegmentSource;
  text: string;
  /** Short label for the disclosure UI. */
  label: LocalizedText;
}

export type PictureNoticeCode =
  | 'STYLE_PRESET_APPLIED'
  | 'STYLE_NONE'
  | 'STRENGTH_NATIVE'
  | 'STRENGTH_AS_LANGUAGE'
  | 'STRENGTH_IGNORED'
  | 'TRANSPARENCY_UNSUPPORTED'
  | 'TRANSPARENCY_NATIVE'
  | 'NEGATIVE_AS_LANGUAGE'
  | 'REFERENCES_IGNORED';

export interface PictureNotice {
  code: PictureNoticeCode;
  /** `block` must abort the run before any provider call. */
  level: 'info' | 'warn' | 'block';
  message: LocalizedText;
}

export interface PicturePromptInput {
  tier: string;
  mode: PictureIntent;
  prompt: string;
  /** `none` (or empty) means: send the user's words unchanged. */
  style?: string;
  /** Legacy: already-resolved ratio. Prefer `requestedFormat`. */
  aspectRatio?: string;
  /** Semantic user choice: `source` or a ratio label. Never mutated. */
  requestedFormat?: string;
  /**
   * Natural pixel size of the PRIMARY reference image (reference #1).
   * Client passes it for the preview; the server re-derives it from trusted
   * asset metadata before building the real provider request.
   */
  source?: SourceDimensions | null;
  subjectRefs?: string[];
  styleRefs?: string[];
  /** UI value 0..100 — "how much may the picture change". 0 = barely, 100 = a lot. */
  strength?: number;
  transparentBackground?: boolean;
  brandKit?: {
    name?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    mood?: string;
  } | null;
}

/**
 * Machine-readable record of everything AdTool added on top of the user's own
 * words. Invariant tests assert on THIS, never on a word blocklist over the
 * final prompt (the user may legitimately write "photorealistic" themselves).
 */
export interface AppliedModifier {
  source: PromptSegmentSource;
  /** Stable identifier, e.g. `style:cinematic`, `ratio-prompt`, `intent:close`. */
  id: string;
}

export interface ReferenceInfluence {
  /** Semantic level the user picked. `none` when no reference is in play. */
  level: 'close' | 'balanced' | 'free' | 'none';
  /** How the level reaches the provider. */
  method: 'none' | 'native' | 'prompt-guided';
  field?: 'image_prompt_strength' | 'strength';
  value?: number;
}

/** Provider-neutral, comparable description of one run. */
export interface NormalizedPictureRequest {
  tier: string;
  mode: PictureIntent;
  /** `auto` when the user added no style preset. */
  style: string;
  requestedFormat: string;
  resolvedFormat: ResolvedFormat;
  referenceInfluence: ReferenceInfluence;
  subjectRefCount: number;
  styleRefCount: number;
  transparentBackground: boolean;
  negativeTerms: string[];
  appliedModifiers: AppliedModifier[];
}

export interface BuiltPictureRequest {
  /** Final text handed to the provider. */
  prompt: string;
  segments: PromptSegment[];
  /** Terms extracted from `--no` / `--negative` flags in the user's prompt. */
  negativeTerms: string[];
  /** Provider-space value (0..1), polarity already corrected. Undefined = do not send. */
  strengthValue?: number;
  strengthField?: 'image_prompt_strength' | 'strength';
  /** Resolved transparency — only ever true when the model really supports it. */
  transparentBackground: boolean;
  notices: PictureNotice[];
  /** Everything AdTool added — empty means "only the user's words". */
  appliedModifiers: AppliedModifier[];
  /** Model-specific technical resolution of the semantic format choice. */
  resolvedFormat: ResolvedFormat;
  referenceInfluence: ReferenceInfluence;
  normalizedRequest: NormalizedPictureRequest;
}

/* ------------------------------------------------------------------ styles */

export const PICTURE_STYLE_MODIFIERS: Record<string, string> = {
  realistic: 'photorealistic, 8k, ultra-detailed, natural lighting, professional photography',
  cinematic: 'cinematic composition, dramatic lighting, anamorphic lens flare, movie still, color graded',
  watercolor: 'delicate watercolor painting, soft washes, paper texture, artistic brushstrokes',
  'neon-cyberpunk': 'neon-lit cyberpunk, vibrant glowing lights, futuristic cityscape, synthwave colors',
  anime: 'anime art style, cel-shaded, vibrant colors, Studio Ghibli inspired',
  'oil-painting': 'classical oil painting, rich textures, impasto technique, museum quality',
  'pop-art': 'pop art style, bold colors, halftone dots, Andy Warhol inspired',
  minimalist: 'minimalist design, clean lines, negative space, simple elegant composition',
  vintage: 'vintage photograph, film grain, sepia tones, retro 1970s aesthetic',
  fantasy: 'epic fantasy art, magical atmosphere, ethereal lighting, detailed world-building',
  'product-photo': 'professional product photography, studio lighting, clean background, commercial quality',
  abstract: 'abstract art, geometric shapes, bold color palette, contemporary art',
  sketch: 'detailed pencil sketch, cross-hatching, hand-drawn illustration',
  '3d-render': '3D rendered, octane render, volumetric lighting, subsurface scattering',
  noir: 'film noir style, high contrast black and white, dramatic shadows, moody atmosphere',
  pastel: 'soft pastel colors, dreamy atmosphere, gentle lighting, ethereal mood',
  comic: 'comic book art style, bold outlines, vibrant panel art, dynamic composition',
  surreal: 'surrealist art, dreamlike imagery, impossible geometry, Salvador Dalí inspired',
  architectural: 'architectural visualization, clean lines, modern design, dramatic perspective',
  editorial: 'editorial fashion photography, high-end magazine style, bold composition',
  'brand-logo': [
    'flat 2D vector logo design, the logomark fills 70-90% of the frame and is perfectly centered',
    'bold simple iconic shapes with clear negative space, plain solid white background',
    'no mockups, no products, no scenes, no 3D rendering, no photographic textures, no frames',
  ].join(', '),
};

/** The explicit "do not touch my words" option. */
export const PICTURE_STYLE_NONE = 'none';

export function styleModifierFor(style?: string): string | null {
  if (!style || style === PICTURE_STYLE_NONE) return null;
  return PICTURE_STYLE_MODIFIERS[style] ?? null;
}

/* ------------------------------------------------------- strength handling */

export type StrengthBucket = 'close' | 'balanced' | 'free';

export function strengthBucket(value: number): StrengthBucket {
  if (value <= 33) return 'close';
  if (value <= 66) return 'balanced';
  return 'free';
}

/**
 * Translate the UI slider ("how much may change", 0..100) into the provider's
 * own scale. The two supported fields mean opposite things:
 *
 *  - FLUX `image_prompt_strength` — "Blend between the prompt and the image
 *    prompt" (0..1, default 0.1). Higher = the reference dominates, i.e. LESS
 *    change. Therefore inverted.
 *  - Qwen `strength` — "Strength for img2img pipeline" (0..1, default 0.9).
 *    Higher = more denoising, i.e. MORE change. Therefore direct.
 */
export function providerStrength(
  field: 'image_prompt_strength' | 'strength',
  uiStrength: number,
): number {
  const clamped = Math.max(0, Math.min(100, uiStrength)) / 100;
  const value = field === 'image_prompt_strength' ? 1 - clamped : clamped;
  return Math.round(value * 100) / 100;
}

/* --------------------------------------------------- transparency handling */

/** Models whose provider request can really return an alpha channel. */
export const TRANSPARENCY_CAPABLE_TIERS = ['gptimage'] as const;

export function supportsTransparency(tier: string): boolean {
  return (TRANSPARENCY_CAPABLE_TIERS as readonly string[]).includes(tier);
}

/* ------------------------------------------------------- negative handling */

const NEGATIVE_FLAG = /--(?:no|negative)\s+([^\n]+)/gi;

export function extractNegativeTerms(prompt: string): { text: string; terms: string[] } {
  const terms: string[] = [];
  const text = prompt.replace(NEGATIVE_FLAG, (_match, group: string) => {
    group
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => terms.push(part));
    return '';
  });
  return { text: text.replace(/[ \t]{2,}/g, ' ').trim(), terms };
}

/* --------------------------------------------------------------- clauses */

const INTENT_CLAUSES: Record<StrengthBucket, string> = {
  close:
    'Keep the reference image exactly as it is in composition, subject placement, framing and lighting. Apply only the changes described above.',
  balanced:
    'Keep the main subject and the overall composition of the reference image. Style, lighting and secondary details may change as described above.',
  free:
    'Treat the reference image as loose inspiration only. Follow the written description first; composition, framing and background may differ.',
};

const MIX_CLAUSE =
  'Combine the provided reference images into one coherent scene as described above.';

const STYLE_REF_CLAUSE =
  'Adopt the visual style, colour palette, texture and mood of the style reference image. Do not copy its subject or composition.';

/* ----------------------------------------------------------------- builder */

export function buildPictureRequest(input: PicturePromptInput): BuiltPictureRequest {
  const cap = capabilityFor(input.tier);
  const notices: PictureNotice[] = [];
  const segments: PromptSegment[] = [];
  const appliedModifiers: AppliedModifier[] = [];

  const subjectRefs = (input.subjectRefs ?? []).filter(Boolean);
  const styleRefs = (input.styleRefs ?? []).filter(Boolean);

  /* 0. semantic format choice -> model-specific resolution (never mutates it) */
  const requestedFormat = input.requestedFormat ?? input.aspectRatio ?? '1:1';
  const resolvedFormat = resolveRequestedFormat(input.tier, requestedFormat, input.source);


  /* 1. the user's own words — always first, never rewritten */
  const { text: userText, terms: negativeTerms } = extractNegativeTerms(input.prompt ?? '');
  if (userText) {
    segments.push({
      source: 'user',
      text: userText,
      label: { de: 'Deine Beschreibung', en: 'Your description', es: 'Tu descripción' },
    });
  }

  /* 2. intent clause — only where language is the only lever we have */
  const nativeStrengthField = cap?.strengthField;
  const usesReference = input.mode === 'transform' || input.mode === 'mix';
  const uiStrength = typeof input.strength === 'number' ? input.strength : 50;

  let strengthValue: number | undefined;
  let strengthField: 'image_prompt_strength' | 'strength' | undefined;

  if (usesReference && subjectRefs.length) {
    if (nativeStrengthField) {
      strengthField = nativeStrengthField;
      strengthValue = providerStrength(nativeStrengthField, uiStrength);
      notices.push({
        code: 'STRENGTH_NATIVE',
        level: 'info',
        message: {
          de: `${cap?.model ?? input.tier} steuert die Änderungsstärke direkt am Modell (${strengthField} = ${strengthValue}).`,
          en: `${cap?.model ?? input.tier} controls the amount of change natively (${strengthField} = ${strengthValue}).`,
          es: `${cap?.model ?? input.tier} controla la cantidad de cambio de forma nativa (${strengthField} = ${strengthValue}).`,
        },
      });
    } else {
      const bucket = strengthBucket(uiStrength);
      const clause = input.mode === 'mix' ? MIX_CLAUSE : INTENT_CLAUSES[bucket];
      segments.push({
        source: 'intent',
        text: clause,
        label: {
          de: 'Umgang mit dem Referenzbild',
          en: 'How the reference is used',
          es: 'Uso de la imagen de referencia',
        },
      });
      appliedModifiers.push({
        source: 'intent',
        id: input.mode === 'mix' ? 'intent:mix' : `intent:${bucket}`,
      });

      notices.push({
        code: 'STRENGTH_AS_LANGUAGE',
        level: 'info',
        message: {
          de: `${cap?.model ?? input.tier} hat keinen Stärke-Regler. Der Wunsch wird als Satz im Prompt formuliert — das Modell kann ihn abschwächen.`,
          en: `${cap?.model ?? input.tier} has no strength parameter. Your setting is phrased as a sentence in the prompt, so the model may soften it.`,
          es: `${cap?.model ?? input.tier} no tiene parámetro de intensidad. Tu ajuste se formula como una frase del prompt, así que el modelo puede suavizarlo.`,
        },
      });
    }
  } else if (usesReference && !subjectRefs.length) {
    notices.push({
      code: 'STRENGTH_IGNORED',
      level: 'warn',
      message: {
        de: 'Ohne Vorlage-Bild wirkt der Regler nicht — es entsteht ein komplett neues Bild.',
        en: 'Without a template image the slider has no effect — a brand-new picture is created.',
        es: 'Sin imagen de plantilla el control no tiene efecto: se crea una imagen totalmente nueva.',
      },
    });
  }

  /* 3. style reference clause */
  if (styleRefs.length) {
    segments.push({
      source: 'reference',
      text: STYLE_REF_CLAUSE,
      label: { de: 'Stil-Referenz', en: 'Style reference', es: 'Referencia de estilo' },
    });
    appliedModifiers.push({ source: 'reference', id: 'reference:style-ref' });
  }

  /* 4. style preset — only when the user picked one */
  const modifier = styleModifierFor(input.style);
  if (modifier) {
    segments.push({
      source: 'style',
      text: `Style: ${modifier}.`,
      label: { de: 'Stil-Vorgabe', en: 'Style preset', es: 'Preajuste de estilo' },
    });
    appliedModifiers.push({ source: 'style', id: `style:${input.style}` });
    notices.push({
      code: 'STYLE_PRESET_APPLIED',
      level: 'info',
      message: {
        de: 'Die gewählte Stil-Vorgabe wird an deinen Text angehängt. Wähle „Kein Stil“, wenn nur deine Worte zählen sollen.',
        en: 'The selected style preset is appended to your text. Pick “No style” if only your own words should count.',
        es: 'El preajuste de estilo se añade a tu texto. Elige «Sin estilo» si solo deben contar tus palabras.',
      },
    });
  } else {
    notices.push({
      code: 'STYLE_NONE',
      level: 'info',
      message: {
        de: 'Kein Stil-Zusatz — dein Text geht unverändert an das Modell.',
        en: 'No style add-on — your text goes to the model unchanged.',
        es: 'Sin añadido de estilo: tu texto llega al modelo sin cambios.',
      },
    });
  }

  /* 5. brand kit */
  if (input.brandKit) {
    const brandParts: string[] = [];
    const colors = [input.brandKit.primaryColor, input.brandKit.secondaryColor, input.brandKit.accentColor]
      .filter(Boolean)
      .join(', ');
    if (colors) brandParts.push(`Brand colors: ${colors}`);
    if (input.brandKit.mood) brandParts.push(`Brand mood: ${input.brandKit.mood}`);
    if (input.brandKit.name) brandParts.push(`Visual identity aligned with ${input.brandKit.name}`);
    if (brandParts.length) {
      segments.push({
        source: 'brand',
        text: `${brandParts.join('. ')}.`,
        label: { de: 'Brand-Kit', en: 'Brand kit', es: 'Brand Kit' },
      });
    }
  }

  /* 6. transparency */
  let transparentBackground = false;
  if (input.transparentBackground) {
    if (supportsTransparency(input.tier)) {
      transparentBackground = true;
      notices.push({
        code: 'TRANSPARENCY_NATIVE',
        level: 'info',
        message: {
          de: 'Transparenter Hintergrund wird als PNG mit Alphakanal beim Anbieter angefordert.',
          en: 'A transparent background is requested from the provider as PNG with alpha channel.',
          es: 'Se solicita al proveedor un fondo transparente en PNG con canal alfa.',
        },
      });
    } else {
      notices.push({
        code: 'TRANSPARENCY_UNSUPPORTED',
        level: 'block',
        message: {
          de: `${cap?.model ?? input.tier} kann keinen transparenten Hintergrund erzeugen. Nutze dafür den Bereich „Hintergrund“ — dort wird der Hintergrund sauber freigestellt.`,
          en: `${cap?.model ?? input.tier} cannot produce a transparent background. Use the “Background” section instead — it cuts the background out cleanly.`,
          es: `${cap?.model ?? input.tier} no puede generar un fondo transparente. Usa la sección «Fondo», que recorta el fondo limpiamente.`,
        },
      });
    }
  }

  /* 7. negative terms */
  if (negativeTerms.length) {
    segments.push({
      source: 'negative',
      text: `Avoid: ${negativeTerms.join(', ')}.`,
      label: { de: 'Ausschlüsse', en: 'Exclusions', es: 'Exclusiones' },
    });
    notices.push({
      code: 'NEGATIVE_AS_LANGUAGE',
      level: 'warn',
      message: {
        de: 'Dein „--no“-Zusatz wird als Satz „Avoid: …“ mitgeschickt. Bildmodelle haben keinen echten Negativ-Prompt und können ihn ignorieren.',
        en: 'Your “--no” flag is sent as an “Avoid: …” sentence. Image models have no real negative prompt and may ignore it.',
        es: 'Tu indicador «--no» se envía como una frase «Avoid: …». Los modelos de imagen no tienen prompt negativo real y pueden ignorarlo.',
      },
    });
  }

  /* 8. aspect ratio — only for chat-shaped providers without a ratio field */
  if (cap?.provider === 'gateway' && cap.sizing.kind === 'ratio' && input.aspectRatio) {
    segments.push({
      source: 'format',
      text: `Aspect ratio: ${input.aspectRatio}.`,
      label: { de: 'Format', en: 'Format', es: 'Formato' },
    });
  }

  /* references that the mode does not use at all */
  if (input.mode === 'create' && (subjectRefs.length || styleRefs.length)) {
    notices.push({
      code: 'REFERENCES_IGNORED',
      level: 'warn',
      message: {
        de: 'Im Modus „Neues Bild“ werden Referenzbilder nicht mitgeschickt.',
        en: 'In “New picture” mode reference images are not sent.',
        es: 'En el modo «Nueva imagen» no se envían imágenes de referencia.',
      },
    });
  }

  return {
    prompt: segments.map((s) => s.text).join('\n\n').trim(),
    segments,
    negativeTerms,
    strengthValue,
    strengthField,
    transparentBackground,
    notices,
  };
}

/** First blocking notice, if any — callers must abort on it. */
export function blockingNotice(built: BuiltPictureRequest): PictureNotice | undefined {
  return built.notices.find((n) => n.level === 'block');
}

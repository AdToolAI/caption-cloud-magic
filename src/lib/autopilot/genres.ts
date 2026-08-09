import { tx } from "@/lib/i18nText";
/**
 * Genre recipes.
 *
 * The reason "anything the user could ask for" is tractable: every video type
 * reduces to a proven beat structure. The writer agent fills a recipe, it does
 * not invent dramaturgy from scratch. Adding a genre later is one entry here —
 * not a pipeline change.
 */

import type { AutopilotGenre, SceneBeat, ShotSize, CameraMove, LightingKey } from './types';

export interface GenreRecipe {
  id: AutopilotGenre;
  label: string;
  /** Shown in the treatment so the user understands the chosen structure. */
  description: string;
  /** Ordered narrative beats. Length defines the default scene count. */
  beats: SceneBeat[];
  /** Suggested shot size per beat index — the DP agent may override. */
  shotLadder: ShotSize[];
  defaultMoves: CameraMove[];
  defaultLighting: LightingKey;
  /** Does this genre normally carry spoken dialogue in-scene? */
  dialogueDriven: boolean;
  /** Seconds — used when the user gives no duration. */
  defaultDuration: number;
  musicMood: string;
}

export const GENRE_RECIPES: Record<AutopilotGenre, GenreRecipe> = {
  ad_spot: {
    id: 'ad_spot',
    label: tx({ de: 'Werbespot', en: 'Ad spot', es: 'Anuncio' }),
    description: tx({ de: 'Klassischer Spot: Problem sichtbar machen, Lösung zeigen, Beweis liefern, Handlungsaufruf.', en: 'Classic spot: Make the problem visible, show the solution, provide evidence, call to action.', es: 'Spot clásico: Visibilizar el problema, mostrar la solución, aportar evidencia, llamado a la acción.' }),
    beats: ['hook', 'problem', 'reveal', 'proof', 'benefit', 'cta'],
    shotLadder: ['close_up', 'medium', 'wide', 'insert', 'medium_close', 'medium'],
    defaultMoves: ['handheld', 'slow_push_in', 'slow_pull_out', 'static', 'rack_focus', 'static'],
    defaultLighting: 'soft_window',
    dialogueDriven: false,
    defaultDuration: 30,
    musicMood: 'uplifting modern pop, driving beat',
  },
  product_demo: {
    id: 'product_demo',
    label: tx({ de: 'Produktvideo', en: 'Product video', es: 'Video de producto' }),
    description: tx({ de: 'Das Produkt im Mittelpunkt: Kontext, Feature, Nutzen, Detail, Abbinder.', en: 'The product at the center: context, feature, benefit, detail, final card.', es: 'El producto en el centro: contexto, característica, beneficio, detalle, cierre.' }),
    beats: ['hook', 'reveal', 'benefit', 'proof', 'cta'],
    shotLadder: ['extreme_close_up', 'medium', 'insert', 'close_up', 'wide'],
    defaultMoves: ['slow_push_in', 'orbit', 'static', 'rack_focus', 'slow_pull_out'],
    defaultLighting: 'studio_softbox',
    dialogueDriven: false,
    defaultDuration: 25,
    musicMood: 'clean minimal electronic, confident',
  },
  corporate: {
    id: 'corporate',
    label: tx({ de: 'Unternehmensvideo', en: 'Corporate video', es: 'Video corporativo' }),
    description: tx({ de: 'Haltung und Menschen: Wer wir sind, wofür wir stehen, was wir bewegen.', en: 'Attitude and People: Who we are, what we stand for, what we achieve.', es: 'Actitud y personas: Quiénes somos, qué defendemos, qué logramos.' }),
    beats: ['hook', 'emotion', 'proof', 'benefit', 'cta'],
    shotLadder: ['wide', 'medium_close', 'over_shoulder', 'medium', 'wide'],
    defaultMoves: ['crane_down', 'handheld', 'static', 'slow_push_in', 'slow_pull_out'],
    defaultLighting: 'golden_hour',
    dialogueDriven: true,
    defaultDuration: 45,
    musicMood: 'warm cinematic piano and strings',
  },
  storytelling: {
    id: 'storytelling',
    label: tx({ de: 'Storytelling', en: 'Storytelling', es: 'Narrativa' }),
    description: tx({ de: 'Erzählbogen: Figur, Konflikt, Wendepunkt, Auflösung.', en: 'Narrative arc: character, conflict, turning point, resolution.', es: 'Arco narrativo: personaje, conflicto, punto de giro, resolución.' }),
    beats: ['hook', 'problem', 'emotion', 'reveal', 'benefit', 'cta'],
    shotLadder: ['extreme_wide', 'medium_close', 'close_up', 'wide', 'medium', 'medium_close'],
    defaultMoves: ['static', 'handheld', 'slow_push_in', 'pan_right', 'rack_focus', 'slow_pull_out'],
    defaultLighting: 'low_key',
    dialogueDriven: true,
    defaultDuration: 45,
    musicMood: 'emotional cinematic score, slow build',
  },
  testimonial: {
    id: 'testimonial',
    label: tx({ de: 'Testimonial', en: 'Testimonial', es: 'Testimonio' }),
    description: tx({ de: 'Eine Person, eine ehrliche Aussage, unterlegt mit Belegbildern.', en: 'One person, one honest statement, supported by evidence images.', es: 'Una persona, una declaración honesta, respaldada por imágenes de prueba.' }),
    beats: ['hook', 'problem', 'proof', 'benefit', 'cta'],
    shotLadder: ['medium_close', 'medium_close', 'insert', 'medium_close', 'medium'],
    defaultMoves: ['static', 'handheld', 'static', 'static', 'slow_push_in'],
    defaultLighting: 'soft_window',
    dialogueDriven: true,
    defaultDuration: 30,
    musicMood: 'subtle warm underscore, low presence',
  },
  explainer: {
    id: 'explainer',
    label: tx({ de: 'Erklärvideo', en: 'Explainer video', es: 'Video explicativo' }),
    description: tx({ de: 'Schritt für Schritt: Ausgangslage, Vorgehen, Ergebnis.', en: 'Step by step: initial situation, procedure, result.', es: 'Paso a paso: situación inicial, procedimiento, resultado.' }),
    beats: ['hook', 'problem', 'reveal', 'proof', 'cta'],
    shotLadder: ['medium', 'wide', 'insert', 'medium', 'wide'],
    defaultMoves: ['static', 'overhead_top_down', 'static', 'slow_push_in', 'static'],
    defaultLighting: 'high_key',
    dialogueDriven: true,
    defaultDuration: 40,
    musicMood: 'light playful marimba, neutral',
  },
  social_hook: {
    id: 'social_hook',
    label: tx({ de: 'Social Hook', en: 'Social hook', es: 'Gancho social' }),
    description: tx({ de: 'Maximal kurz, maximal auffällig — für Reels, Shorts und TikTok.', en: 'As short as possible, as striking as possible — for Reels, Shorts, and TikTok.', es: 'Lo más corto posible, lo más llamativo posible — para Reels, Shorts y TikTok.' }),
    beats: ['hook', 'reveal', 'benefit', 'cta'],
    shotLadder: ['extreme_close_up', 'medium', 'insert', 'medium_close'],
    defaultMoves: ['whip_pan', 'handheld', 'rack_focus', 'slow_push_in'],
    defaultLighting: 'neon_night',
    dialogueDriven: false,
    defaultDuration: 15,
    musicMood: 'high-energy trap beat, punchy',
  },
  image_post: {
    id: 'image_post',
    label: tx({ de: 'Bild-Post', en: 'Image post', es: 'Publicación de imagen' }),
    description: tx({ de: 'Ein einzelnes starkes Motiv — endet nach dem Anker, ohne Animation.', en: 'A single strong motif — ends after the anchor, without animation.', es: 'Un único motivo fuerte — termina después del ancla, sin animación.' }),
    beats: ['hook'],
    shotLadder: ['medium'],
    defaultMoves: ['static'],
    defaultLighting: 'soft_window',
    dialogueDriven: false,
    defaultDuration: 0,
    musicMood: '',
  },
};

export const GENRE_LIST: GenreRecipe[] = Object.values(GENRE_RECIPES);

/**
 * Keyword routing as a cheap first pass. The LLM genre router still runs, but
 * an obvious brief ("Bild für Instagram") should not need a model call.
 */
const GENRE_KEYWORDS: Array<{ genre: AutopilotGenre; match: RegExp }> = [
  { genre: 'image_post', match: /\b(bild|foto|image|picture|post|grafik)\b/i },
  { genre: 'testimonial', match: /\b(testimonial|kundenstimme|erfahrungsbericht|review)\b/i },
  { genre: 'explainer', match: /\b(erklär|explainer|tutorial|anleitung|how.?to)\b/i },
  { genre: 'corporate', match: /\b(unternehmen|corporate|imagefilm|firmen|recruiting|karriere)\b/i },
  { genre: 'storytelling', match: /\b(story|geschichte|storytelling|narrativ|emotional)\b/i },
  { genre: 'product_demo', match: /\b(produkt|product|demo|feature|unboxing)\b/i },
  { genre: 'social_hook', match: /\b(reel|short|tiktok|hook|viral)\b/i },
  { genre: 'ad_spot', match: /\b(werbe|werbung|spot|anzeige|ad\b|kampagne)\b/i },
];

export function routeGenreByKeyword(brief: string): AutopilotGenre | null {
  for (const { genre, match } of GENRE_KEYWORDS) {
    if (match.test(brief)) return genre;
  }
  return null;
}

export function getRecipe(genre: AutopilotGenre): GenreRecipe {
  return GENRE_RECIPES[genre] ?? GENRE_RECIPES.ad_spot;
}

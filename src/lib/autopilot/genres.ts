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
    label: 'Werbespot',
    description: 'Klassischer Spot: Problem sichtbar machen, Lösung zeigen, Beweis liefern, Handlungsaufruf.',
    beats: ['hook', 'problem', 'reveal', 'proof', 'benefit', 'cta'],
    shotLadder: ['close_up', 'medium', 'wide', 'insert', 'medium_close', 'medium'],
    defaultMoves: ['handheld', 'slow_push_in', 'wide' as never, 'insert' as never, 'rack_focus', 'static'],
    defaultLighting: 'soft_window',
    dialogueDriven: false,
    defaultDuration: 30,
    musicMood: 'uplifting modern pop, driving beat',
  },
  product_demo: {
    id: 'product_demo',
    label: 'Produktvideo',
    description: 'Das Produkt im Mittelpunkt: Kontext, Feature, Nutzen, Detail, Abbinder.',
    beats: ['hook', 'reveal', 'benefit', 'proof', 'cta'],
    shotLadder: ['extreme_close_up', 'medium', 'insert', 'close_up', 'wide'],
    defaultMoves: ['slow_push_in', 'orbit', 'insert' as never, 'rack_focus', 'slow_pull_out'],
    defaultLighting: 'studio_softbox',
    dialogueDriven: false,
    defaultDuration: 25,
    musicMood: 'clean minimal electronic, confident',
  },
  corporate: {
    id: 'corporate',
    label: 'Unternehmensvideo',
    description: 'Haltung und Menschen: Wer wir sind, wofür wir stehen, was wir bewegen.',
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
    label: 'Storytelling',
    description: 'Erzählbogen: Figur, Konflikt, Wendepunkt, Auflösung.',
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
    label: 'Testimonial',
    description: 'Eine Person, eine ehrliche Aussage, unterlegt mit Belegbildern.',
    beats: ['hook', 'problem', 'proof', 'benefit', 'cta'],
    shotLadder: ['medium_close', 'medium_close', 'insert', 'medium_close', 'medium'],
    defaultMoves: ['static', 'handheld', 'insert' as never, 'static', 'slow_push_in'],
    defaultLighting: 'soft_window',
    dialogueDriven: true,
    defaultDuration: 30,
    musicMood: 'subtle warm underscore, low presence',
  },
  explainer: {
    id: 'explainer',
    label: 'Erklärvideo',
    description: 'Schritt für Schritt: Ausgangslage, Vorgehen, Ergebnis.',
    beats: ['hook', 'problem', 'reveal', 'proof', 'cta'],
    shotLadder: ['medium', 'overhead_top_down' as never, 'insert', 'medium', 'wide'],
    defaultMoves: ['static', 'overhead_top_down', 'insert' as never, 'slow_push_in', 'static'],
    defaultLighting: 'high_key',
    dialogueDriven: true,
    defaultDuration: 40,
    musicMood: 'light playful marimba, neutral',
  },
  social_hook: {
    id: 'social_hook',
    label: 'Social Hook',
    description: 'Maximal kurz, maximal auffällig — für Reels, Shorts und TikTok.',
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
    label: 'Bild-Post',
    description: 'Ein einzelnes starkes Motiv — endet nach dem Anker, ohne Animation.',
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

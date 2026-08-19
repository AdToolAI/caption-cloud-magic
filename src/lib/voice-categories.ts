/**
 * Kuratierte Stimmen-Kategorien.
 * Jede Kategorie ist eine reine Facetten-Vorbelegung auf `list-voices`
 * (use_case / gender / age / accent) — kein zusätzlicher Server-Endpunkt nötig.
 */

import { tx } from '@/lib/i18nText';

export type VoiceCategoryId =
  | 'all'
  | 'mine'
  | 'ads'
  | 'narration'
  | 'characters'
  | 'news'
  | 'young'
  | 'mature';

export interface VoiceCategoryFacets {
  use_case?: string | string[] | null;
  age?: 'young' | 'middle_aged' | 'old' | null;
  gender?: 'male' | 'female' | 'neutral' | null;
}

export interface VoiceCategory {
  id: VoiceCategoryId;
  icon: string;
  label: string;
  hint: string;
  facets: VoiceCategoryFacets;
}

/** Localized at call time so a language switch re-renders with fresh labels. */
export function getVoiceCategories(): VoiceCategory[] {
  return [
    { id: 'all',        icon: '🎧', label: tx({ de: 'Alle Stimmen', en: 'All voices', es: 'Todas las voces' }), hint: tx({ de: 'Komplette Bibliothek', en: 'Complete library', es: 'Biblioteca completa' }), facets: {} },
    { id: 'mine',       icon: '⭐', label: tx({ de: 'Meine Stimmen', en: 'My voices', es: 'Mis voces' }), hint: tx({ de: 'Eigene Voice-Clones', en: 'Your own voice clones', es: 'Tus clones de voz' }), facets: {} },
    { id: 'ads',        icon: '📣', label: tx({ de: 'Werbung & Ads', en: 'Ads & promos', es: 'Anuncios y promos' }), hint: tx({ de: 'Energisch, verkaufsstark', en: 'Energetic, sales-driven', es: 'Enérgicas, orientadas a ventas' }), facets: { use_case: ['advertisement', 'social_media'] } },
    { id: 'narration',  icon: '🎙️', label: tx({ de: 'Erzähler & Hörbuch', en: 'Narration & audiobook', es: 'Narración y audiolibro' }), hint: tx({ de: 'Ruhig, tragfähig, lange Texte', en: 'Calm, steady, long-form', es: 'Calmadas, estables, textos largos' }), facets: { use_case: 'narrative_story' } },
    { id: 'characters', icon: '🎭', label: tx({ de: 'Charaktere & Rollen', en: 'Characters & roles', es: 'Personajes y roles' }), hint: tx({ de: 'Dialog, Rollen, Lip-Sync', en: 'Dialogue, roles, lip-sync', es: 'Diálogo, roles, lip-sync' }), facets: { use_case: 'characters_animation' } },
    { id: 'news',       icon: '📰', label: tx({ de: 'Nachrichten & Seriös', en: 'News & serious', es: 'Noticias y formal' }), hint: tx({ de: 'Klar, sachlich, vertrauenswürdig', en: 'Clear, factual, trustworthy', es: 'Claras, objetivas, fiables' }), facets: { use_case: 'informative_educational' } },
    { id: 'young',      icon: '🧒', label: tx({ de: 'Jung & Frisch', en: 'Young & fresh', es: 'Jóvenes y frescas' }), hint: tx({ de: 'Junge Sprecher:innen', en: 'Young speakers', es: 'Locutores jóvenes' }), facets: { age: 'young' } },
    { id: 'mature',     icon: '👔', label: tx({ de: 'Reif & Autoritär', en: 'Mature & authoritative', es: 'Maduras y con autoridad' }), hint: tx({ de: 'Erfahrene, tiefe Stimmen', en: 'Experienced, deep voices', es: 'Voces experimentadas y graves' }), facets: { age: 'old' } },
  ];
}

export function getVoiceCategory(id?: VoiceCategoryId | null): VoiceCategory {
  const cats = getVoiceCategories();
  return cats.find((c) => c.id === id) ?? cats[0];
}

/* ── „Zuletzt verwendet" ─────────────────────────────────────── */

export interface RecentVoiceEntry {
  id: string;
  name: string;
  language: string;
}

const RECENT_KEY = 'adtool.voices.recent.v1';
const RECENT_MAX = 8;

export function readRecentVoices(): RecentVoiceEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.id === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentVoice(entry: RecentVoiceEntry): void {
  try {
    const next = [entry, ...readRecentVoices().filter((v) => v.id !== entry.id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled — nicht kritisch */
  }
}

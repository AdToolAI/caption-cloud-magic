/**
 * Kuratierte Stimmen-Kategorien.
 * Jede Kategorie ist eine reine Facetten-Vorbelegung auf `list-voices`
 * (use_case / gender / age / accent) — kein zusätzlicher Server-Endpunkt nötig.
 */

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
  use_case?: 'narration' | 'conversational' | 'characters' | 'social_media' | 'news' | null;
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

export const VOICE_CATEGORIES: VoiceCategory[] = [
  { id: 'all',        icon: '🎧', label: 'Alle Stimmen',        hint: 'Komplette Bibliothek',            facets: {} },
  { id: 'mine',       icon: '⭐', label: 'Meine Stimmen',        hint: 'Eigene Voice-Clones',             facets: {} },
  { id: 'ads',        icon: '📣', label: 'Werbung & Ads',        hint: 'Energisch, verkaufsstark',        facets: { use_case: 'social_media' } },
  { id: 'narration',  icon: '🎙️', label: 'Erzähler & Hörbuch',   hint: 'Ruhig, tragfähig, lange Texte',   facets: { use_case: 'narration' } },
  { id: 'characters', icon: '🎭', label: 'Charaktere & Rollen',  hint: 'Dialog, Rollen, Lip-Sync',        facets: { use_case: 'characters' } },
  { id: 'news',       icon: '📰', label: 'Nachrichten & Seriös', hint: 'Klar, sachlich, vertrauenswürdig', facets: { use_case: 'news' } },
  { id: 'young',      icon: '🧒', label: 'Jung & Frisch',        hint: 'Junge Sprecher:innen',            facets: { age: 'young' } },
  { id: 'mature',     icon: '👔', label: 'Reif & Autoritär',     hint: 'Erfahrene, tiefe Stimmen',        facets: { age: 'old' } },
];

export function getVoiceCategory(id?: VoiceCategoryId | null): VoiceCategory {
  return VOICE_CATEGORIES.find((c) => c.id === id) ?? VOICE_CATEGORIES[0];
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

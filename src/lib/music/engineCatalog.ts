import { tx } from "@/lib/i18nText";
// Music Engine Catalog — single source of truth for Music Studio.
// Adding a new provider = one new entry here.
// Legacy tier IDs (quick/standard/pro) are mapped to current engines via LEGACY_TIER_ALIAS below.

export interface MusicLanguage {
  code: string;
  label: string;
  flag: string;
  name: string; // English full name for prompt directive
}

export type MusicPricingModel = 'flat' | 'per-second';

export interface MusicEngine {
  id: string;
  label: string;         // Card label (short)
  provider: string;      // Engine name shown to user
  subtitle: string;      // One-line UX subtitle
  description: string;   // Longer description
  vocals: boolean;       // Native vocal support
  requiresLyrics: boolean;
  supportsInstrumentalToggle: boolean;
  supportsLoop: boolean;
  supportsStyleField: boolean; // Suno-style genre-tag input
  maxDuration: number;   // seconds
  priceEur: number;      // retail flat price OR reference price @ maxDuration for per-second engines
  pricingModel?: MusicPricingModel; // default 'flat'
  priceEurPerSecond?: number; // required when pricingModel === 'per-second'
  languages: MusicLanguage[]; // empty = instrumental-only
  route: 'replicate';
  replicateModel?: string;
  order: number;
  badge?: string;        // e.g. "NEW"
  comingSoon?: boolean;  // true = card visible but disabled until secret configured
}


const EL_LANGS: MusicLanguage[] = [
  { code: 'en', label: tx({ de: 'Englisch', en: 'English', es: 'Inglés' }),      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: tx({ de: 'Deutsch', en: 'German', es: 'Alemán' }),       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: tx({ de: 'Spanisch', en: 'Spanish', es: 'Español' }),      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: tx({ de: 'Französisch', en: 'French', es: 'Francés' }),   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: tx({ de: 'Italienisch', en: 'Italian', es: 'Italiano' }),   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: tx({ de: 'Portugiesisch', en: 'Portuguese', es: 'Portugués' }), flag: '🇵🇹', name: 'Portuguese' },
  { code: 'nl', label: tx({ de: 'Niederländisch', en: 'Dutch', es: 'Neerlandés' }), flag: '🇳🇱', name: 'Dutch' },
  { code: 'pl', label: tx({ de: 'Polnisch', en: 'Polish', es: 'Polaco' }),      flag: '🇵🇱', name: 'Polish' },
  { code: 'ja', label: tx({ de: 'Japanisch', en: 'Japanese', es: 'Japonés' }),     flag: '🇯🇵', name: 'Japanese' },
];

const MINIMAX_LANGS: MusicLanguage[] = [
  { code: 'en', label: tx({ de: 'Englisch', en: 'English', es: 'Inglés' }),      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: tx({ de: 'Deutsch', en: 'German', es: 'Alemán' }),       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: tx({ de: 'Spanisch', en: 'Spanish', es: 'Español' }),      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: tx({ de: 'Französisch', en: 'French', es: 'Francés' }),   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: tx({ de: 'Italienisch', en: 'Italian', es: 'Italiano' }),   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: tx({ de: 'Portugiesisch', en: 'Portuguese', es: 'Portugués' }), flag: '🇵🇹', name: 'Portuguese' },
  { code: 'ja', label: tx({ de: 'Japanisch', en: 'Japanese', es: 'Japonés' }),     flag: '🇯🇵', name: 'Japanese' },
  { code: 'ko', label: tx({ de: 'Koreanisch', en: 'Korean', es: 'Coreano' }),    flag: '🇰🇷', name: 'Korean' },
  { code: 'zh', label: tx({ de: 'Chinesisch', en: 'Chinese', es: 'Chino' }),    flag: '🇨🇳', name: 'Chinese' },
];

const LYRIA_LANGS: MusicLanguage[] = [
  { code: 'en', label: tx({ de: 'Englisch', en: 'English', es: 'Inglés' }),      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: tx({ de: 'Deutsch', en: 'German', es: 'Alemán' }),       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: tx({ de: 'Spanisch', en: 'Spanish', es: 'Español' }),      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: tx({ de: 'Französisch', en: 'French', es: 'Francés' }),   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: tx({ de: 'Italienisch', en: 'Italian', es: 'Italiano' }),   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: tx({ de: 'Portugiesisch', en: 'Portuguese', es: 'Portugués' }), flag: '🇵🇹', name: 'Portuguese' },
  { code: 'ja', label: tx({ de: 'Japanisch', en: 'Japanese', es: 'Japonés' }),     flag: '🇯🇵', name: 'Japanese' },
];


export const ENGINE_CATALOG: Record<string, MusicEngine> = {
  'stable-audio-25': {
    id: 'stable-audio-25',
    label: 'Adaptive',
    provider: 'Stable Audio 2.5',
    subtitle: tx({ de: 'Hintergrund & Loops', en: 'Background & Loops', es: 'Fondo y Bucles' }),
    description: tx({ de: 'Hintergrundmusik, nahtlose Loops, bis ~3 Min.', en: 'Background music, seamless loops, up to ~3 min.', es: 'Música de fondo, bucles perfectos, hasta ~3 min.' }),
    vocals: false,
    requiresLyrics: false,
    supportsInstrumentalToggle: false,
    supportsLoop: true,
    supportsStyleField: false,
    maxDuration: 190,
    priceEur: 0.55,
    pricingModel: 'flat',
    languages: [],
    route: 'replicate',
    replicateModel: 'stability-ai/stable-audio-2.5',
    order: 10,
  },
  'minimax-15': {
    id: 'minimax-15',
    label: 'Vocal Mini',
    provider: 'MiniMax Music 1.5',
    subtitle: tx({ de: 'Schnelle Song-Skizze', en: 'Quick song sketch', es: 'Boceto rápido de canción' }),
    description: tx({ de: 'Songs mit Vocals & Lyrics, bis 60s.', en: 'Songs with vocals & lyrics, up to the 60s.', es: 'Canciones con voz y letra, hasta los años 60.' }),
    vocals: true,
    requiresLyrics: true,
    supportsInstrumentalToggle: false,
    supportsLoop: false,
    supportsStyleField: false,
    maxDuration: 60,
    priceEur: 0.30,
    languages: MINIMAX_LANGS,
    route: 'replicate',
    replicateModel: 'minimax/music-1.5',
    order: 30,
  },
  'elevenlabs-music-v2': {
    id: 'elevenlabs-music-v2',
    label: 'Vocal Studio',
    provider: 'ElevenLabs Music v2',
    subtitle: tx({ de: 'Beste Gesamtlösung', en: 'Best overall solution', es: 'Mejor solución general' }),
    description: tx({ de: 'Cineastische Songs & polierte Instrumentals, bis 5 Min. Beste Gesamtqualität laut interner Bewertung.', en: 'Cinematic songs & polished instrumentals, up to 5 min. Best overall quality according to internal rating.', es: 'Canciones cinematográficas e instrumentales pulidos, hasta 5 min. La mejor calidad general según la calificación interna.' }),
    vocals: true,
    requiresLyrics: false,
    supportsInstrumentalToggle: true,
    supportsLoop: false,
    supportsStyleField: false,
    maxDuration: 300,
    priceEur: 6.90, // reference @ 300s (per-second engine)
    pricingModel: 'per-second',
    priceEurPerSecond: 0.023,
    languages: EL_LANGS,
    route: 'replicate',
    replicateModel: 'elevenlabs/music',
    order: 40,
    badge: '⭐ TOP',
  },
  'lyria-3-pro': {
    id: 'lyria-3-pro',
    label: 'Vocal Pro',
    provider: 'Google Lyria 3 Pro',
    subtitle: tx({ de: 'Google – bis 3 Min.', en: 'Google – up to 3 min.', es: 'Google: hasta 3 min.' }),
    description: tx({ de: 'Google Lyria 3 Pro über Replicate — radio-nahe Vocal-Qualität, Songs bis ~3 Min.', en: 'Google Lyria 3 Pro via Replicate — radio-near vocal quality, songs up to ~3 min.', es: 'Google Lyria 3 Pro vía Replicate: calidad vocal cercana a la radio, canciones de hasta ~3 min.' }),
    vocals: true,
    requiresLyrics: false,
    supportsInstrumentalToggle: true,
    supportsLoop: false,
    supportsStyleField: false,
    maxDuration: 180,
    priceEur: 0.42,
    languages: LYRIA_LANGS,
    route: 'replicate',
    replicateModel: 'google/lyria-3-pro',
    order: 50,
    badge: 'NEW',
  },
};


export type MusicEngineId = keyof typeof ENGINE_CATALOG;

export const ENGINE_ORDER: MusicEngineId[] = Object.values(ENGINE_CATALOG)
  .sort((a, b) => a.order - b.order)
  .map((e) => e.id as MusicEngineId);

// Map legacy tier IDs (quick/adaptive/standard/vocal/pro) to new engine IDs.
export const LEGACY_TIER_ALIAS: Record<string, MusicEngineId> = {
  quick:                  'stable-audio-25',
  adaptive:               'stable-audio-25',
  standard:               'elevenlabs-music-v2',
  vocal:                  'minimax-15',
  pro:                    'elevenlabs-music-v2',
  'suno-v5':              'elevenlabs-music-v2',
  'stable-audio-open-2':  'stable-audio-25',
  'stable-audio-3-large': 'elevenlabs-music-v2',
};


export function resolveEngineId(idOrTier: string): MusicEngineId {
  if (ENGINE_CATALOG[idOrTier]) return idOrTier as MusicEngineId;
  if (LEGACY_TIER_ALIAS[idOrTier]) return LEGACY_TIER_ALIAS[idOrTier];
  return 'stable-audio-25';
}

export function getEngine(id: string): MusicEngine {
  return ENGINE_CATALOG[resolveEngineId(id)];
}

export function isLanguageSupported(engineId: string, code: string): boolean {
  return getEngine(engineId).languages.some((l) => l.code === code);
}

export function getLanguageMeta(engineId: string, code: string): MusicLanguage | undefined {
  return getEngine(engineId).languages.find((l) => l.code === code);
}

export function engineHasVocals(engineId: string, instrumental: boolean): boolean {
  const e = getEngine(engineId);
  if (!e.vocals) return false;
  if (!e.supportsInstrumentalToggle) return true;
  return !instrumental;
}

/**
 * Canonical price computation. Used by UI *and* mirrored in the
 * generate-music-track edge function for wallet deduction.
 *   flat        → priceEur (fixed per generation)
 *   per-second  → priceEurPerSecond × requestedSeconds (Replicate bills per second)
 */
export function computeMusicPrice(engineId: string, durationSeconds: number): number {
  const e = getEngine(engineId);
  if (e.pricingModel === 'per-second' && e.priceEurPerSecond) {
    const secs = Math.max(1, Math.min(e.maxDuration, Math.round(durationSeconds || e.maxDuration)));
    return Math.round(e.priceEurPerSecond * secs * 100) / 100;
  }
  return e.priceEur;
}

export function formatMusicPriceBadge(engineId: string, currencySymbol: string): string {
  const e = getEngine(engineId);
  if (e.pricingModel === 'per-second' && e.priceEurPerSecond) {
    return `${currencySymbol}${e.priceEurPerSecond.toFixed(3)}/s • ≤${e.maxDuration}s`;
  }
  return `${currencySymbol}${e.priceEur.toFixed(2)} • ≤${e.maxDuration}s`;
}

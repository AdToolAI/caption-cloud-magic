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
  { code: 'en', label: 'Englisch',      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: 'Deutsch',       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: 'Spanisch',      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: 'Französisch',   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: 'Italienisch',   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
  { code: 'nl', label: 'Niederländisch', flag: '🇳🇱', name: 'Dutch' },
  { code: 'pl', label: 'Polnisch',      flag: '🇵🇱', name: 'Polish' },
  { code: 'ja', label: 'Japanisch',     flag: '🇯🇵', name: 'Japanese' },
];

const MINIMAX_LANGS: MusicLanguage[] = [
  { code: 'en', label: 'Englisch',      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: 'Deutsch',       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: 'Spanisch',      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: 'Französisch',   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: 'Italienisch',   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
  { code: 'ja', label: 'Japanisch',     flag: '🇯🇵', name: 'Japanese' },
  { code: 'ko', label: 'Koreanisch',    flag: '🇰🇷', name: 'Korean' },
  { code: 'zh', label: 'Chinesisch',    flag: '🇨🇳', name: 'Chinese' },
];

const LYRIA_LANGS: MusicLanguage[] = [
  { code: 'en', label: 'Englisch',      flag: '🇬🇧', name: 'English' },
  { code: 'de', label: 'Deutsch',       flag: '🇩🇪', name: 'German' },
  { code: 'es', label: 'Spanisch',      flag: '🇪🇸', name: 'Spanish' },
  { code: 'fr', label: 'Französisch',   flag: '🇫🇷', name: 'French' },
  { code: 'it', label: 'Italienisch',   flag: '🇮🇹', name: 'Italian' },
  { code: 'pt', label: 'Portugiesisch', flag: '🇵🇹', name: 'Portuguese' },
  { code: 'ja', label: 'Japanisch',     flag: '🇯🇵', name: 'Japanese' },
];


export const ENGINE_CATALOG: Record<string, MusicEngine> = {
  'stable-audio-25': {
    id: 'stable-audio-25',
    label: 'Adaptive',
    provider: 'Stable Audio 2.5',
    subtitle: 'Background & Loops',
    description: 'Background music, seamless loops, bis ~3 min.',
    vocals: false,
    requiresLyrics: false,
    supportsInstrumentalToggle: false,
    supportsLoop: true,
    supportsStyleField: false,
    maxDuration: 190,
    priceEur: 0.15,
    languages: [],
    route: 'replicate',
    replicateModel: 'stability-ai/stable-audio-2.5',
    order: 10,
  },
  'minimax-15': {
    id: 'minimax-15',
    label: 'Vocal Mini',
    provider: 'MiniMax Music 1.5',
    subtitle: 'Schnelle Song-Skizze',
    description: 'Songs mit Vocals & Lyrics, bis 60s.',
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
    subtitle: 'Beste Gesamtlösung',
    description: 'Cinematic Songs & polierte Instrumentals, bis 5 min. Beste Gesamtqualität laut interner Bewertung.',
    vocals: true,
    requiresLyrics: false,
    supportsInstrumentalToggle: true,
    supportsLoop: false,
    supportsStyleField: false,
    maxDuration: 300,
    priceEur: 0.36,
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
    subtitle: 'Google – bis 3 Min.',
    description: 'Google Lyria 3 Pro über Replicate — radio-nahe Vocal-Qualität, Songs bis ~3 Min.',
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
    badge: 'NEU',
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

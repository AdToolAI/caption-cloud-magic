/**
 * Universal Catalog — stable IDs for every selectable scene axis.
 *
 * Wave 1 of the Universal-ID-Contract (v178). This module is the single
 * source of truth for non-library choices (Mimik / Gestik / Blick / Energy
 * / Framing / Angle / Movement / Lighting / Delivery / Music-Energy /
 * Style-Preset). Library items (Character / Outfit / Location / Prop /
 * Building / Voice) keep their existing UUIDs and are NOT in this catalog.
 *
 * IDs are lowercase, snake_case, namespaced with a dot:
 *   `framing.medium_close_up`, `mimik.warm_smile`, `lighting.golden_hour`
 *
 * Adding entries is safe — synonyms keep old free-text values matching.
 * Renaming an entry requires bumping CATALOG_VERSION so consumers can
 * re-resolve.
 */

export const CATALOG_VERSION = 1;

export type CatalogAxis =
  | 'mimik'
  | 'gestik'
  | 'blick'
  | 'energy'
  | 'framing'
  | 'angle'
  | 'movement'
  | 'lighting'
  | 'delivery'
  | 'music_energy'
  | 'style_preset';

export interface CatalogEntry {
  /** Fully-qualified id, e.g. `framing.medium_close_up`. */
  id: string;
  /** Short id without namespace, e.g. `medium_close_up`. */
  slug: string;
  label_de: string;
  label_en: string;
  /** English token injected into AI prompts. Stays stable across UI languages. */
  engine_hint: string;
  /** Lower-cased synonyms (DE/EN/legacy spellings) for fuzzy resolution. */
  synonyms: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const entry = (
  axis: CatalogAxis,
  slug: string,
  label_de: string,
  label_en: string,
  engine_hint: string,
  synonyms: string[] = [],
): CatalogEntry => ({
  id: `${axis}.${slug}`,
  slug,
  label_de,
  label_en,
  engine_hint,
  synonyms: [
    slug,
    slug.replace(/_/g, '-'),
    slug.replace(/_/g, ' '),
    label_de,
    label_en,
    engine_hint,
    ...synonyms,
  ].map(norm).filter(Boolean),
});

// ─── Catalog data ───────────────────────────────────────────────────────────

const MIMIK: CatalogEntry[] = [
  entry('mimik', 'neutral',        'Neutral',           'Neutral',          'neutral expression'),
  entry('mimik', 'confident',      'Selbstbewusst',     'Confident',        'confident expression', ['selbstsicher','souverän','assured']),
  entry('mimik', 'warm_smile',     'Warmes Lächeln',    'Warm smile',       'warm subtle smile', ['lächeln','smile','warmes lacheln']),
  entry('mimik', 'big_smile',      'Breites Lächeln',   'Big smile',        'broad genuine smile', ['grinsen','grin']),
  entry('mimik', 'serious',        'Ernst',             'Serious',          'serious focused expression', ['fokussiert','focused']),
  entry('mimik', 'curious',        'Neugierig',         'Curious',          'curious raised brows', ['interessiert','interested']),
  entry('mimik', 'concerned',      'Besorgt',           'Concerned',        'concerned worried expression', ['worried','sorgenvoll']),
  entry('mimik', 'surprised',      'Überrascht',        'Surprised',        'surprised wide eyes', ['shocked','geschockt']),
  entry('mimik', 'thoughtful',     'Nachdenklich',      'Thoughtful',       'thoughtful pondering look', ['pondering','grübelnd']),
  entry('mimik', 'determined',     'Entschlossen',      'Determined',       'determined set jaw', ['resolute','willensstark']),
  entry('mimik', 'amused',         'Amüsiert',          'Amused',           'amused playful look', ['playful','verspielt']),
  entry('mimik', 'empathetic',     'Empathisch',        'Empathetic',       'empathetic caring expression', ['caring','mitfühlend']),
];

const GESTIK: CatalogEntry[] = [
  entry('gestik', 'still',            'Ruhig / still',     'Still',            'still upper body, hands at rest'),
  entry('gestik', 'open_palms',       'Offene Hände',      'Open palms',       'open palms gesture', ['offene handflächen','open hands']),
  entry('gestik', 'point_to_camera',  'Zur Kamera zeigen', 'Point to camera',  'pointing toward the camera', ['zeigen','pointing']),
  entry('gestik', 'count_fingers',    'Finger zählen',     'Counting fingers', 'counting on fingers gesture', ['aufzählen','enumerate']),
  entry('gestik', 'thumbs_up',        'Daumen hoch',       'Thumbs up',        'thumbs up gesture'),
  entry('gestik', 'hands_explain',    'Erklärende Hände',  'Explaining hands', 'natural explaining hand motion', ['erklärend','gesticulating']),
  entry('gestik', 'hand_to_chest',    'Hand auf Brust',    'Hand on chest',    'hand to chest sincere gesture', ['sincere','aufrichtig']),
  entry('gestik', 'arms_crossed',     'Arme verschränkt',  'Arms crossed',     'arms crossed posture'),
  entry('gestik', 'lean_forward',     'Nach vorne lehnen', 'Lean forward',     'leaning forward into the camera', ['lean in']),
  entry('gestik', 'shrug',            'Schulterzucken',    'Shrug',            'casual shoulder shrug'),
];

const BLICK: CatalogEntry[] = [
  entry('blick', 'to_camera',     'In die Kamera',    'To camera',     'eye contact with camera', ['direkt','direct']),
  entry('blick', 'away',          'Weggewandt',       'Looking away',  'gaze averted off-camera'),
  entry('blick', 'down',          'Nach unten',       'Looking down',  'gaze downward', ['nachdenklich blick']),
  entry('blick', 'up',            'Nach oben',        'Looking up',    'gaze upward, contemplative'),
  entry('blick', 'side_left',     'Links',            'Looking left',  'gaze to the left'),
  entry('blick', 'side_right',    'Rechts',           'Looking right', 'gaze to the right'),
  entry('blick', 'at_object',     'Auf Objekt',       'At object',     'gaze on a held object', ['auf produkt','at product']),
  entry('blick', 'at_partner',    'Auf Gegenüber',    'At partner',    'gaze at scene partner', ['interlocutor','gegenüber']),
];

const ENERGY: CatalogEntry[] = [
  entry('energy', 'very_low',  'Sehr ruhig', 'Very low',  'very calm restrained energy', ['1','sehr niedrig']),
  entry('energy', 'low',       'Ruhig',      'Low',       'calm low energy',             ['2','niedrig']),
  entry('energy', 'mid',       'Mittel',     'Mid',       'balanced mid energy',         ['3','medium','neutral energy']),
  entry('energy', 'high',      'Hoch',       'High',      'high engaged energy',         ['4','hoch','energetic']),
  entry('energy', 'very_high', 'Sehr hoch',  'Very high', 'very high explosive energy',  ['5','sehr hoch','explosive']),
];

const FRAMING: CatalogEntry[] = [
  entry('framing', 'extreme_wide',     'Extreme Totale',  'Extreme wide',     'extreme wide shot',     ['xws','extreme-wide','ews']),
  entry('framing', 'wide',             'Totale',          'Wide',             'wide shot',             ['ws','weit','establishing wide']),
  entry('framing', 'medium_wide',      'Halbtotale',      'Medium wide',      'medium wide shot',      ['mws','medium-wide']),
  entry('framing', 'medium',           'Halbnah',         'Medium',           'medium shot',           ['ms','medium shot']),
  entry('framing', 'medium_close_up',  'Nahe',            'Medium close-up',  'medium close-up shot',  ['mcu','medium-close-up','nah']),
  entry('framing', 'close_up',         'Großaufnahme',    'Close-up',         'close-up shot',         ['cu','close-up','nahaufnahme']),
  entry('framing', 'extreme_close_up', 'Detail',          'Extreme close-up', 'extreme close-up shot', ['ecu','extreme-close-up','makro']),
  entry('framing', 'establishing',     'Establishing',    'Establishing',     'establishing shot',     ['etablierende einstellung']),
];

const ANGLE: CatalogEntry[] = [
  entry('angle', 'eye_level',         'Augenhöhe',          'Eye-level',         'eye-level angle',           ['neutral angle','augenhohe']),
  entry('angle', 'low',               'Untersicht',         'Low angle',         'low angle looking up',      ['froschperspektive','low-angle']),
  entry('angle', 'high',              'Aufsicht',           'High angle',        'high angle looking down',   ['vogelperspektive','high-angle']),
  entry('angle', 'dutch',             'Dutch / Schräg',     'Dutch angle',       'dutch tilted angle',        ['canted','schräg','dutch-angle']),
  entry('angle', 'over_shoulder',     'Über Schulter',      'Over the shoulder', 'over-the-shoulder angle',   ['ots','schulter']),
  entry('angle', 'three_quarter',     'Dreiviertel',        'Three-quarter',     'three-quarter angle',       ['3/4']),
  entry('angle', 'profile',           'Profil',             'Profile',           'profile side angle'),
  entry('angle', 'frontal',           'Frontal',            'Frontal',           'frontal angle facing camera'),
];

const MOVEMENT: CatalogEntry[] = [
  entry('movement', 'static',         'Statisch',          'Static',           'locked-off static camera',   ['fixed','locked']),
  entry('movement', 'slow_push_in',   'Langsamer Push-In', 'Slow push-in',     'slow push-in',               ['slow-push-in','push in slow','dolly-in slow']),
  entry('movement', 'push_in',        'Push-In',           'Push-in',          'push-in',                    ['dolly in']),
  entry('movement', 'pull_out',       'Pull-Out',          'Pull-out',         'pull-out',                   ['dolly out','rückzug']),
  entry('movement', 'pan_left',       'Schwenk links',     'Pan left',         'pan left',                   ['pan-left']),
  entry('movement', 'pan_right',      'Schwenk rechts',    'Pan right',        'pan right',                  ['pan-right']),
  entry('movement', 'tilt_up',        'Tilt up',           'Tilt up',          'tilt up'),
  entry('movement', 'tilt_down',      'Tilt down',         'Tilt down',        'tilt down'),
  entry('movement', 'tracking',       'Tracking',          'Tracking',         'tracking shot',              ['follow','verfolgung']),
  entry('movement', 'handheld',       'Handkamera',        'Handheld',         'handheld camera',            ['handgehalten']),
  entry('movement', 'orbital',        'Orbital',           'Orbital',          'orbital camera motion',      ['orbit','rundfahrt']),
  entry('movement', 'crane_up',       'Kran hoch',         'Crane up',         'crane up',                   ['jib up']),
  entry('movement', 'crane_down',     'Kran runter',       'Crane down',       'crane down',                 ['jib down']),
  entry('movement', 'lean_in',        'Lean-In',           'Lean-in',          'subtle lean-in'),
];

const LIGHTING: CatalogEntry[] = [
  entry('lighting', 'natural',         'Natürlich',         'Natural',         'natural ambient light'),
  entry('lighting', 'soft_window',     'Weiches Fensterlicht','Soft window',   'soft window light',           ['fensterlicht','soft daylight']),
  entry('lighting', 'hard_window',     'Hartes Fensterlicht','Hard window',    'hard directional window light'),
  entry('lighting', 'golden_hour',     'Golden Hour',       'Golden hour',     'warm golden hour light',      ['goldene stunde']),
  entry('lighting', 'blue_hour',       'Blue Hour',         'Blue hour',       'cool blue hour light',        ['blaue stunde']),
  entry('lighting', 'low_key',         'Low-Key',           'Low-key',         'low-key moody lighting',      ['moody','dunkel']),
  entry('lighting', 'high_key',        'High-Key',          'High-key',        'high-key bright even lighting', ['hell','bright']),
  entry('lighting', 'rim',             'Rimlight',          'Rim light',       'rim back-light separation'),
  entry('lighting', 'backlit',         'Gegenlicht',        'Backlit',         'strong backlight silhouette'),
  entry('lighting', 'practical',       'Praktisch (Lampen)','Practical',       'practical in-scene lamps',    ['lampen']),
  entry('lighting', 'studio_softbox',  'Studio Softbox',    'Studio softbox',  'studio softbox key light'),
  entry('lighting', 'neon',            'Neon',              'Neon',            'neon colored lighting',       ['cyberpunk']),
  entry('lighting', 'overcast',        'Bewölkt',           'Overcast',        'overcast diffuse light'),
];

const DELIVERY: CatalogEntry[] = [
  entry('delivery', 'warm',         'Warm',          'Warm',         'warm friendly delivery',         ['freundlich','friendly']),
  entry('delivery', 'calm',         'Ruhig',         'Calm',         'calm measured delivery',         ['gelassen','measured']),
  entry('delivery', 'urgent',       'Dringend',      'Urgent',       'urgent pressing delivery',       ['eilig','pressing']),
  entry('delivery', 'energetic',    'Energetisch',   'Energetic',    'energetic upbeat delivery',      ['upbeat','schwungvoll']),
  entry('delivery', 'authoritative','Autoritär',     'Authoritative','authoritative confident delivery', ['bestimmt','commanding']),
  entry('delivery', 'conversational','Locker',       'Conversational','conversational casual delivery', ['casual','natürlich']),
  entry('delivery', 'whisper',      'Flüstern',      'Whisper',      'soft whispered delivery'),
  entry('delivery', 'inspirational','Inspirierend',  'Inspirational','inspirational uplifting delivery', ['motivierend']),
];

const MUSIC_ENERGY: CatalogEntry[] = [
  entry('music_energy', 'silent',  'Stille',     'Silent',  'no music',                       ['none','keine musik']),
  entry('music_energy', 'low',     'Niedrig',    'Low',     'low-energy ambient bed',         ['ambient','ruhig']),
  entry('music_energy', 'mid',     'Mittel',     'Mid',     'mid-tempo motivational',         ['medium','motivational']),
  entry('music_energy', 'high',    'Hoch',       'High',    'high-energy driving beat',       ['driving','energetic']),
  entry('music_energy', 'cinematic','Cinematic', 'Cinematic','cinematic orchestral build',    ['filmisch','orchestral']),
];

// Mirror of the 12 Cinematic Style Presets used in the Toolkit.
const STYLE_PRESET: CatalogEntry[] = [
  entry('style_preset', 'documentary',      'Dokumentarisch',   'Documentary',       'documentary handheld realism'),
  entry('style_preset', 'commercial_clean', 'Werbung clean',    'Commercial clean',  'clean commercial product look', ['ad clean']),
  entry('style_preset', 'cinematic_film',   'Cinematic Film',   'Cinematic film',    'cinematic 35mm film look',      ['kino','35mm']),
  entry('style_preset', 'noir',             'Film Noir',        'Noir',              'high-contrast black-and-white noir', ['schwarzweiß']),
  entry('style_preset', 'vintage_super8',   'Vintage Super 8',  'Vintage Super 8',   'grainy super-8 vintage'),
  entry('style_preset', 'high_fashion',     'High Fashion',     'High fashion',      'editorial high-fashion lighting'),
  entry('style_preset', 'pastel_dream',     'Pastell-Traum',    'Pastel dream',      'soft pastel dreamlike palette'),
  entry('style_preset', 'cyberpunk_neon',   'Cyberpunk',        'Cyberpunk neon',    'neon cyberpunk palette'),
  entry('style_preset', 'golden_hour_warm', 'Goldene Stunde',   'Golden-hour warm',  'warm golden-hour glow'),
  entry('style_preset', 'monochrome',       'Monochrom',        'Monochrome',        'desaturated monochrome look'),
  entry('style_preset', 'high_energy_sport','High-Energy Sport','High-energy sport', 'high-energy sport edit'),
  entry('style_preset', 'tech_minimal',     'Tech minimal',     'Tech minimal',      'minimal tech product look'),
];

const ALL: Record<CatalogAxis, CatalogEntry[]> = {
  mimik: MIMIK,
  gestik: GESTIK,
  blick: BLICK,
  energy: ENERGY,
  framing: FRAMING,
  angle: ANGLE,
  movement: MOVEMENT,
  lighting: LIGHTING,
  delivery: DELIVERY,
  music_energy: MUSIC_ENERGY,
  style_preset: STYLE_PRESET,
};

// Index by (axis → synonym → entry) for O(1) lookup.
const INDEX: Record<CatalogAxis, Map<string, CatalogEntry>> = Object.fromEntries(
  (Object.keys(ALL) as CatalogAxis[]).map((axis) => {
    const m = new Map<string, CatalogEntry>();
    for (const e of ALL[axis]) {
      for (const syn of e.synonyms) {
        if (syn && !m.has(syn)) m.set(syn, e);
      }
      // Also index the fully-qualified id (e.g. `framing.medium_close_up`).
      m.set(norm(e.id), e);
    }
    return [axis, m];
  }),
) as Record<CatalogAxis, Map<string, CatalogEntry>>;

// ─── Public API ─────────────────────────────────────────────────────────────

/** List all entries for an axis — for Dropdowns / Pickers. */
export function listCatalog(axis: CatalogAxis): readonly CatalogEntry[] {
  return ALL[axis];
}

/** Resolve a free-text value (any language, legacy spelling, KI-output) to a catalog id, or `null`. */
export function resolveCatalogId(axis: CatalogAxis, raw: unknown): string | null {
  const n = norm(raw);
  if (!n) return null;
  const idx = INDEX[axis];

  // 1. exact synonym hit
  const exact = idx.get(n);
  if (exact) return exact.id;

  // 2. substring match — needle in synonym or synonym in needle
  for (const [syn, e] of idx) {
    if (syn.length < 3) continue;
    if (n.includes(syn) || syn.includes(n)) return e.id;
  }
  return null;
}

/** Get the catalog entry for a fully-qualified id (e.g. `framing.wide`). */
export function getCatalogEntry(axis: CatalogAxis, id: string | null | undefined): CatalogEntry | null {
  if (!id) return null;
  const hit = ALL[axis].find((e) => e.id === id);
  return hit ?? null;
}

/** Localized label for UI. */
export function getCatalogLabel(
  axis: CatalogAxis,
  id: string | null | undefined,
  lang: 'de' | 'en' = 'de',
): string | null {
  const e = getCatalogEntry(axis, id);
  if (!e) return null;
  return lang === 'en' ? e.label_en : e.label_de;
}

/** English prompt token for the AI render layer. */
export function getCatalogPromptToken(axis: CatalogAxis, id: string | null | undefined): string | null {
  const e = getCatalogEntry(axis, id);
  return e?.engine_hint ?? null;
}

// Motion Studio Pro – Director Preset Library (Phase 3)
//
// These presets transform plain prompts into cinematic directives by appending
// short, professional modifier phrases (camera, lens, lighting, mood). They are
// designed to match the language Sora 2, Kling, Hailuo and Veo 3 respond to best.
//
// Source: prompt-engineering tests across all 6 video models in our studio,
// distilled into reusable building blocks (similar to Artlist Studio's
// "Director's Toolkit", but transparent and editable).

export type PresetCategory = 'camera' | 'lens' | 'lighting' | 'mood' | 'film-stock';

export interface DirectorPreset {
  id: string;
  category: PresetCategory;
  /** Short label shown in the picker. */
  label: string;
  /** Phrase appended to the prompt (English, Sora-friendly). */
  modifier: string;
  /** UX hint describing the look. */
  description: string;
  /** Emoji for quick visual scanning. */
  icon: string;
}

export interface DirectorModifiers {
  camera?: string;       // preset id
  lens?: string;
  lighting?: string;
  mood?: string;
  filmStock?: string;
}

export const DIRECTOR_PRESETS: DirectorPreset[] = [
  // ─── Camera Movement ───────────────────────────────────────────
  { id: 'cam-static',     category: 'camera', icon: '🎥', label: 'Static Tripod',
    modifier: 'static tripod shot, locked-off camera',
    description: 'Klassischer fester Standpunkt — ruhig, professionell.' },
  { id: 'cam-dolly-in',   category: 'camera', icon: '🎥', label: 'Slow Dolly In',
    modifier: 'slow dolly-in push, smooth cinematic motion',
    description: 'Langsame Annäherung — baut Spannung auf.' },
  { id: 'cam-tracking',   category: 'camera', icon: '🎥', label: 'Tracking Shot',
    modifier: 'smooth lateral tracking shot, gimbal stabilized',
    description: 'Seitliche Verfolgung — modern, dynamisch.' },
  { id: 'cam-handheld',   category: 'camera', icon: '🎥', label: 'Handheld',
    modifier: 'handheld camera, subtle natural shake, documentary feel',
    description: 'Authentisch, dokumentarisch.' },
  { id: 'cam-crane',      category: 'camera', icon: '🎥', label: 'Crane Down',
    modifier: 'crane shot descending from high angle to eye level',
    description: 'Episches Reveal von oben.' },
  { id: 'cam-orbit',      category: 'camera', icon: '🎥', label: 'Orbit 360°',
    modifier: 'slow 360-degree orbit around subject',
    description: 'Kreis um Subjekt — Premium-Look.' },
  { id: 'cam-fpv',        category: 'camera', icon: '🎥', label: 'FPV Drone',
    modifier: 'fast FPV drone shot, dynamic flying through space',
    description: 'Wie Action-Cinematic — sehr energisch.' },

  // ─── Lens / Focal Length ───────────────────────────────────────
  { id: 'lens-anamorphic', category: 'lens', icon: '🔭', label: 'Anamorphic 2x',
    modifier: 'anamorphic lens, 2.39:1 aspect, horizontal lens flares, oval bokeh',
    description: 'Hollywood-Kinolook mit horizontalen Flares.' },
  { id: 'lens-wide-24',    category: 'lens', icon: '🔭', label: 'Wide 24mm',
    modifier: 'wide-angle 24mm lens, expansive depth, slight edge distortion',
    description: 'Weitwinkel — viel Raum.' },
  { id: 'lens-portrait-85', category: 'lens', icon: '🔭', label: 'Portrait 85mm',
    modifier: '85mm portrait lens, shallow depth of field, creamy bokeh',
    description: 'Klassisches Porträt-Tele.' },
  { id: 'lens-macro',      category: 'lens', icon: '🔭', label: 'Macro Close-Up',
    modifier: 'extreme macro close-up, razor-thin focus plane, hyper-detailed',
    description: 'Detailaufnahmen — Produkt, Auge, Textur.' },
  { id: 'lens-tilt-shift', category: 'lens', icon: '🔭', label: 'Tilt-Shift',
    modifier: 'tilt-shift lens effect, miniature scale illusion',
    description: 'Mini-Welt-Effekt.' },

  // ─── Lighting ──────────────────────────────────────────────────
  { id: 'light-golden',   category: 'lighting', icon: '💡', label: 'Golden Hour',
    modifier: 'warm golden hour lighting, low sun, long shadows, amber tones',
    description: 'Warmes Sonnenuntergangslicht.' },
  { id: 'light-blue-hour', category: 'lighting', icon: '💡', label: 'Blue Hour',
    modifier: 'cool blue hour lighting, soft twilight, muted contrast',
    description: 'Magische Dämmerung.' },
  { id: 'light-noir',     category: 'lighting', icon: '💡', label: 'Film Noir',
    modifier: 'high-contrast film noir lighting, hard shadows, single key light',
    description: 'Kontrastreich, dramatisch.' },
  { id: 'light-softbox',  category: 'lighting', icon: '💡', label: 'Studio Softbox',
    modifier: 'professional studio softbox lighting, even soft shadows, beauty light',
    description: 'Sauber, kommerziell — Beauty/Produkt.' },
  { id: 'light-neon',     category: 'lighting', icon: '💡', label: 'Neon / Cyberpunk',
    modifier: 'cyberpunk neon lighting, pink and cyan rim light, wet reflections',
    description: 'Cyberpunk-Vibe.' },
  { id: 'light-natural',  category: 'lighting', icon: '💡', label: 'Natural Window',
    modifier: 'soft natural window light, organic falloff, daylight tones',
    description: 'Natürliches Tageslicht.' },
  { id: 'light-volumetric', category: 'lighting', icon: '💡', label: 'God Rays',
    modifier: 'volumetric god rays piercing through atmosphere, dust particles',
    description: 'Mystische Lichtstrahlen.' },

  // ─── Mood / Color Grading ──────────────────────────────────────
  { id: 'mood-blockbuster', category: 'mood', icon: '🎨', label: 'Blockbuster Teal-Orange',
    modifier: 'blockbuster teal-and-orange color grade, rich contrast',
    description: 'Hollywood-Standard-Grading.' },
  { id: 'mood-pastel',    category: 'mood', icon: '🎨', label: 'Pastel Dream',
    modifier: 'soft pastel color palette, dreamy desaturated mood',
    description: 'Verträumt, ruhig.' },
  { id: 'mood-bw',        category: 'mood', icon: '🎨', label: 'Black & White',
    modifier: 'high-contrast black and white, classic monochrome cinematography',
    description: 'Zeitlos, künstlerisch.' },
  { id: 'mood-vibrant',   category: 'mood', icon: '🎨', label: 'Vibrant Saturated',
    modifier: 'vibrant saturated colors, punchy contrast, social-media ready',
    description: 'Knallig — Social Media.' },
  { id: 'mood-moody-dark', category: 'mood', icon: '🎨', label: 'Moody Dark',
    modifier: 'moody dark color grade, deep shadows, low-key atmosphere',
    description: 'Düster, atmosphärisch.' },

  // ─── Film Stock ────────────────────────────────────────────────
  { id: 'stock-kodak',    category: 'film-stock', icon: '🎞️', label: 'Kodak 35mm',
    modifier: 'Kodak 35mm film grain, organic texture, warm highlights',
    description: 'Analoger Kinofilm-Look.' },
  { id: 'stock-super8',   category: 'film-stock', icon: '🎞️', label: 'Super 8',
    modifier: 'Super 8 film aesthetic, heavy grain, vintage saturated colors',
    description: '70er-Jahre Heimvideo.' },
  { id: 'stock-arri',     category: 'film-stock', icon: '🎞️', label: 'ARRI Alexa',
    modifier: 'shot on ARRI Alexa, clean digital cinema, true-to-life skin tones',
    description: 'Modern digital cinema.' },
  { id: 'stock-red',      category: 'film-stock', icon: '🎞️', label: 'RED Komodo',
    modifier: 'shot on RED Komodo 6K, sharp detail, rich color science',
    description: 'High-End digital.' },
  { id: 'stock-vhs',      category: 'film-stock', icon: '🎞️', label: 'VHS Retro',
    modifier: 'VHS tape aesthetic, scan lines, chromatic aberration, lo-fi',
    description: 'Nostalgischer 90er-Look.' },
];

export const PRESETS_BY_CATEGORY: Record<PresetCategory, DirectorPreset[]> =
  DIRECTOR_PRESETS.reduce((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {} as Record<PresetCategory, DirectorPreset[]>);

export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  camera: 'Kamera',
  lens: 'Objektiv',
  lighting: 'Licht',
  mood: 'Color Grade',
  'film-stock': 'Film-Stock',
};

export function getPresetById(id?: string | null): DirectorPreset | undefined {
  if (!id) return undefined;
  return DIRECTOR_PRESETS.find((p) => p.id === id);
}

/**
 * Append director modifier phrases to a base prompt.
 * Order matters: camera → lens → lighting → mood → film-stock,
 * which mirrors how cinematographers describe shots.
 */
export function applyDirectorModifiers(basePrompt: string, mods: DirectorModifiers): string {
  const ordered: (keyof DirectorModifiers)[] = ['camera', 'lens', 'lighting', 'mood', 'filmStock'];
  const phrases = ordered
    .map((k) => getPresetById(mods[k])?.modifier)
    .filter(Boolean) as string[];
  if (phrases.length === 0) return basePrompt;
  const trimmed = basePrompt.trim().replace(/[.,;]\s*$/, '');
  return `${trimmed}. ${phrases.join(', ')}.`;
}

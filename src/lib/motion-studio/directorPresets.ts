import { tx } from "@/lib/i18nText";
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
    description: tx({ de: 'Klassischer fester Standpunkt — ruhig, professionell.', en: 'Classic fixed point of view — calm, professional.', es: 'Punto de vista fijo clásico: tranquilo, profesional.' }) },
  { id: 'cam-dolly-in',   category: 'camera', icon: '🎥', label: 'Slow Dolly In',
    modifier: 'slow dolly-in push, smooth cinematic motion',
    description: tx({ de: 'Langsame Annäherung — baut Spannung auf.', en: 'Slow approach – builds tension.', es: 'Enfoque lento: genera tensión.' }) },
  { id: 'cam-tracking',   category: 'camera', icon: '🎥', label: 'Tracking Shot',
    modifier: 'smooth lateral tracking shot, gimbal stabilized',
    description: tx({ de: 'Seitliche Verfolgung — modern, dynamisch.', en: 'Lateral tracking — modern, dynamic.', es: 'Seguimiento lateral: moderno, dinámico.' }) },
  { id: 'cam-handheld',   category: 'camera', icon: '🎥', label: 'Handheld',
    modifier: 'handheld camera, subtle natural shake, documentary feel',
    description: tx({ de: 'Authentisch, dokumentarisch.', en: 'Authentic, documentary.', es: 'Auténtico, documental.' }) },
  { id: 'cam-crane',      category: 'camera', icon: '🎥', label: 'Crane Down',
    modifier: 'crane shot descending from high angle to eye level',
    description: tx({ de: 'Episches Reveal von oben.', en: 'Epic reveal from above.', es: 'Revelación épica desde arriba.' }) },
  { id: 'cam-orbit',      category: 'camera', icon: '🎥', label: 'Orbit 360°',
    modifier: 'slow 360-degree orbit around subject',
    description: tx({ de: 'Kreis um Subjekt — Premium-Look.', en: 'Circle around subject — premium look.', es: 'Círculo alrededor del sujeto: aspecto premium.' }) },
  { id: 'cam-fpv',        category: 'camera', icon: '🎥', label: 'FPV Drone',
    modifier: 'fast FPV drone shot, dynamic flying through space',
    description: tx({ de: 'Wie Action-Cinematic — sehr energisch.', en: 'Like action cinematic — very energetic.', es: 'Como el cine de acción: muy enérgico.' }) },

  // ─── Lens / Focal Length ───────────────────────────────────────
  { id: 'lens-anamorphic', category: 'lens', icon: '🔭', label: 'Anamorphic 2x',
    modifier: 'anamorphic lens, 2.39:1 aspect, horizontal lens flares, oval bokeh',
    description: tx({ de: 'Hollywood-Kinolook mit horizontalen Flares.', en: 'Hollywood cinema look with horizontal flares.', es: 'Look de cine de Hollywood con bengalas horizontales.' }) },
  { id: 'lens-wide-24',    category: 'lens', icon: '🔭', label: 'Wide 24mm',
    modifier: 'wide-angle 24mm lens, expansive depth, slight edge distortion',
    description: tx({ de: 'Weitwinkel — viel Raum.', en: 'Wide angle — lots of space.', es: 'Gran angular: mucho espacio.' }) },
  { id: 'lens-portrait-85', category: 'lens', icon: '🔭', label: 'Portrait 85mm',
    modifier: '85mm portrait lens, shallow depth of field, creamy bokeh',
    description: tx({ de: 'Klassisches Porträt-Tele.', en: 'Classic portrait telephoto.', es: 'Teleobjetivo de retrato clásico.' }) },
  { id: 'lens-macro',      category: 'lens', icon: '🔭', label: 'Macro Close-Up',
    modifier: 'extreme macro close-up, razor-thin focus plane, hyper-detailed',
    description: tx({ de: 'Detailaufnahmen — Produkt, Auge, Textur.', en: 'Detail shots — product, eye, texture.', es: 'Fotografías de detalle: producto, ojo, textura.' }) },
  { id: 'lens-tilt-shift', category: 'lens', icon: '🔭', label: 'Tilt-Shift',
    modifier: 'tilt-shift lens effect, miniature scale illusion',
    description: tx({ de: 'Mini-Welt-Effekt.', en: 'Mini world effect.', es: 'Efecto mini mundo.' }) },

  // ─── Lighting ──────────────────────────────────────────────────
  { id: 'light-golden',   category: 'lighting', icon: '💡', label: 'Golden Hour',
    modifier: 'warm golden hour lighting, low sun, long shadows, amber tones',
    description: tx({ de: 'Warmes Sonnenuntergangslicht.', en: 'Warm sunset light.', es: 'Cálida luz del atardecer.' }) },
  { id: 'light-blue-hour', category: 'lighting', icon: '💡', label: 'Blue Hour',
    modifier: 'cool blue hour lighting, soft twilight, muted contrast',
    description: tx({ de: 'Magische Dämmerung.', en: 'Magical twilight.', es: 'Atardecer mágico.' }) },
  { id: 'light-noir',     category: 'lighting', icon: '💡', label: 'Film Noir',
    modifier: 'high-contrast film noir lighting, hard shadows, single key light',
    description: tx({ de: 'Kontrastreich, dramatisch.', en: 'High contrast, dramatic.', es: 'Contrastado, dramático.' }) },
  { id: 'light-softbox',  category: 'lighting', icon: '💡', label: 'Studio Softbox',
    modifier: 'professional studio softbox lighting, even soft shadows, beauty light',
    description: tx({ de: 'Sauber, kommerziell — Beauty/Produkt.', en: 'Clean, commercial — beauty/product.', es: 'Limpio, comercial — belleza/producto.' }) },
  { id: 'light-neon',     category: 'lighting', icon: '💡', label: 'Neon / Cyberpunk',
    modifier: 'cyberpunk neon lighting, pink and cyan rim light, wet reflections',
    description: tx({ de: 'Cyberpunk-Vibe.', en: 'Cyberpunk vibe.', es: 'Ambiente cyberpunk.' }) },
  { id: 'light-natural',  category: 'lighting', icon: '💡', label: 'Natural Window',
    modifier: 'soft natural window light, organic falloff, daylight tones',
    description: tx({ de: 'Natürliches Tageslicht.', en: 'Natural daylight.', es: 'Luz natural.' }) },
  { id: 'light-volumetric', category: 'lighting', icon: '💡', label: 'God Rays',
    modifier: 'volumetric god rays piercing through atmosphere, dust particles',
    description: tx({ de: 'Mystische Lichtstrahlen.', en: 'Mystical light rays.', es: 'Rayos de luz místicos.' }) },

  // ─── Mood / Color Grading ──────────────────────────────────────
  { id: 'mood-blockbuster', category: 'mood', icon: '🎨', label: 'Blockbuster Teal-Orange',
    modifier: 'blockbuster teal-and-orange color grade, rich contrast',
    description: tx({ de: 'Hollywood-Standard-Grading.', en: 'Hollywood standard grading.', es: 'Calificación estándar de Hollywood.' }) },
  { id: 'mood-pastel',    category: 'mood', icon: '🎨', label: 'Pastel Dream',
    modifier: 'soft pastel color palette, dreamy desaturated mood',
    description: tx({ de: 'Verträumt, ruhig.', en: 'Dreamy, calm.', es: 'Soñador, tranquilo.' }) },
  { id: 'mood-bw',        category: 'mood', icon: '🎨', label: 'Black & White',
    modifier: 'high-contrast black and white, classic monochrome cinematography',
    description: tx({ de: 'Zeitlos, künstlerisch.', en: 'Timeless, artistic.', es: 'Atemporal, artístico.' }) },
  { id: 'mood-vibrant',   category: 'mood', icon: '🎨', label: 'Vibrant Saturated',
    modifier: 'vibrant saturated colors, punchy contrast, social-media ready',
    description: tx({ de: 'Knallig — Social Media.', en: 'Flashy — social media.', es: 'Llamativo — redes sociales.' }) },
  { id: 'mood-moody-dark', category: 'mood', icon: '🎨', label: 'Moody Dark',
    modifier: 'moody dark color grade, deep shadows, low-key atmosphere',
    description: tx({ de: 'Düster, atmosphärisch.', en: 'Dark, atmospheric.', es: 'Sombrío, atmosférico.' }) },

  // ─── Film Stock ────────────────────────────────────────────────
  { id: 'stock-kodak',    category: 'film-stock', icon: '🎞️', label: 'Kodak 35mm',
    modifier: 'Kodak 35mm film grain, organic texture, warm highlights',
    description: tx({ de: 'Analoger Kinofilm-Look.', en: 'Analog cinema film look.', es: 'Look de película de cine analógico.' }) },
  { id: 'stock-super8',   category: 'film-stock', icon: '🎞️', label: 'Super 8',
    modifier: 'Super 8 film aesthetic, heavy grain, vintage saturated colors',
    description: tx({ de: '70er-Jahre Heimvideo.', en: '70s home video.', es: 'Vídeo casero de los años 70.' }) },
  { id: 'stock-arri',     category: 'film-stock', icon: '🎞️', label: 'ARRI Alexa',
    modifier: 'shot on ARRI Alexa, clean digital cinema, true-to-life skin tones',
    description: tx({ de: 'Modernes digitales Kino.', en: 'Modern digital cinema.', es: 'Cine digital moderno.' }) },
  { id: 'stock-red',      category: 'film-stock', icon: '🎞️', label: 'RED Komodo',
    modifier: 'shot on RED Komodo 6K, sharp detail, rich color science',
    description: tx({ de: 'High-End digital.', en: 'High-end digital.', es: 'Digital de gama alta.' }) },
  { id: 'stock-vhs',      category: 'film-stock', icon: '🎞️', label: 'VHS Retro',
    modifier: 'VHS tape aesthetic, scan lines, chromatic aberration, lo-fi',
    description: tx({ de: 'Nostalgischer 90er-Look.', en: 'Nostalgic 90s look.', es: 'Look nostálgico de los 90.' }) },
];

export const PRESETS_BY_CATEGORY: Record<PresetCategory, DirectorPreset[]> =
  DIRECTOR_PRESETS.reduce((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {} as Record<PresetCategory, DirectorPreset[]>);

export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  camera: tx({ de: 'Kamera', en: 'Camera', es: 'Cámara' }),
  lens: tx({ de: 'Objektiv', en: 'Lens', es: 'Objetivo' }),
  lighting: tx({ de: 'Licht', en: 'Lighting', es: 'Luz' }),
  mood: tx({ de: 'Color Grade', en: 'Color grade', es: 'Grado de color' }),
  'film-stock': tx({ de: 'Film-Stock', en: 'Film stock', es: 'Stock de película' }),
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

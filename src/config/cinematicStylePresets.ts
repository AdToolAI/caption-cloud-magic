/**
 * Cinematic Style Presets — One-Click "Director Looks".
 *
 * Each preset bundles a complete Shot Director selection (framing + angle +
 * movement + lighting) into a recognizable directorial style. Inspired by
 * iconic film aesthetics — labeled with neutral descriptive names to avoid
 * trademark issues.
 *
 * Presets are layered ON TOP of the user's prompt via `buildShotPromptSuffix`.
 */

import type { ShotSelection } from './shotDirector';

export interface CinematicStylePreset {
  id: string;
  /** Localized display name (UI). */
  name: { en: string; de: string; es: string };
  /** Short evocative description (UI tooltip). */
  description: { en: string; de: string; es: string };
  /** Visual emoji/icon hint for the chip. */
  emoji: string;
  /** The combined Shot Director selection this preset applies. */
  selection: ShotSelection;
  /** Optional accent gradient for the card (HSL triplets). */
  accent: string;
}

export const CINEMATIC_STYLE_PRESETS: CinematicStylePreset[] = [
  {
    id: 'symmetric-storybook',
    emoji: '🎀',
    name: { en: 'Symmetric Storybook', de: 'Symmetrisches Storybook', es: 'Cuento simétrico' },
    description: {
      en: 'Centered, eye-level, dollhouse symmetry, soft diffused light.',
      de: 'Zentriert, Augenhöhe, Puppenhaus-Symmetrie, weiches Licht.',
      es: 'Centrado, simétrico, luz suave de estudio.',
    },
    selection: { framing: 'medium', angle: 'eye-level', movement: 'dolly-right', lighting: 'soft-studio' },
    accent: '340 70% 70%',
  },
  {
    id: 'high-octane-action',
    emoji: '💥',
    name: { en: 'High-Octane Action', de: 'High-Octane Action', es: 'Acción explosiva' },
    description: {
      en: 'Low angle hero shot, orbital motion, golden hour silhouette.',
      de: 'Heldenperspektive, Orbit, goldene Stunde mit Silhouette.',
      es: 'Plano heroico, órbita, hora dorada.',
    },
    selection: { framing: 'wide', angle: 'low-angle', movement: 'orbit-right', lighting: 'golden-hour' },
    accent: '15 90% 60%',
  },
  {
    id: 'slow-burn-arthouse',
    emoji: '🕯️',
    name: { en: 'Slow-Burn Arthouse', de: 'Slow-Burn Arthouse', es: 'Cine de autor' },
    description: {
      en: 'Patient close-up, natural overcast light, locked-down camera.',
      de: 'Geduldiger Close-Up, natürliches Licht, statische Kamera.',
      es: 'Primer plano paciente, luz natural, cámara fija.',
    },
    selection: { framing: 'close-up', angle: 'eye-level', movement: 'static', lighting: 'overcast-natural' },
    accent: '40 30% 65%',
  },
  {
    id: 'noir-detective',
    emoji: '🌑',
    name: { en: 'Noir Detective', de: 'Noir-Detektiv', es: 'Detective Noir' },
    description: {
      en: 'Dutch tilt, hard shadows, slow push-in for tension.',
      de: 'Schräglage, harte Schatten, langsamer Push-In.',
      es: 'Inclinación, sombras duras, acercamiento lento.',
    },
    selection: { framing: 'medium-close', angle: 'dutch-tilt', movement: 'push-in', lighting: 'hard-noir' },
    accent: '0 0% 35%',
  },
  {
    id: 'cyberpunk-neon',
    emoji: '🌃',
    name: { en: 'Cyberpunk Neon', de: 'Cyberpunk Neon', es: 'Neón Cyberpunk' },
    description: {
      en: 'POV through neon-soaked streets, handheld energy.',
      de: 'POV durch Neon-Straßen, dynamische Handkamera.',
      es: 'POV por calles neón, cámara en mano.',
    },
    selection: { framing: 'medium', angle: 'pov', movement: 'handheld', lighting: 'neon-cyberpunk' },
    accent: '290 95% 65%',
  },
  {
    id: 'epic-fantasy',
    emoji: '🏔️',
    name: { en: 'Epic Fantasy', de: 'Epic Fantasy', es: 'Fantasía épica' },
    description: {
      en: 'Bird\'s eye establishing, crane reveal, volumetric god rays.',
      de: 'Bird\'s Eye, Kran-Reveal, volumetrische Lichtstrahlen.',
      es: 'Vista aérea, grúa, rayos volumétricos.',
    },
    selection: { framing: 'extreme-wide', angle: 'birds-eye', movement: 'crane-down', lighting: 'volumetric' },
    accent: '210 80% 60%',
  },
  {
    id: 'documentary-realism',
    emoji: '🎥',
    name: { en: 'Documentary Realism', de: 'Doku-Realismus', es: 'Documental realista' },
    description: {
      en: 'Over-the-shoulder, handheld, soft natural daylight.',
      de: 'Über-die-Schulter, Handkamera, natürliches Tageslicht.',
      es: 'Sobre el hombro, cámara en mano, luz natural.',
    },
    selection: { framing: 'medium', angle: 'over-shoulder', movement: 'handheld', lighting: 'overcast-natural' },
    accent: '120 25% 55%',
  },
  {
    id: 'romantic-dreamy',
    emoji: '💫',
    name: { en: 'Romantic Dream', de: 'Romantischer Traum', es: 'Sueño romántico' },
    description: {
      en: 'Two-shot, golden hour backlight, slow orbital motion.',
      de: 'Two-Shot, goldenes Gegenlicht, langsamer Orbit.',
      es: 'Plano de dos, contraluz dorado, órbita lenta.',
    },
    selection: { framing: 'two-shot', angle: 'eye-level', movement: 'orbit-left', lighting: 'golden-hour' },
    accent: '30 80% 70%',
  },
  {
    id: 'thriller-suspense',
    emoji: '🔪',
    name: { en: 'Thriller Suspense', de: 'Thriller Spannung', es: 'Suspense' },
    description: {
      en: 'Extreme close-up on details, candlelight, locked camera.',
      de: 'Extreme Großaufnahme, Kerzenlicht, statische Kamera.',
      es: 'Primerísimo primer plano, velas, cámara fija.',
    },
    selection: { framing: 'extreme-close', angle: 'eye-level', movement: 'static', lighting: 'candlelight' },
    accent: '5 70% 50%',
  },
  {
    id: 'sci-fi-mystery',
    emoji: '🛸',
    name: { en: 'Sci-Fi Mystery', de: 'Sci-Fi Mystery', es: 'Misterio sci-fi' },
    description: {
      en: 'Worm\'s eye reveal, slow pull-out, cool blue hour.',
      de: 'Bodensicht-Reveal, langsamer Pull-Out, blaue Stunde.',
      es: 'Vista de gusano, alejamiento, hora azul.',
    },
    selection: { framing: 'wide', angle: 'worms-eye', movement: 'pull-out', lighting: 'blue-hour' },
    accent: '220 70% 55%',
  },
  {
    id: 'horror-dread',
    emoji: '👁️',
    name: { en: 'Horror Dread', de: 'Horror', es: 'Horror' },
    description: {
      en: 'Backlit silhouette, high angle, slow push-in toward subject.',
      de: 'Silhouette im Gegenlicht, Vogelperspektive, Push-In.',
      es: 'Silueta a contraluz, ángulo alto, acercamiento.',
    },
    selection: { framing: 'medium', angle: 'high-angle', movement: 'push-in', lighting: 'backlit' },
    accent: '270 50% 30%',
  },
  {
    id: 'midnight-mood',
    emoji: '🌙',
    name: { en: 'Midnight Mood', de: 'Mitternachtsstimmung', es: 'Ambiente medianoche' },
    description: {
      en: 'Establishing wide, moonlit, slow crane up for atmosphere.',
      de: 'Etablierender Weitschuss, Mondlicht, langsamer Kran.',
      es: 'Plano general, luz de luna, grúa lenta.',
    },
    selection: { framing: 'establishing', angle: 'eye-level', movement: 'crane-up', lighting: 'moonlit' },
    accent: '230 60% 45%',
  },
];

export const findStylePreset = (id: string | undefined): CinematicStylePreset | undefined => {
  if (!id) return undefined;
  return CINEMATIC_STYLE_PRESETS.find((p) => p.id === id);
};

/**
 * Detect if a given selection matches an existing preset (so we can highlight
 * the active preset chip when the user has it applied).
 */
export const matchPresetToSelection = (selection: import('./shotDirector').ShotSelection): string | null => {
  for (const preset of CINEMATIC_STYLE_PRESETS) {
    if (
      preset.selection.framing === selection.framing &&
      preset.selection.angle === selection.angle &&
      preset.selection.movement === selection.movement &&
      preset.selection.lighting === selection.lighting
    ) {
      return preset.id;
    }
  }
  return null;
};

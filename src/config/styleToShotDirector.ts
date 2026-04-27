/**
 * Maps Composer Visual Styles → cinematic Shot Director defaults.
 *
 * Soft-suggest pattern: when a user picks a visual style (e.g. "Noir"),
 * we offer matching framing/angle/movement/lighting defaults — but only
 * if the target Shot Director selection is currently EMPTY. Manual user
 * choices are never overwritten.
 *
 * IDs must match `src/config/shotDirector.ts` exactly.
 */
import type { ShotSelection } from '@/config/shotDirector';
import type { ComposerVisualStyle } from '@/config/composerVisualStyles';

export const STYLE_TO_SHOT_DIRECTOR: Record<ComposerVisualStyle, ShotSelection> = {
  realistic:      { framing: 'medium',        angle: 'eye-level',  movement: 'handheld',     lighting: 'overcast-natural' },
  cinematic:      { framing: 'medium-close',  angle: 'eye-level',  movement: 'push-in',      lighting: 'golden-hour' },
  comic:          { framing: 'wide',          angle: 'low-angle',  movement: 'static',       lighting: 'hard-noir' },
  anime:          { framing: 'medium',        angle: 'eye-level',  movement: 'static',       lighting: 'soft-studio' },
  '3d-animation': { framing: 'medium',        angle: 'low-angle',  movement: 'orbit-right',  lighting: 'soft-studio' },
  claymation:     { framing: 'close-up',      angle: 'eye-level',  movement: 'static',       lighting: 'soft-studio' },
  'pixel-art':    { framing: 'wide',          angle: 'eye-level',  movement: 'static',       lighting: 'neon-cyberpunk' },
  watercolor:     { framing: 'wide',          angle: 'eye-level',  movement: 'static',       lighting: 'overcast-natural' },
  noir:           { framing: 'medium-close',  angle: 'low-angle',  movement: 'static',       lighting: 'hard-noir' },
  cyberpunk:      { framing: 'medium',        angle: 'dutch-tilt', movement: 'push-in',      lighting: 'neon-cyberpunk' },
  'vintage-film': { framing: 'medium',        angle: 'eye-level',  movement: 'static',       lighting: 'golden-hour' },
  documentary:    { framing: 'medium',        angle: 'eye-level',  movement: 'handheld',     lighting: 'overcast-natural' },
};

/**
 * Returns the suggested Shot Director selection for a style, but only marks
 * `applied: true` if `current` is empty. Caller decides whether to commit.
 */
export function suggestShotDirectorForStyle(
  style: ComposerVisualStyle,
  current: ShotSelection | undefined,
): { selection: ShotSelection; applied: boolean } {
  const target = STYLE_TO_SHOT_DIRECTOR[style];
  const isEmpty = !current || Object.values(current).filter(Boolean).length === 0;
  return { selection: target, applied: isEmpty };
}

const STYLE_LABELS: Record<ComposerVisualStyle, { de: string; en: string; es: string }> = {
  realistic:      { de: 'Realistisch',  en: 'Realistic',     es: 'Realista' },
  cinematic:      { de: 'Cinematic',    en: 'Cinematic',     es: 'Cinemático' },
  comic:          { de: 'Comic',        en: 'Comic',         es: 'Cómic' },
  anime:          { de: 'Anime',        en: 'Anime',         es: 'Anime' },
  '3d-animation': { de: '3D Animation', en: '3D Animation',  es: 'Animación 3D' },
  claymation:     { de: 'Claymation',   en: 'Claymation',    es: 'Plastilina' },
  'pixel-art':    { de: 'Pixel Art',    en: 'Pixel Art',     es: 'Pixel Art' },
  watercolor:     { de: 'Watercolor',   en: 'Watercolor',    es: 'Acuarela' },
  noir:           { de: 'Noir',         en: 'Noir',          es: 'Noir' },
  cyberpunk:      { de: 'Cyberpunk',    en: 'Cyberpunk',     es: 'Cyberpunk' },
  'vintage-film': { de: 'Vintage Film', en: 'Vintage Film',  es: 'Película Vintage' },
  documentary:    { de: 'Doku',         en: 'Documentary',   es: 'Documental' },
};

export function getStyleLabel(style: ComposerVisualStyle, lang: 'de' | 'en' | 'es'): string {
  return STYLE_LABELS[style]?.[lang] ?? style;
}

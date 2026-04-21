// Shared scene-effect catalog for Composer — mirrored from
// src/remotion/components/effects/index.tsx (kept in sync manually).
//
// The storyboard AI picks 1-2 effects per scene from this catalog based on
// scene type + visual style. Effects are layered above the clip / image in
// the renderer (frame-deterministic, Lambda-safe, no external assets).

export type SceneEffectId =
  | 'glow-orbs'
  | 'light-rays'
  | 'particle-field'
  | 'gradient-pulse'
  | 'edge-glow'
  | 'chromatic-aberration';

export interface SceneEffectConfig {
  id: SceneEffectId;
  color?: string;
  intensity?: number;
}

export const ALL_EFFECT_IDS: SceneEffectId[] = [
  'glow-orbs',
  'light-rays',
  'particle-field',
  'gradient-pulse',
  'edge-glow',
  'chromatic-aberration',
];

export const EFFECT_DESCRIPTIONS: Record<SceneEffectId, string> = {
  'glow-orbs': 'Pulsating soft light orbs — atmospheric depth, good for emotional / luxury / hero moments',
  'light-rays': 'Slowly rotating cinematic light rays — drama, reveal, hook scenes',
  'particle-field': 'Floating dust / spark particles — magical, premium, storytelling',
  'gradient-pulse': 'Subtle breathing color overlay — minimal, ambient, always-safe default',
  'edge-glow': 'Bond-style golden inner-edge glow — premium framing, hero / cta scenes',
  'chromatic-aberration': 'RGB-split overlay — tech / product / futuristic moments only',
};

/**
 * Default effect mapping per visual style. Used as a fallback when the AI
 * does not select effects (or for non-AI scenes).
 */
export const STYLE_DEFAULT_EFFECTS: Record<string, SceneEffectId[]> = {
  cinematic: ['light-rays', 'particle-field'],
  realistic: ['gradient-pulse'],
  noir: ['light-rays', 'gradient-pulse'],
  cyberpunk: ['chromatic-aberration', 'glow-orbs'],
  '3d-animation': ['glow-orbs', 'gradient-pulse'],
  anime: ['particle-field', 'gradient-pulse'],
  comic: ['gradient-pulse'],
  claymation: ['gradient-pulse'],
  'pixel-art': ['gradient-pulse'],
  watercolor: ['gradient-pulse'],
  'vintage-film': ['gradient-pulse'],
  documentary: ['gradient-pulse'],
};

/**
 * Default effect mapping per scene type. Combined with style for richer output.
 */
export const SCENE_TYPE_DEFAULT_EFFECTS: Record<string, SceneEffectId[]> = {
  hook: ['edge-glow', 'light-rays'],
  problem: ['gradient-pulse'],
  solution: ['glow-orbs'],
  demo: ['gradient-pulse'],
  'social-proof': ['particle-field'],
  cta: ['edge-glow', 'glow-orbs'],
  custom: ['gradient-pulse'],
};

/**
 * Returns deterministic fallback effects when AI selection isn't available.
 */
export function getDefaultEffects(
  sceneType: string,
  visualStyle: string | undefined,
  brandColor?: string,
): SceneEffectConfig[] {
  const styleFx = (visualStyle && STYLE_DEFAULT_EFFECTS[visualStyle]) || [];
  const typeFx = SCENE_TYPE_DEFAULT_EFFECTS[sceneType] || ['gradient-pulse'];
  // Merge & dedupe, prefer scene-type effects first
  const merged = Array.from(new Set([...typeFx, ...styleFx])).slice(0, 2);
  return merged.map((id) => ({
    id,
    color: brandColor,
    intensity: 0.5,
  }));
}

/**
 * Validates a list of effects coming from the AI. Drops unknown ids and
 * clamps intensity to [0, 1]. Caps at max 2 effects per scene.
 */
export function sanitizeEffects(input: unknown): SceneEffectConfig[] {
  if (!Array.isArray(input)) return [];
  const out: SceneEffectConfig[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as any).id;
    if (typeof id !== 'string' || !ALL_EFFECT_IDS.includes(id as SceneEffectId)) continue;
    const color = typeof (item as any).color === 'string' ? (item as any).color : undefined;
    const rawIntensity = (item as any).intensity;
    const intensity =
      typeof rawIntensity === 'number' && Number.isFinite(rawIntensity)
        ? Math.max(0, Math.min(1, rawIntensity))
        : 0.5;
    out.push({ id: id as SceneEffectId, color, intensity });
    if (out.length >= 2) break;
  }
  return out;
}

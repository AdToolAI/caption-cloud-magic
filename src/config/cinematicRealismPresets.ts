/**
 * Cinematic Realism Presets — Stage 3 of the Action-First pipeline.
 *
 * One preset = a full look-and-feel package (camera + lighting + color
 * grade + Sync.so quality tier + scene-director system context). Picking
 * one in the Composer header primes every scene the user adds afterwards
 * so they don't have to wire 20 slots by hand to land at "real ad" or
 * "authentic UGC".
 *
 * The preset is informational by default — it does NOT override per-scene
 * Shot-Director slots the user has explicitly chosen, only fills empty
 * ones.
 */

import type { ShotSelection } from '@/config/shotDirector';

export type RealismPresetId = 'cinematic-spot' | 'documentary' | 'lifestyle-hero';

export interface RealismPreset {
  id: RealismPresetId;
  label: string;
  /** German one-liner shown under the preset chip. */
  description: string;
  /** Emoji glyph for the chip. */
  glyph: string;
  /**
   * Free-form English context appended to the Scene-Director system prompt.
   * Steers the LLM toward the right action archetypes, camera language,
   * and tonality.
   */
  directorContext: string;
  /**
   * Default Shot-Director selection. Empty slots are filled, occupied slots
   * are preserved (user intent wins).
   */
  shotDefaults: Partial<ShotSelection>;
  /** Color grade hint string baked into the prompt suffix. */
  colorGrade: string;
  /**
   * Sync.so quality tier:
   * - `single`  → `lipsync-2` single pass (cheaper, faster, good for UGC)
   * - `pro`     → `lipsync-2-pro` two-pass (premium, for spot/hero)
   */
  syncTier: 'single' | 'pro';
  /** Negative-prompt additions (joined with comma). */
  negativeAdditions: string[];
}

export const REALISM_PRESETS: RealismPreset[] = [
  {
    id: 'cinematic-spot',
    label: 'Cinematic Spot',
    description: '35 mm Filmlook, weiche Lens-Flares, flacher Fokus. Default für Werbespots.',
    glyph: '🎞️',
    directorContext: `REALISM PROFILE — CINEMATIC SPOT (TV commercial / brand film).
Prefer action beats that feel like a real commercial: driving establishing shots,
hero close-ups during a meaningful action, push-ins on hands working with the
product, slow steadicam glides through real environments. Lighting reads as
"motivated practical + soft key", never flat. Camera operates with subtle
breathing handheld or a Steadicam glide — never locked-off tripod for sprech
moments. Treat dialog as voiceover-over-action, not as direct camera address,
unless the user explicitly asks for a presenter shot.`,
    shotDefaults: {
      framing: 'medium-shot',
      angle: 'eye-level',
      movement: 'slow-push-in',
      lighting: 'golden-hour',
    },
    colorGrade: 'Kodak Vision3 35mm color grade, gentle teal-orange tonality, soft halation around highlights',
    syncTier: 'pro',
    negativeAdditions: ['flat tv lighting', 'locked-off tripod', 'static talking head bust'],
  },
  {
    id: 'documentary',
    label: 'Documentary / Authentic',
    description: 'Handheld, natürliches Licht, ungestellte Momente. Default für UGC und Testimonials.',
    glyph: '🎥',
    directorContext: `REALISM PROFILE — DOCUMENTARY / UGC AUTHENTIC.
Prefer captured-not-staged beats: subject mid-action, glancing at the camera
mid-sentence, hands in motion, subtle imperfections (shallow handheld drift,
natural reframe). Lighting is whatever the real scene would have — window
light, lamp practicals, available sunlight. Camera is a small handheld lens at
focal lengths between 24-35 mm, with believable micro-shake. Dialog is delivered
casually while the subject keeps doing what they were doing.`,
    shotDefaults: {
      framing: 'medium-close-up',
      angle: 'eye-level',
      movement: 'handheld',
      lighting: 'natural-window-light',
    },
    colorGrade: 'natural color, soft film grain, untouched skin tones, subtle vignette',
    syncTier: 'single',
    negativeAdditions: ['glossy commercial polish', 'studio backdrop', 'overly composed framing'],
  },
  {
    id: 'lifestyle-hero',
    label: 'Lifestyle Hero',
    description: 'Steadycam-Glide, dramatisches Licht, polished Post. Default für Brand-Hero & Aspirational.',
    glyph: '✨',
    directorContext: `REALISM PROFILE — LIFESTYLE HERO (aspirational brand film).
Prefer wide aspirational beats: subject moving through a beautiful location,
golden-hour or magic-hour lighting, slow Steadicam orbits, hands interacting
with hero props. Camera language is composed, deliberate, with anamorphic-style
oval bokeh and cinematic depth of field. Dialog is delivered with confident,
calm tonality while the subject continues a hero action (driving, walking,
working, arriving).`,
    shotDefaults: {
      framing: 'wide-shot',
      angle: 'low-angle',
      movement: 'steadicam-orbit',
      lighting: 'magic-hour',
    },
    colorGrade: 'cinematic teal-orange grade, anamorphic oval bokeh, polished hero film aesthetic',
    syncTier: 'pro',
    negativeAdditions: ['amateur snapshot look', 'flat fluorescent lighting'],
  },
];

export function getRealismPreset(id?: string | null): RealismPreset | undefined {
  if (!id) return undefined;
  return REALISM_PRESETS.find((p) => p.id === id);
}

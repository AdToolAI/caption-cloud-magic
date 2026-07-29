/**
 * Sound design planning.
 *
 * The most under-weighted quality lever in AI video: silence. A clip with no
 * foley and no room tone reads as "rendered" even when the image is flawless.
 * This module decides WHAT should be audible; the edge functions
 * (`generate-scene-sfx`, `director-cut-sound-design`) fetch the actual audio.
 */

import type { SceneGrammar, AutopilotGenre } from './types';

/** Broadcast/social loudness target. Everything is normalized to this. */
export const TARGET_LUFS = -14;

export interface AudioLayerPlan {
  sceneId: string;
  /** Short English prompt for the SFX generator, e.g. "espresso machine hiss". */
  foleyPrompt: string | null;
  /** Continuous room tone across the scene, e.g. "quiet café ambience". */
  ambiencePrompt: string | null;
  /** 0..1 — foley sits under dialogue, louder when the scene is silent. */
  foleyGain: number;
  ambienceGain: number;
}

export interface MixPlan {
  layers: AudioLayerPlan[];
  /** 0..1 music bed level, ducked automatically under dialogue. */
  musicGain: number;
  /** 0..1 how far music drops while a voice is speaking. */
  musicDuckTo: number;
  targetLufs: number;
}

/** Ambience guesses derived from the environment description — no model call. */
const AMBIENCE_HINTS: Array<{ match: RegExp; ambience: string }> = [
  { match: /caf[eé]|coffee|bistro|restaurant|bar\b/i, ambience: 'quiet café ambience, distant chatter' },
  { match: /office|desk|meeting|conference|workspace/i, ambience: 'soft open-office room tone' },
  { match: /street|city|urban|sidewalk|traffic/i, ambience: 'distant city street ambience' },
  { match: /kitchen|cooking|bakery/i, ambience: 'warm kitchen room tone' },
  { match: /forest|park|garden|nature|tree/i, ambience: 'gentle outdoor nature ambience, light wind' },
  { match: /beach|ocean|sea|coast/i, ambience: 'distant ocean waves' },
  { match: /studio|showroom|gallery/i, ambience: 'clean quiet studio room tone' },
  { match: /gym|fitness|workout/i, ambience: 'gym room tone, faint equipment' },
  { match: /car|vehicle|driving|road/i, ambience: 'muted car interior road noise' },
  { match: /home|living room|apartment|bedroom/i, ambience: 'quiet domestic room tone' },
  { match: /warehouse|factory|workshop|industrial/i, ambience: 'low industrial hum' },
];

function inferAmbience(environment: string): string | null {
  for (const hint of AMBIENCE_HINTS) {
    if (hint.match.test(environment)) return hint.ambience;
  }
  return null;
}

/** Genre-level music behaviour. */
const MUSIC_GAIN: Record<AutopilotGenre, number> = {
  ad_spot: 0.5,
  product_demo: 0.4,
  corporate: 0.35,
  storytelling: 0.45,
  testimonial: 0.25,
  explainer: 0.3,
  social_hook: 0.6,
  image_post: 0,
};

export function planSoundDesign(scenes: SceneGrammar[], genre: AutopilotGenre): MixPlan {
  const layers: AudioLayerPlan[] = scenes.map((scene) => {
    const hasDialogue = Boolean(scene.dialogue?.trim());
    const ambience = inferAmbience(scene.environment);
    const foley = scene.foleyHint?.trim() || null;

    return {
      sceneId: scene.id,
      foleyPrompt: foley,
      ambiencePrompt: ambience,
      // Under dialogue everything steps back; in silent scenes foley carries the shot.
      foleyGain: hasDialogue ? 0.22 : 0.5,
      ambienceGain: hasDialogue ? 0.12 : 0.25,
    };
  });

  return {
    layers,
    musicGain: MUSIC_GAIN[genre] ?? 0.4,
    musicDuckTo: 0.18,
    targetLufs: TARGET_LUFS,
  };
}

/**
 * Peak-safe gain so summing voice + music + foley + ambience never clips.
 * Browsers throw `IndexSizeError` on out-of-range gain, so every value that
 * reaches an audio node passes through here.
 */
export function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Simple loudness offset. Given a measured integrated LUFS, returns the linear
 * gain multiplier that lands the mix on target.
 */
export function lufsGain(measuredLufs: number, target = TARGET_LUFS): number {
  if (!Number.isFinite(measuredLufs)) return 1;
  const db = target - measuredLufs;
  // Never boost more than +12 dB — that amplifies noise instead of signal.
  const safeDb = Math.min(12, Math.max(-24, db));
  return 10 ** (safeDb / 20);
}

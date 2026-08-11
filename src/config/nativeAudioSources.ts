/**
 * v415 — Native provider audio vs. Studio audio.
 *
 * A scene's audio can only ever come from ONE layer:
 *   - `provider`: the video model bakes ambience/music into the clip,
 *   - `studio`:   the clip stays silent and audio is added later as tracks
 *                 (voiceover, lip-sync, SFX, music),
 *   - `silent`:   no audio planned at all.
 *
 * Provider audio and studio audio must never be combined on the same scene:
 * that doubles ambience/music and collides with the lip-sync chain, which
 * expects silent plates plus a separate voiceover track.
 *
 * The set below is derived from `AI_VIDEO_TOOLKIT_MODELS` (`capabilities.audio`)
 * so there is exactly one source of truth for "this model can make sound".
 */

import type { ClipSource } from '@/types/video-composer';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';

/**
 * v418 adds `ambient`: the model produces ambience/foley only (speech is
 * banned in the prompt and re-checked by a speech gate after the render),
 * the spoken voice still comes from the studio track. It is the ONLY
 * combination of provider audio and studio audio that is allowed.
 */
export type SceneAudioSource = 'provider' | 'studio' | 'silent' | 'ambient';


/** Composer `clipSource` values whose model family can generate its own audio. */
export const NATIVE_AUDIO_CLIP_SOURCES: ReadonlySet<string> = new Set(
  AI_VIDEO_TOOLKIT_MODELS
    .filter((m) => m.capabilities.audio)
    .map((m) => (m.id === 'kling-omni' ? 'ai-kling-omni' : `ai-${m.family}`)),
);

/** True when the given composer clip source can produce ambience/music itself. */
export function sourceHasNativeAudio(source: ClipSource | string | undefined | null): boolean {
  if (!source) return false;
  return NATIVE_AUDIO_CLIP_SOURCES.has(String(source));
}

/**
 * Resolve the audio owner for a scene.
 *
 * Speech (voiceover / dialog / lip-sync) always wins: those scenes must stay
 * silent at generation time so the studio owns the audio.
 */
export function resolveSceneAudioSource(input: {
  hasSpeech: boolean;
  hasSoundDesign: boolean;
  clipSource?: ClipSource | string | null;
  requested?: SceneAudioSource | null;
}): SceneAudioSource {
  const requested = input.requested;
  if (input.hasSpeech) {
    // v418 hybrid: speech scenes may keep a native ambience bed, but only on
    // models that can make sound at all. The voice itself stays studio-owned.
    if (requested === 'ambient' && sourceHasNativeAudio(input.clipSource)) return 'ambient';
    return 'studio';
  }
  if (requested === 'provider' || requested === 'ambient') {
    // Without speech there is nothing to keep separate — a plain provider
    // track is the simpler, cheaper equivalent of the hybrid.
    return sourceHasNativeAudio(input.clipSource) ? 'provider' : 'studio';
  }
  if (requested === 'studio' || requested === 'silent') return requested;
  if (input.hasSoundDesign) {
    return sourceHasNativeAudio(input.clipSource) ? 'provider' : 'studio';
  }
  return 'silent';
}

/** `withAudio` flag for the generation call derived from the audio owner. */
export function withAudioForSource(audioSource: SceneAudioSource): boolean {
  return audioSource === 'provider' || audioSource === 'ambient';
}

/**
 * True when the scene keeps a native ambience bed underneath a studio voice.
 * The bed is mixed in at the very end (mux stage) and must never reach the
 * lip-sync model as an audio input.
 */
export function isHybridAmbientSource(audioSource: SceneAudioSource | string | null | undefined): boolean {
  return audioSource === 'ambient';
}


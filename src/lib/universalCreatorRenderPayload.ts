/**
 * Universal Creator — shared payload builder.
 *
 * Single source of truth for the `customizations` object that both:
 *  - the live Remotion preview (`RemotionPreviewPlayer`)
 *  - the Lambda export call (`render-with-remotion`)
 * consume. Guarantees Preview and Render can never silently diverge.
 */

import type { ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import type { BackgroundAsset } from '@/types/background-assets';
import type { Scene } from '@/types/scene';
import { mapBackgroundAssetToUniversalVideo } from '@/lib/background-asset-mapper';
import { clampAudioVolume, getEffectiveBackgroundMusicVolume } from '@/lib/audioVolume';
import {
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VOICEOVER_VOLUME,
  computeTotalDurationSeconds,
} from '@/lib/universalCreatorDefaults';

export interface BuildCustomizationsInput {
  contentConfig?: ContentConfig | null;
  subtitleConfig?: SubtitleConfig | null;
  backgroundAsset?: BackgroundAsset | null;
  scenes?: any[] | null;
  selectedMusicUrl?: string | null;
  /** Slider value 0..1, direct from UI state. */
  musicVolume?: number | null;
}

/**
 * Validates + clamps scenes so preview + Lambda see an identical timeline.
 * Filters out zero/invalid durations, clamps to [0.1, 600] seconds.
 */
export function validateScenes(scenes?: any[] | null): any[] {
  if (!Array.isArray(scenes)) return [];
  return scenes
    .filter((s) => {
      const d = Number(s?.duration);
      return Number.isFinite(d) && d > 0;
    })
    .map((s) => ({
      ...s,
      duration: Math.max(0.1, Math.min(600, Number(s.duration))),
    }));
}

const mapSceneAnimation = (scene: Partial<Scene>) => {
  switch (scene.backgroundAnimation?.type) {
    case 'zoomIn':
      return { animation: 'zoomIn' as const, kenBurnsDirection: 'in' as const };
    case 'panLeft':
      return { animation: 'kenBurns' as const, kenBurnsDirection: 'left' as const };
    case 'panRight':
      return { animation: 'kenBurns' as const, kenBurnsDirection: 'right' as const };
    case 'panUp':
      return { animation: 'kenBurns' as const, kenBurnsDirection: 'up' as const };
    case 'panDown':
      return { animation: 'kenBurns' as const, kenBurnsDirection: 'down' as const };
    case 'none':
    default:
      return { animation: 'none' as const, kenBurnsDirection: 'in' as const };
  }
};

/**
 * Universal Creator UI scenes are intentionally lightweight. Remotion's
 * production template expects richer scene fields, so normalize once here —
 * the shared source of truth for both preview and export.
 */
export function normalizeScenesForUniversalCreatorVideo(scenes?: any[] | null): any[] {
  return validateScenes(scenes).map((scene, index) => {
    const animation = mapSceneAnimation(scene);
    return {
      ...scene,
      id: scene.id || `scene-${index}`,
      order: typeof scene.order === 'number' ? scene.order : index,
      type: scene.type || 'hook',
      title: scene.title || `Scene ${index + 1}`,
      spokenText: scene.spokenText || '',
      visualDescription: scene.visualDescription || '',
      background: scene.background || { type: 'color', color: '#000000' },
      transition: {
        type: scene.transition?.type || 'fade',
        duration: typeof scene.transition?.duration === 'number' ? scene.transition.duration : 0.5,
        ...(scene.transition?.direction ? { direction: scene.transition.direction } : {}),
      },
      ...animation,
      textOverlay: scene.textOverlay || { enabled: false, position: 'center', fontSize: 64, fontColor: '#FFFFFF', animation: 'none' },
      soundEffectType: scene.soundEffectType || 'none',
      useAnimation: Boolean(scene.useAnimation && scene.animatedVideoUrl),
      beatAligned: Boolean(scene.beatAligned),
      // Preserve per-scene original-audio override (step-2 mute etc.)
      originalAudio: scene.originalAudio && typeof scene.originalAudio === 'object'
        ? {
            muted: scene.originalAudio.muted === true,
            ...(typeof scene.originalAudio.enabled === 'boolean' ? { enabled: scene.originalAudio.enabled } : {}),
            ...(typeof scene.originalAudio.volume === 'number' ? { volume: clampAudioVolume(scene.originalAudio.volume) } : {}),
          }
        : undefined,
    };
  });
}

/**
 * Builds the `customizations` object shared by Preview and Export.
 */
export function buildUniversalCreatorCustomizations(input: BuildCustomizationsInput) {
  const {
    contentConfig,
    subtitleConfig,
    backgroundAsset,
    scenes,
    selectedMusicUrl,
    musicVolume,
  } = input;

  const validScenes = normalizeScenesForUniversalCreatorVideo(scenes);
  const hasVoiceover = !!contentConfig?.voiceoverUrl;

  const durationSeconds = computeTotalDurationSeconds({
    voiceoverDuration: contentConfig?.voiceoverDuration,
    actualVoiceoverDuration: contentConfig?.actualVoiceoverDuration,
    voiceoverStartTime: contentConfig?.voiceoverStartTime,
    scenes: validScenes,
  });

  const rawMusicVolume = clampAudioVolume(
    typeof musicVolume === 'number' ? musicVolume : DEFAULT_MUSIC_VOLUME,
  );

  const useOriginalAudio = contentConfig?.useOriginalAudio === true;
  const originalAudioVolume = clampAudioVolume(
    typeof contentConfig?.originalAudioVolume === 'number' ? contentConfig.originalAudioVolume : 0.6,
  );

  const actualVo = Number(contentConfig?.actualVoiceoverDuration ?? contentConfig?.voiceoverDuration ?? 0);
  const voDurationForRender = Number.isFinite(actualVo) && actualVo > 0 ? actualVo : durationSeconds;

  return {
    // Voice-over
    ...(hasVoiceover && {
      voiceoverUrl: contentConfig!.voiceoverUrl,
      voiceoverDuration: voDurationForRender,
      voiceoverVolume: clampAudioVolume(
        contentConfig?.voiceoverVolume ?? DEFAULT_VOICEOVER_VOLUME,
      ),
      // The timeline already grew to fit voStart + voDuration, so we only clamp
      // against the very last frame — never against the pre-offset duration
      // (that used to push a late VO onto the final frame = silence).
      voiceoverStartTime: Math.max(
        0,
        Math.min(
          Math.max(0, durationSeconds - 0.1),
          Number.isFinite(Number(contentConfig?.voiceoverStartTime))
            ? Number(contentConfig?.voiceoverStartTime)
            : 0,
        ),
      ),
    }),
    // Music
    ...(selectedMusicUrl && {
      backgroundMusicUrl: selectedMusicUrl,
      backgroundMusicVolume: getEffectiveBackgroundMusicVolume(rawMusicVolume, hasVoiceover),
      backgroundMusicClip: (() => {
        const raw = contentConfig?.backgroundMusicClip;
        if (!raw) return undefined;
        const trimStart = Math.max(0, Number(raw.trimStart) || 0);
        const trimEnd = Math.max(trimStart + 0.2, Number(raw.trimEnd) || trimStart + 0.2);
        const startTime = Math.max(0, Math.min(durationSeconds, Number(raw.startTime) || 0));
        return {
          trimStart,
          trimEnd,
          startTime,
          loop: raw.loop !== false,
          ...(typeof raw.fadeIn === 'number' ? { fadeIn: Math.max(0, raw.fadeIn) } : {}),
          ...(typeof raw.fadeOut === 'number' ? { fadeOut: Math.max(0, raw.fadeOut) } : {}),
        };
      })(),
    }),

    // Original scene-video audio (global settings; per-scene overrides live on scene.originalAudio)
    useOriginalAudio,
    originalAudioVolume,
    // Universal Creator is a clean media assembler: user media stays visually raw
    // in BOTH preview and export. Cinematic-Post (mood/grain/vignette/KenBurns/
    // parallax/overlays/scene-fx/transitions/drawOn) lives EXCLUSIVELY in the
    // Director's Cut and only when the customer explicitly enables it there.
    // This is a constant — never make it configurable from UCC call sites.
    rawMediaMode: true as const,
    // Subtitles
    subtitles: subtitleConfig?.segments || [],
    subtitleStyle: subtitleConfig?.style || DEFAULT_SUBTITLE_STYLE,
    // Scenes vs. background fallback
    scenes: validScenes.length > 0 ? validScenes : undefined,
    background:
      validScenes.length > 0
        ? undefined
        : mapBackgroundAssetToUniversalVideo(backgroundAsset ?? null),
  };
}

export function getUniversalCreatorDurationSeconds(input: BuildCustomizationsInput): number {
  return computeTotalDurationSeconds({
    voiceoverDuration: input.contentConfig?.voiceoverDuration,
    actualVoiceoverDuration: input.contentConfig?.actualVoiceoverDuration,
    voiceoverStartTime: input.contentConfig?.voiceoverStartTime,
    scenes: normalizeScenesForUniversalCreatorVideo(input.scenes),
  });
}

/**
 * Welle 2: sessionStorage cache for normalized scenes so Retry-Renders skip
 * the re-normalization work. Keyed by projectId. Cleared on successful export.
 */
const PAYLOAD_CACHE_KEY = (projectId: string) => `universal-creator:payload-cache:${projectId}`;

export function cacheRenderPayload(projectId: string, payload: unknown): void {
  if (!projectId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      PAYLOAD_CACHE_KEY(projectId),
      JSON.stringify({ payload, ts: Date.now() })
    );
  } catch {
    // sessionStorage full or unavailable — ignore, cache is best-effort
  }
}

export function readCachedRenderPayload<T = unknown>(projectId: string, maxAgeMs = 10 * 60_000): T | null {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PAYLOAD_CACHE_KEY(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { payload: T; ts: number };
    if (Date.now() - parsed.ts > maxAgeMs) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function clearCachedRenderPayload(projectId: string): void {
  if (!projectId || typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PAYLOAD_CACHE_KEY(projectId));
  } catch {
    // ignore
  }
}

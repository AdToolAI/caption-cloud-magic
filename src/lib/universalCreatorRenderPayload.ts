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

  const validScenes = validateScenes(scenes);
  const hasVoiceover = !!contentConfig?.voiceoverUrl;

  const durationSeconds = computeTotalDurationSeconds({
    voiceoverDuration: contentConfig?.voiceoverDuration,
    actualVoiceoverDuration: contentConfig?.actualVoiceoverDuration,
    scenes: validScenes,
  });

  const rawMusicVolume = clampAudioVolume(
    typeof musicVolume === 'number' ? musicVolume : DEFAULT_MUSIC_VOLUME,
  );

  return {
    // Voice-over
    ...(hasVoiceover && {
      voiceoverUrl: contentConfig!.voiceoverUrl,
      voiceoverDuration: durationSeconds,
      voiceoverVolume: clampAudioVolume(
        contentConfig?.voiceoverVolume ?? DEFAULT_VOICEOVER_VOLUME,
      ),
    }),
    // Music
    ...(selectedMusicUrl && {
      backgroundMusicUrl: selectedMusicUrl,
      backgroundMusicVolume: getEffectiveBackgroundMusicVolume(rawMusicVolume, hasVoiceover),
    }),
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
    scenes: validateScenes(input.scenes),
  });
}

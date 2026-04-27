/**
 * Build ComposerScene[] from an Ad Director configuration.
 *
 * Combines:
 *  - Story framework (defines beats / pacing)
 *  - Scene templates (default visuals + Shot Director per beat)
 *  - Tonality profile (passed as metadata for the script generator)
 *
 * Returns a fully-formed array of `ComposerScene` ready to be persisted
 * via the existing composer pipeline.
 */

import type {
  ComposerScene,
  ClipSource,
  ClipQuality,
  TransitionStyle,
} from '@/types/video-composer';
import {
  type AdStoryFramework,
  type AdFrameworkId,
  type AdFormatId,
  type AdGoalId,
  getAdStoryFramework,
  distributeFrameworkDurations,
} from '@/config/adStoryFrameworks';
import {
  pickTemplateForBeat,
  type AdSceneTemplate,
} from '@/config/adSceneTemplates';
import type { AdTonalityId } from '@/config/adTonalityProfiles';

export interface BuildAdScenesInput {
  frameworkId: AdFrameworkId;
  format: AdFormatId;
  goal: AdGoalId;
  tonalityId: AdTonalityId;
  productName: string;
  productDescription?: string;
  defaultClipSource?: ClipSource;
  defaultClipQuality?: ClipQuality;
  defaultTransition?: TransitionStyle;
  /** Per-beat AI-generated voiceover/subtitle line, indexed by beat order. */
  scriptLines?: string[];
}

export interface BuildAdScenesResult {
  scenes: ComposerScene[];
  totalDurationSec: number;
  framework: AdStoryFramework;
}

const FORMAT_DURATIONS: Record<AdFormatId, number> = {
  'tvc-15': 15,
  'tvc-30': 30,
  'tvc-60': 60,
  'longform': 90,
};

export function buildAdScenes(input: BuildAdScenesInput): BuildAdScenesResult {
  const framework = getAdStoryFramework(input.frameworkId);
  if (!framework) {
    throw new Error(`Unknown ad framework: ${input.frameworkId}`);
  }

  const totalSec = FORMAT_DURATIONS[input.format];
  const durations = distributeFrameworkDurations(framework, totalSec);

  const clipSource: ClipSource = input.defaultClipSource ?? 'ai-hailuo';
  const clipQuality: ClipQuality = input.defaultClipQuality ?? 'standard';
  const transition: TransitionStyle = input.defaultTransition ?? 'crossfade';

  const scenes: ComposerScene[] = framework.beats.map((beat, idx) => {
    const template: AdSceneTemplate = pickTemplateForBeat(beat.sceneType);
    const durationSeconds = durations[idx];

    const filledPrompt = template.promptSkeleton
      .replaceAll('{PRODUCT}', input.productName || 'the product')
      .replaceAll('{FEATURE}', 'its key feature')
      .replaceAll('{ENVIRONMENT}', 'natural everyday setting');

    const scriptLine = input.scriptLines?.[idx] ?? '';

    return {
      id: `ad-${input.frameworkId}-${idx}-${Date.now()}`,
      projectId: '',
      orderIndex: idx,
      sceneType: beat.sceneType,
      durationSeconds,
      clipSource,
      clipQuality,
      aiPrompt: filledPrompt,
      clipStatus: 'pending',
      textOverlay: {
        text: scriptLine,
        position: beat.sceneType === 'cta' ? 'center' : 'bottom',
        animation: 'fade-in',
        fontSize: 48,
        color: '#FFFFFF',
      },
      transitionType: transition,
      transitionDuration: 0.5,
      retryCount: 0,
      costEuros: 0,
      directorModifiers: {},
      shotDirector: { ...template.shotDirector },
      appliedStylePresetId: template.cinematicPresetId,
    };
  });

  return {
    scenes,
    totalDurationSec: durations.reduce((a, b) => a + b, 0),
    framework,
  };
}

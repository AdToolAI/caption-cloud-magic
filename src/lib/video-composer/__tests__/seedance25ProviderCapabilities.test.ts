import { describe, expect, it } from 'vitest';
import type { ComposerScene } from '@/types/video-composer';
import {
  getProviderDurations,
  providerSupportsLipsync,
  providerSupportsMultiSpeaker,
} from '../providerCapabilities';
import { getRenderWarnings } from '../renderWarnings';
import { validateSceneForCinematicSync } from '../validateSceneForCinematicSync';

const seedanceScene = {
  id: 'seedance-25-regression',
  clipSource: 'ai-seedance25',
  durationSeconds: 25,
  engineOverride: 'cinematic-sync',
  withAudio: true,
  dialogScript: 'Speaker A: First line\nSpeaker B: Second line',
} as ComposerScene;

describe('Seedance 2.5 lip-sync capabilities', () => {
  it('supports multi-speaker lip-sync at 25 seconds', () => {
    expect(providerSupportsLipsync('ai-seedance25')).toBe(true);
    expect(providerSupportsMultiSpeaker('ai-seedance25')).toBe(true);
    expect(getProviderDurations('ai-seedance25')).toContain(25);
  });

  it('does not emit provider or duration fallback warnings', () => {
    const preflightCodes = validateSceneForCinematicSync(seedanceScene).map((warning) => warning.code);
    expect(preflightCodes).not.toContain('provider_no_lipsync_support');
    expect(preflightCodes).not.toContain('duration_not_supported_by_provider');
    expect(getRenderWarnings(seedanceScene).some((warning) => warning.message.includes('Hailuo'))).toBe(false);
  });
});
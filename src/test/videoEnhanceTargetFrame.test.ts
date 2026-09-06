import { describe, expect, it } from 'vitest';
import {
  ENGINE_LABEL_READING,
  formatFrame,
  frameMeetsTarget,
  isPortrait,
  projectProviderOutput,
  resolveTargetFrame,
} from '@/lib/videoEnhance/targetFrame';

/**
 * The resolution label is a promise about delivered pixels.
 * Fixtures are three real runs measured with ffprobe on the finished files.
 */
describe('target frame contract', () => {
  it('reads 4K portrait as 2160x3840', () => {
    expect(resolveTargetFrame('4k', 1080, 1920)).toEqual({ width: 2160, height: 3840 });
    expect(resolveTargetFrame('4k', 1920, 1080)).toEqual({ width: 3840, height: 2160 });
    expect(isPortrait(1080, 1920)).toBe(true);
  });

  it('reproduces the measured Topaz portrait shortfall', () => {
    // run ee9fdb0e: 1080x1920 ordered at 4K -> measured 1216x2160
    const projected = projectProviderOutput('topaz-video-upscale', '4k', 1080, 1920);
    expect(projected).toEqual({ width: 1216, height: 2160 });
    expect(frameMeetsTarget(projected, resolveTargetFrame('4k', 1080, 1920))).toBe(false);

    // run b9b479d4: 720x1280 ordered at 4K -> measured 1216x2160
    expect(projectProviderOutput('topaz-video-upscale', '4k', 720, 1280)).toEqual({
      width: 1216,
      height: 2160,
    });
  });

  it('reproduces the measured ByteDance portrait success', () => {
    // run 014661bc: 1080x1920 ordered at 4K -> measured 2160x3840
    const projected = projectProviderOutput('bytedance-vcube', '4k', 1080, 1920);
    expect(projected).toEqual({ width: 2160, height: 3840 });
    expect(frameMeetsTarget(projected, resolveTargetFrame('4k', 1080, 1920))).toBe(true);
  });

  it('landscape is delivered natively by both engines', () => {
    for (const modelId of Object.keys(ENGINE_LABEL_READING)) {
      const projected = projectProviderOutput(modelId, '4k', 1920, 1080);
      expect(frameMeetsTarget(projected, resolveTargetFrame('4k', 1920, 1080))).toBe(true);
    }
  });

  it('formats frames for the panel', () => {
    expect(formatFrame({ width: 2160, height: 3840 })).toBe('2160×3840');
  });
});

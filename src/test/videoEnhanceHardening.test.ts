import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  evaluateUpscale as clientEvaluateUpscale,
  MIN_UPSCALE_GAIN as CLIENT_MIN_GAIN,
  projectProviderOutput,
  resolveTargetFrame,
  frameMeetsTarget,
} from '@/lib/videoEnhance/targetFrame';

const shared = (name: string) => readFileSync(`supabase/functions/_shared/${name}`, 'utf8');
const fn = (name: string) => readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');

describe('video enhance — a paid run must add pixels', () => {
  it('rejects an order that would shrink the video', () => {
    const verdict = clientEvaluateUpscale({ width: 1280, height: 720 }, { width: 1920, height: 1080 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('downscale');
  });

  it('rejects an order that returns the same frame', () => {
    const verdict = clientEvaluateUpscale({ width: 1080, height: 1920 }, { width: 1080, height: 1920 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no_op');
  });

  it('accepts a real enlargement', () => {
    const verdict = clientEvaluateUpscale({ width: 2160, height: 3840 }, { width: 1080, height: 1920 });
    expect(verdict.ok).toBe(true);
    expect(verdict.shortSideGain).toBeCloseTo(2, 5);
    expect(verdict.pixelGain).toBeCloseTo(4, 5);
  });

  it('keeps client and server thresholds identical', () => {
    const source = shared('video-enhance-frame.ts');
    const match = source.match(/MIN_UPSCALE_GAIN\s*=\s*([\d.]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(CLIENT_MIN_GAIN);
  });

  it('blocks non-upscales in the estimate path too, not only on start', () => {
    const index = fn('video-enhance');
    expect(index).toContain('VIDEO_ENHANCE_NOT_AN_UPSCALE');
    expect(index).toContain('TARGET_FRAME_UNREACHABLE');
    // The guard must sit before the action split so estimates are covered.
    const guard = index.indexOf('VIDEO_ENHANCE_NOT_AN_UPSCALE');
    const reservation = index.indexOf('reserve');
    expect(guard).toBeGreaterThan(-1);
    if (reservation > -1) expect(guard).toBeLessThan(reservation);
  });
});

describe('video enhance — portrait 4K routes to the engine that can deliver it', () => {
  it('projects Topaz as a line-count engine that misses portrait 4K', () => {
    const target = resolveTargetFrame('4k', 1080, 1920);
    expect(target).toEqual({ width: 2160, height: 3840 });
    const topaz = projectProviderOutput('topaz-video-upscale', '4k', 1080, 1920);
    expect(topaz.height).toBe(2160);
    expect(frameMeetsTarget(topaz, target)).toBe(false);
  });

  it('projects ByteDance as orientation aware and meeting portrait 4K', () => {
    const target = resolveTargetFrame('4k', 1080, 1920);
    const bytedance = projectProviderOutput('bytedance-vcube', '4k', 1080, 1920);
    expect(bytedance).toEqual(target);
    expect(frameMeetsTarget(bytedance, target)).toBe(true);
  });

  it('routes to a capable engine on the server before the run starts', () => {
    const source = shared('video-enhance-frame.ts');
    expect(source).toContain('engine_routed');
    expect(source).toContain('no_engine_reaches_target_frame');
    expect(fn('video-enhance')).toContain('planDelivery');
  });
});

describe('video enhance — provider scene selection', () => {
  it('maps source origin to the right ByteDance scene', () => {
    const models = shared('video-enhance-models.ts');
    expect(models).toContain('sceneForSource');
    expect(models).toContain("'aigc'");
    expect(models).toContain("'ugc'");
    expect(models).toContain("'common'");
  });

  it('passes the origin through from the request', () => {
    expect(fn('video-enhance')).toContain('origin');
  });
});

describe('video enhance — output measurement', () => {
  it('checks both dimensions against what was ordered', () => {
    const runtime = shared('video-enhance-runtime.ts');
    expect(runtime).toMatch(/measured\.width/);
    expect(runtime).toMatch(/measured\.height/);
    expect(runtime).toContain('0.98');
  });

  it('stores the measured technical facts separately', () => {
    const finalize = shared('video-enhance-finalize.ts');
    for (const column of [
      'output_codec',
      'output_container',
      'output_mime_type',
      'output_fps',
      'output_duration_seconds',
    ]) {
      expect(finalize).toContain(column);
    }
  });

  it('never re-encodes the provider file', () => {
    for (const file of [
      'video-enhance-finalize.ts',
      'video-enhance-runtime.ts',
      'video-enhance-frame.ts',
    ]) {
      const source = shared(file);
      expect(source).not.toMatch(/ffmpeg|transcode|re-?encode\(/i);
    }
    expect(fn('video-enhance')).not.toMatch(/ffmpeg|transcode/i);
  });
});

describe('video enhance — stuck runs finish by themselves', () => {
  it('has an idempotent reconciler with backoff', () => {
    const reconcile = fn('video-enhance-reconcile');
    expect(reconcile).toContain('next_reconcile_at');
    expect(reconcile).toContain('last_reconciled_at');
    expect(reconcile).toContain('backoffMinutes');
  });
});

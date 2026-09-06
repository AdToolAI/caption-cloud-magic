import { describe, expect, it } from 'vitest';

import {
  deliveredFacts,
  elapsedSecondsSince,
  engineDisplayName,
  formatClock,
  runEngines,
  runPhase,
  runPhaseLabel,
  targetMatchDetail,
  targetMatchLabel,
  targetMatchOf,
} from '@/lib/videoEnhance/runPresentation';
import {
  describeResolutionChoices,
  firstUpscaleResolution,
  resolveExecutionEngine,
} from '@/lib/videoEnhance/targetFrame';

const LANGS = ['en', 'de', 'es'] as const;

describe('run presentation — elapsed clock', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3661)).toBe('1:01:01');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });

  it('measures elapsed time from the server timestamp', () => {
    const created = '2026-09-06T20:00:00.000Z';
    expect(elapsedSecondsSince(created, Date.parse('2026-09-06T20:01:30.000Z'))).toBe(90);
    expect(elapsedSecondsSince(undefined)).toBe(0);
    expect(elapsedSecondsSince('not a date')).toBe(0);
  });
});

describe('run presentation — phase and engines', () => {
  it('maps every open status to a phase with copy in all three languages', () => {
    const statuses = [
      'credits_reserved',
      'provider_submitting',
      'provider_submitted',
      'provider_processing',
      'provider_output_ready',
      'asset_staging',
      'asset_persisting',
      'asset_persist_failed',
      'local_poll_timeout',
      'cancel_requested',
      'completed',
      'provider_failed',
      'provider_cancelled_confirmed',
      'manual_review',
    ];
    for (const status of statuses) {
      for (const lang of LANGS) {
        const label = runPhaseLabel(status, lang);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(/_/);
      }
    }
    expect(runPhase('provider_processing')).toBe('processing');
    expect(runPhase('asset_persist_failed')).toBe('retrying');
    expect(runPhase(undefined)).toBe('processing');
  });

  it('shows the executing engine from the run and the requested one only when routed', () => {
    const native = runEngines({ model_id: 'bytedance-vcube', requested_model_id: 'bytedance-vcube' });
    expect(native.routed).toBe(false);
    expect(native.requested).toBeNull();
    expect(native.executing).toBe(engineDisplayName('bytedance-vcube'));

    const routed = runEngines({
      model_id: 'bytedance-vcube',
      requested_model_id: 'topaz-video-upscale',
      delivery_strategy: 'engine_routed',
    });
    expect(routed.routed).toBe(true);
    expect(routed.executing).toBe(engineDisplayName('bytedance-vcube'));
    expect(routed.requested).toBe(engineDisplayName('topaz-video-upscale'));
    expect(routed.executing).not.toBe(routed.requested);

    // unknown engine ids are shown as-is, never hidden
    expect(engineDisplayName('some-future-engine')).toBe('some-future-engine');
  });
});

describe('run presentation — target match and delivered facts', () => {
  it('reads the server verdict and never assumes a match', () => {
    expect(targetMatchOf({ projection_matched: true })).toBe('matched');
    expect(targetMatchOf({ projection_matched: false })).toBe('mismatch');
    expect(targetMatchOf({ projection_matched: null })).toBe('unverified');
    expect(targetMatchOf({})).toBe('unverified');
    for (const lang of LANGS) {
      expect(targetMatchLabel('matched', lang)).not.toBe(targetMatchLabel('mismatch', lang));
    }
    expect(targetMatchLabel('matched', 'en')).toBe('Target matched');
    expect(targetMatchLabel('mismatch', 'en')).toBe('Provider output mismatch');
  });

  it('spells out delivered vs promised pixels', () => {
    expect(
      targetMatchDetail({ target_width: 2160, target_height: 3840, actual_width: 1216, actual_height: 2160 }),
    ).toBe('1216×2160 / 2160×3840');
    expect(targetMatchDetail({ target_width: 2160, target_height: 3840 })).toBe('2160×3840');
    expect(targetMatchDetail({})).toBeNull();
  });

  it('lists codec and container as two separate facts', () => {
    const facts = deliveredFacts(
      {
        actual_width: 2160,
        actual_height: 3840,
        output_bitrate_kbps: 12_345,
        output_size_bytes: 46 * 1024 * 1024,
        output_fps: 30,
        output_duration_seconds: 8.04,
        output_codec: 'h264',
        output_container: 'mp4',
      },
      'en',
    );
    expect(facts).toEqual([
      '2160×3840 pixels',
      '12.3 Mbit/s',
      '46.0 MB',
      '30 FPS',
      '8.0 s',
      'codec H264',
      'container MP4',
    ]);
    const de = deliveredFacts({ output_codec: 'hevc', output_container: 'mov' }, 'de');
    expect(de).toEqual(['Codec HEVC', 'Container MOV']);
    expect(deliveredFacts({}, 'es')).toEqual([]);
  });
});

describe('resolution choices — per tier, before the start', () => {
  it('states the exact frame for the source orientation and blocks no-op / downscale tiers', () => {
    const choices = describeResolutionChoices(['720p', '1080p', '2k', '4k'], 1080, 1920);
    expect(choices.map((c) => [c.resolution, `${c.frame.width}x${c.frame.height}`, c.verdict.ok, c.verdict.reason]))
      .toEqual([
        ['720p', '720x1280', false, 'downscale'],
        ['1080p', '1080x1920', false, 'no_op'],
        ['2k', '1440x2560', true, null],
        ['4k', '2160x3840', true, null],
      ]);
    expect(firstUpscaleResolution(['4k', '720p', '2k', '1080p'], 1080, 1920)).toBe('2k');
    expect(firstUpscaleResolution(['720p', '1080p'], 1080, 1920)).toBeNull();
  });

  it('keeps portrait AND landscape 4K native on Topaz via the direct API', () => {
    const engines = ['bytedance-vcube', 'topaz-video-upscale'];
    const portrait = resolveExecutionEngine('topaz-video-upscale', engines, '4k', 1080, 1920);
    expect(portrait).toEqual({ executionModelId: 'topaz-video-upscale', routed: false });
    const landscape = resolveExecutionEngine('topaz-video-upscale', engines, '4k', 1920, 1080);
    expect(landscape).toEqual({ executionModelId: 'topaz-video-upscale', routed: false });
    const direct = resolveExecutionEngine('bytedance-vcube', engines, '4k', 1080, 1920);
    expect(direct).toEqual({ executionModelId: 'bytedance-vcube', routed: false });
    // With only a 1080p-capable engine available, 4K stays unreachable.
    const nothing = resolveExecutionEngine('topaz-video-upscale', [], '4k', 1080, 1920);
    expect(nothing).toEqual({ executionModelId: null, routed: false });
  });
});

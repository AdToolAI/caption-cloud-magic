import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  adaptConfigToSpec,
  isVcubeScene,
  resolveExecutionMode,
  sceneForSource,
  VCUBE_SCENES,
  vcubeProcessingType,
  VIDEO_ENHANCE_SPECS,
  type EnhanceConfig,
  type SourceMetadata,
} from '../../supabase/functions/_shared/video-enhance-models.ts';
import {
  CLIENT_RUN_FIELDS,
  INTERNAL_RUN_FIELDS,
  OUTPUT_MEASUREMENT_FIELDS,
  toClientPricing,
  toClientRun,
} from '../../supabase/functions/_shared/video-enhance-client-view.ts';

/**
 * Behavioral contract of the ByteDance provider payload.
 *
 * These tests build the REAL payload through the server spec's `buildInput`
 * — the same function `video-enhance` calls before the provider request — so
 * a scene, processing type, resolution or fps can not drift without a red
 * test. No provider is contacted.
 */

const vcube = VIDEO_ENHANCE_SPECS['bytedance-vcube'];
const topaz = VIDEO_ENHANCE_SPECS['topaz-video-upscale'];
const SOURCE_URL = 'https://example.invalid/source.mp4';

const generated: SourceMetadata = {
  durationSeconds: 8,
  width: 1080,
  height: 1920,
  fps: 24,
  sourceModel: 'seedance-2.5',
  origin: 'generated',
};
const uploaded: SourceMetadata = { durationSeconds: 8, width: 1080, height: 1920, fps: 29.97, origin: 'uploaded' };
const unknown: SourceMetadata = { durationSeconds: 8, width: 1080, height: 1920, fps: 30 };

function direct(overrides: Partial<EnhanceConfig> = {}): EnhanceConfig {
  // What the client sends for a DIRECT ByteDance request: the UI default
  // mode is `aigc` (first in the list) — that default is NOT a choice.
  return { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '4k', fps: 30, tier: 'standard', ...overrides };
}

/** Mirrors the server: adapt to the executing spec, then resolve the mode. */
function serverPayload(requested: EnhanceConfig, source: SourceMetadata, modeExplicit: boolean) {
  // `vcube` is the EXECUTING spec (after routing); the flag only counts when
  // the customer chose the mode for that very engine.
  const adapted = adaptConfigToSpec(requested, vcube, source);
  const explicit = modeExplicit && vcube.id === requested.modelId;
  const mode = resolveExecutionMode(adapted, vcube, source, explicit);
  const config: EnhanceConfig = { ...adapted, mode: mode.mode };
  return { config, mode, payload: vcube.buildInput(config, source, SOURCE_URL) };
}

describe('ByteDance scene provenance — direct requests', () => {
  it('generated clip -> aigc when the customer did not choose a footage type', () => {
    const { payload, mode } = serverPayload(direct(), generated, false);
    expect(mode.source).toBe('provenance');
    expect(payload.scene).toBe('aigc');
  });

  it('uploaded clip -> ugc even though the client default said aigc', () => {
    const { payload, mode } = serverPayload(direct(), uploaded, false);
    expect(mode.source).toBe('provenance');
    expect(payload.scene).toBe('ugc');
  });

  it('unknown provenance -> common', () => {
    const { payload } = serverPayload(direct(), unknown, false);
    expect(payload.scene).toBe('common');
  });

  it('an explicit choice wins over provenance', () => {
    const { payload, mode } = serverPayload(direct({ mode: 'old_film' }), uploaded, true);
    expect(mode.source).toBe('explicit');
    expect(payload.scene).toBe('old_film');
  });

  it('an explicit choice outside the published enum is ignored, never sent', () => {
    const { payload } = serverPayload(direct({ mode: 'standard' }), uploaded, true);
    expect(isVcubeScene(payload.scene)).toBe(true);
    expect(payload.scene).toBe('ugc');
  });

  it('a request routed from Topaz never carries the Topaz mode into the scene', () => {
    const fromTopaz: EnhanceConfig = {
      modelId: 'topaz-video-upscale',
      mode: topaz.modes[0],
      resolution: '4k',
      fps: null,
      tier: 'standard',
    };
    // Even with modeExplicit=true: the choice was made for ANOTHER engine.
    const { payload, mode } = serverPayload(fromTopaz, generated, true);
    expect(mode.source).toBe('provenance');
    expect(payload.scene).toBe('aigc');
  });
});

describe('ByteDance provider payload — exact fields', () => {
  it('preserves scene, processing_type=standard, exact target_resolution and validated target_fps', () => {
    const { payload } = serverPayload(direct({ resolution: '2k', fps: 60 }), generated, false);
    expect(payload).toEqual({
      video: SOURCE_URL,
      scene: 'aigc',
      processing_type: 'standard',
      target_resolution: '2k',
      target_fps: 60,
    });
  });

  it('keeps the source frame rate (rounded) when no fps was ordered', () => {
    const { payload } = serverPayload(direct({ fps: null }), uploaded, false);
    expect(payload.target_fps).toBe(30);
    expect(payload.target_resolution).toBe('4k');
  });

  it('every scene the payload can carry is part of the published enum', () => {
    for (const source of [generated, uploaded, unknown]) {
      for (const mode of ['aigc', 'ugc', 'standard', 'whatever', '']) {
        const payload = vcube.buildInput(direct({ mode }), source, SOURCE_URL);
        expect(VCUBE_SCENES).toContain(payload.scene);
      }
    }
  });

  it('sceneForSource is deterministic across the three provenance classes', () => {
    const all = [...VCUBE_SCENES];
    expect(sceneForSource(generated, all)).toBe('aigc');
    expect(sceneForSource({ ...unknown, sourceModel: 'kling-2.1' }, all)).toBe('aigc');
    expect(sceneForSource(uploaded, all)).toBe('ugc');
    expect(sceneForSource(unknown, all)).toBe('common');
  });

  it('ByteDance Pro stays unavailable: standard unless the tier is pro, and pro needs entitlement', () => {
    expect(vcubeProcessingType('standard')).toBe('standard');
    expect(vcubeProcessingType('pro')).toBe('pro');
    expect(vcube.entitlementTiers).toContain('pro');
  });
});

describe('server wiring of modeExplicit', () => {
  const index = readFileSync('supabase/functions/video-enhance/index.ts', 'utf8');

  it('reads modeExplicit from the request and resolves the execution mode on the server', () => {
    expect(index).toMatch(/modeExplicit\?: boolean/);
    expect(index).toMatch(/resolveExecutionMode\(adapted, spec, source\.meta, modeExplicit\)/);
    // a choice made for another engine does not survive routing
    expect(index).toMatch(/body\.modeExplicit === true && spec\.id === requestedConfig\.modelId/);
  });

  it('both surfaces send modeExplicit only after the customer touched the footage type', () => {
    for (const file of [
      'src/components/ai-video/EnhanceVideoPanel.tsx',
      'src/components/directors-cut/features/AIVideoUpscaling.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src).toMatch(/modeExplicit: modeTouched/);
      expect(src).toMatch(/setModeTouched\(true\)/);
    }
  });
});

describe('customer projection of a run', () => {
  it('delivers every output measurement and never an internal column', () => {
    for (const field of OUTPUT_MEASUREMENT_FIELDS) expect(CLIENT_RUN_FIELDS).toContain(field);
    for (const field of INTERNAL_RUN_FIELDS) expect(CLIENT_RUN_FIELDS).not.toContain(field);
  });

  it('filters a raw row down to the client fields', () => {
    const raw: Record<string, unknown> = {
      id: 'r1',
      status: 'completed',
      model_id: 'bytedance-vcube',
      requested_model_id: 'topaz-video-upscale',
      projection_matched: true,
      actual_width: 2160,
      actual_height: 3840,
      output_codec: 'h264',
      output_container: 'mp4',
      output_mime_type: 'video/mp4',
      callback_token: 'secret',
      provider_prediction_id: 'pred',
      provider_cost_usd_actual: 1.23,
      margin_pct: 40,
    };
    const view = toClientRun(raw)!;
    expect(view.projection_matched).toBe(true);
    expect(view.output_container).toBe('mp4');
    expect(view.output_codec).toBe('h264');
    expect(view.requested_model_id).toBe('topaz-video-upscale');
    expect('callback_token' in view).toBe(false);
    expect('provider_prediction_id' in view).toBe(false);
    expect('provider_cost_usd_actual' in view).toBe(false);
    expect('margin_pct' in view).toBe(false);
    expect(toClientRun(null)).toBeNull();
  });

  it('strips margin internals from the pricing snapshot', () => {
    const pricing = toClientPricing({
      userPriceEur: 1.5,
      fps: 30,
      outputSeconds: 8,
      costUnverified: false,
      rateCardVersion: 'v1',
      resolution: '4k',
      modelId: 'bytedance-vcube',
      mode: 'aigc',
      // internals a caller could accidentally pass along
      ...({ providerCostUsd: 0.4, marginPct: 60 } as Record<string, unknown>),
    } as Parameters<typeof toClientPricing>[0]);
    expect(Object.keys(pricing).sort()).toEqual(
      ['costUnverified', 'fps', 'mode', 'modelId', 'outputSeconds', 'rateCardVersion', 'resolution', 'userPriceEur'],
    );
  });

  it('the status action and every run response go through the projection', () => {
    const index = readFileSync('supabase/functions/video-enhance/index.ts', 'utf8');
    expect(index).toMatch(/return json\(\{ run: toClientRun\(run\) \}\)/);
    // no raw row leaves the function
    expect(index).not.toMatch(/json\(\{\s*run:\s*(existing|current|run|inserted|updated|row)\s*[,}]/);
    const hook = readFileSync('src/hooks/useEnhanceVideo.ts', 'utf8');
    for (const field of OUTPUT_MEASUREMENT_FIELDS) {
      expect(hook, `EnhanceRunRow declares ${field}`).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    expect(hook).toMatch(/requested_model_id\?:/);
    expect(hook).toMatch(/created_at\?:/);
  });
});

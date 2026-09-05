/**
 * Client registry and server authority must describe the SAME engine:
 * same models, same valid combinations, same prices.
 */
import { describe, it, expect } from 'vitest';
import {
  VIDEO_ENHANCE_MODELS,
  getVideoEnhanceModel,
  outputsFor,
  validateCombination as validateClient,
  type EnhanceConfig,
  type SourceMetadata,
} from '@/config/videoEnhanceModels';
import { priceVideoEnhanceRun as priceClient } from '@/lib/videoEnhance/pricing';
import { VIDEO_RATE_CARDS as CLIENT_CARDS } from '@/lib/videoEnhance/rates';
import {
  VIDEO_ENHANCE_SPECS,
  VIDEO_RATE_CARDS as SERVER_CARDS,
  outputsFor as serverOutputsFor,
  priceVideoEnhanceRun as priceServer,
  validateCombination as validateServer,
} from '../../supabase/functions/_shared/video-enhance-models.ts';

const noEnv = () => undefined;
const entitled = (_id: string, tier: string) => tier !== 'pro';

const source: SourceMetadata = {
  durationSeconds: 8,
  width: 1280,
  height: 720,
  fps: 24,
  container: 'mp4',
  sizeBytes: 4_000_000,
};

describe('video enhance registry parity', () => {
  it('exposes the same model ids on both sides', () => {
    expect(VIDEO_ENHANCE_MODELS.map((m) => m.id).sort()).toEqual(
      Object.keys(VIDEO_ENHANCE_SPECS).sort(),
    );
  });

  for (const model of VIDEO_ENHANCE_MODELS) {
    it(`${model.id}: modes, combinations, tiers and duration limits match`, () => {
      const spec = VIDEO_ENHANCE_SPECS[model.id];
      expect(spec).toBeTruthy();
      expect(model.processingModes.map((m) => m.id).sort()).toEqual([...spec.modes].sort());
      expect(model.qualityTiers).toEqual(spec.tiers);
      expect(model.minDurationSeconds).toBe(spec.minDurationSeconds);
      expect(model.maxDurationSeconds).toBe(spec.maxDurationSeconds);
      expect(model.providerModelId).toBe(spec.providerModelId);
      expect(model.providerSchemaRef).toBe(spec.providerSchemaRef);
      for (const mode of spec.modes) {
        expect(outputsFor(model, mode)).toEqual(serverOutputsFor(spec, mode));
      }
    });
  }

  it('uses identical rate cards', () => {
    expect(JSON.stringify(CLIENT_CARDS)).toBe(JSON.stringify(SERVER_CARDS));
  });
});

describe('video enhance pricing parity', () => {
  const fixtures: { config: EnhanceConfig; seconds: number }[] = [
    { config: { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'standard' }, seconds: 8 },
    { config: { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '4k', fps: 30, tier: 'standard' }, seconds: 12 },
    { config: { modelId: 'bytedance-vcube', mode: 'ugc', resolution: '2k', fps: 60, tier: 'standard' }, seconds: 5 },
    { config: { modelId: 'bytedance-vcube', mode: 'restoration', resolution: '1080p', fps: 30, tier: 'standard' }, seconds: 20 },
    { config: { modelId: 'topaz-video-upscale', mode: 'standard', resolution: '1080p', fps: 24, tier: 'standard' }, seconds: 10 },
    { config: { modelId: 'topaz-video-upscale', mode: 'high_fidelity', resolution: '4k', fps: 30, tier: 'standard' }, seconds: 6 },
  ];

  for (const { config, seconds } of fixtures) {
    it(`${config.modelId}/${config.mode}/${config.resolution}@${config.fps} costs the same on both sides`, () => {
      const meta = { ...source, durationSeconds: seconds, fps: config.fps ?? 24 };
      const client = priceClient(config, meta);
      const server = priceServer(config, meta);
      expect(client.userPriceEur).toBe(server.userPriceEur);
      expect(client.providerCostUsdEstimated).toBe(server.providerCostUsdEstimated);
      expect(client.pricingVersion).toBe(server.pricingVersion);
      expect(client.providerPricingVersion).toBe(server.providerPricingVersion);
      expect(client.rateCardVersion).toBe(server.rateCardVersion);
      expect(client.marginPct).toBeCloseTo(server.marginPct, 10);
    });
  }

  it('never charges below the platform price floor', () => {
    const price = priceServer(
      { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'standard' },
      { ...source, durationSeconds: 1 },
    );
    expect(price.userPriceEur).toBeGreaterThanOrEqual(0.03);
    expect(price.contributionEur).toBeGreaterThan(0);
  });
});

describe('combination validation parity', () => {
  const cases: { config: EnhanceConfig; duration?: number; expected: string | true }[] = [
    { config: { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'standard' }, expected: true },
    { config: { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '4k', fps: 60, tier: 'standard' }, expected: 'unsupported_fps' },
    { config: { modelId: 'bytedance-vcube', mode: 'restoration', resolution: '4k', fps: 30, tier: 'standard' }, expected: 'unsupported_resolution' },
    { config: { modelId: 'bytedance-vcube', mode: 'nope', resolution: '1080p', fps: 24, tier: 'standard' }, expected: 'unknown_mode' },
    { config: { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'pro' }, expected: 'tier_not_entitled' },
    { config: { modelId: 'topaz-video-upscale', mode: 'standard', resolution: '4k', fps: 60, tier: 'standard' }, expected: true },
    { config: { modelId: 'topaz-video-upscale', mode: 'standard', resolution: '1080p', fps: 24, tier: 'standard' }, duration: 900, expected: 'duration_too_long' },
    { config: { modelId: 'unknown-model', mode: 'standard', resolution: '1080p', fps: 24, tier: 'standard' }, expected: 'unknown_model' },
  ];

  for (const { config, duration, expected } of cases) {
    it(`${config.modelId}/${config.mode}/${config.resolution}@${config.fps}/${config.tier} -> ${expected}`, () => {
      const client = validateClient(config, duration ?? 8, entitled);
      const server = validateServer(config, duration ?? 8, noEnv);
      expect(client).toEqual(server);
      if (expected === true) expect(client.ok).toBe(true);
      else expect(client.error).toBe(expected);
    });
  }

  it('rejects an invalid combination instead of silently correcting it', () => {
    const config: EnhanceConfig = {
      modelId: 'bytedance-vcube',
      mode: 'restoration',
      resolution: '4k',
      fps: 30,
      tier: 'standard',
    };
    expect(() => priceServer(config, source)).not.toThrow();
    expect(validateServer(config, 8, noEnv).ok).toBe(false);
  });
});

describe('provider entitlement', () => {
  it('hides ByteDance Pro until the entitlement is verified', () => {
    const model = getVideoEnhanceModel('bytedance-vcube')!;
    expect(model.entitlementTiers).toContain('pro');
    expect(
      validateServer(
        { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'pro' },
        8,
        noEnv,
      ).error,
    ).toBe('tier_not_entitled');
  });

  it('accepts Pro once the environment lists the verified entitlement', () => {
    const env = (key: string) =>
      key === 'VIDEO_ENHANCE_VERIFIED_ENTITLEMENTS' ? 'bytedance-vcube:pro' : undefined;
    expect(
      validateServer(
        { modelId: 'bytedance-vcube', mode: 'aigc', resolution: '1080p', fps: 24, tier: 'pro' },
        8,
        env,
      ).ok,
    ).toBe(true);
  });
});

describe('rollout gates', () => {
  it('ships both models locked', () => {
    for (const model of VIDEO_ENHANCE_MODELS) expect(model.enabled).toBe(false);
  });

  it('marks unverified rate cards so they cannot be rolled out silently', () => {
    for (const card of Object.values(SERVER_CARDS)) expect(card.costUnverified).toBe(true);
  });
});

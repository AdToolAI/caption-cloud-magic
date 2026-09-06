import { describe, expect, it, vi } from 'vitest';
import {
  capabilityGate,
  evaluateCapabilityGate,
  inferMode,
} from '../../supabase/functions/_shared/videoCapabilityGate.ts';
import {
  ALIAS_SOURCE_FAMILY,
  VIDEO_MODEL_ALIASES,
  VIDEO_MODEL_SPECS,
  applyOutputMeasurement,
  classifyMeasuredOutput,
  getModeSpec,
  getVideoModelSpec,
  isResolutionTierAvailable,
  parityKeyOf,
  parityKeyString,
  newTier,
  projectTargetFrame,
  res,
  resolveVideoModelId,
  validateCapability,
} from '../../supabase/functions/_shared/videoModelSpecs.ts';

const CORS = { 'Access-Control-Allow-Origin': '*' };

describe('runtime capability gate — invalid combinations are rejected, never rewritten', () => {
  it('LTX 4K above 8 s is a 400 instead of a silent 1080p downgrade', () => {
    const v = validateCapability({
      modelId: 'ltx-standard',
      mode: 't2v',
      resolution: '4K',
      durationSeconds: 12,
      aspectRatio: '16:9',
    });
    expect(v?.code).toBe('INVALID_MODEL_CAPABILITY');
    expect(v?.field).toBe('duration');
  });

  it('Hailuo Pro 1080p is 6 s only — 10 s is rejected, not downgraded to 768p', () => {
    const v = validateCapability({
      modelId: 'hailuo-pro',
      mode: 't2v',
      resolution: '1080p',
      durationSeconds: 10,
      aspectRatio: '16:9',
    });
    expect(v?.field).toBe('duration');
    expect(
      validateCapability({
        modelId: 'hailuo-pro',
        mode: 't2v',
        resolution: '768p',
        durationSeconds: 10,
        aspectRatio: '16:9',
      }),
    ).toBeNull();
  });

  it('Veo 3.1 Fast 1080p runs 8 s only', () => {
    expect(
      validateCapability({ modelId: 'veo-3.1-fast', mode: 't2v', durationSeconds: 6, aspectRatio: '16:9' })?.field,
    ).toBe('duration');
    expect(
      validateCapability({ modelId: 'veo-3.1-fast', mode: 't2v', durationSeconds: 8, aspectRatio: '16:9' }),
    ).toBeNull();
  });

  it('Veo 3.1 reference images are 16:9 only', () => {
    expect(
      validateCapability({
        modelId: 'veo-3.1-fast',
        mode: 'reference',
        durationSeconds: 8,
        aspectRatio: '9:16',
      })?.field,
    ).toBe('aspectRatio');
  });

  it('an unsupported aspect ratio is a 400', () => {
    const v = validateCapability({
      modelId: 'ltx-standard',
      mode: 't2v',
      resolution: '1080p',
      durationSeconds: 8,
      aspectRatio: '21:9',
    });
    expect(v?.field).toBe('aspectRatio');
  });

  it('returns a 400 Response with the machine-readable code', async () => {
    const gate = capabilityGate(
      { modelId: 'hailuo-pro', mode: 't2v', resolution: '1080p', durationSeconds: 10, aspectRatio: '16:9' },
      CORS,
    );
    expect(gate.response).not.toBeNull();
    expect(gate.response!.status).toBe(400);
    const body = await gate.response!.json();
    expect(body.code).toBe('INVALID_MODEL_CAPABILITY');
    expect(body.field).toBe('duration');
  });

  it('a valid request passes and carries the exact promised frame', () => {
    const gate = evaluateCapabilityGate({
      modelId: 'ltx-standard',
      mode: 't2v',
      resolution: '4K',
      durationSeconds: 8,
      aspectRatio: '9:16',
    });
    expect(gate.violation).toBeNull();
    expect(gate.targetFrame).toEqual({ width: 2160, height: 3840 });
  });

  it('infers the mode from the supplied inputs', () => {
    expect(inferMode({})).toBe('t2v');
    expect(inferMode({ startImageUrl: 'a' })).toBe('i2v');
    expect(inferMode({ startImageUrl: 'a', endImageUrl: 'b' })).toBe('firstLast');
    expect(inferMode({ referenceImageUrls: ['a'] })).toBe('reference');
    expect(inferMode({ videoUrl: 'v' })).toBe('v2v');
  });
});

describe('a rejected request never reaches the wallet or the provider', () => {
  it('stops the pipeline before deduction and dispatch', async () => {
    const deductCredits = vi.fn();
    const callProvider = vi.fn();

    // Mirrors the edge-function ordering: gate -> wallet -> deduct -> provider.
    async function pipeline(request: Parameters<typeof capabilityGate>[0]) {
      const gate = capabilityGate(request, CORS);
      if (gate.response) return gate.response;
      deductCredits();
      callProvider();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    const rejected = await pipeline({
      modelId: 'hailuo-pro',
      mode: 't2v',
      resolution: '1080p',
      durationSeconds: 10,
      aspectRatio: '16:9',
    });
    expect(rejected.status).toBe(400);
    expect(deductCredits).not.toHaveBeenCalled();
    expect(callProvider).not.toHaveBeenCalled();

    const accepted = await pipeline({
      modelId: 'hailuo-pro',
      mode: 't2v',
      resolution: '1080p',
      durationSeconds: 6,
      aspectRatio: '16:9',
    });
    expect(accepted.status).toBe(200);
    expect(deductCredits).toHaveBeenCalledTimes(1);
    expect(callProvider).toHaveBeenCalledTimes(1);
  });
});

describe('availability is per resolution tier', () => {
  it('a new tier does not inherit a grandfathered model’s availability', () => {
    const tier = newTier('4K', 2160, 'ltx-standard');
    expect(tier.grandfathered).toBe(false);
    expect(isResolutionTierAvailable(tier)).toBe(false);
  });

  it('a new tier unlocks only with a smoke test carrying measured pixels', () => {
    const verified = newTier('4K', 2160, 'ltx-standard', {
      smokeTest: {
        runId: 'run-4k-001',
        verifiedAt: '2026-09-06',
        resolutionLabel: '4K',
        measured: { width: 3840, height: 2160 },
        pricing: {
          estimatedProviderCost: 0.64,
          actualProviderCost: 0.64,
          chargedCredits: 1.92,
          effectiveMargin: 3,
        },
      },
    });
    expect(isResolutionTierAvailable(verified)).toBe(true);
    expect(verified.parityStatus).toBe('FULL_PARITY');
  });

  it('every shipping tier of every available model carries its own verification state', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const m of spec.modes) {
        for (const tier of m.resolutions) {
          expect(typeof tier.available, `${spec.id} ${tier.label}`).toBe('boolean');
          expect(typeof tier.grandfathered, `${spec.id} ${tier.label}`).toBe('boolean');
          if (!tier.grandfathered && tier.available) {
            expect(tier.smokeTest, `${spec.id} ${tier.label} needs a smoke test`).toBeTruthy();
          }
        }
      }
    }
  });

  it('a locked tier is rejected at runtime', () => {
    const locked = res('8K', 4320, 'nope', { grandfathered: false, available: false });
    expect(isResolutionTierAvailable(locked)).toBe(false);
  });
});

describe('aliases stay inside their family', () => {
  it('never renames a run into a different product', () => {
    for (const [legacyId, targetId] of Object.entries(VIDEO_MODEL_ALIASES)) {
      const target = getVideoModelSpec(targetId);
      expect(target, `alias target ${targetId} missing`).toBeTruthy();
      expect(ALIAS_SOURCE_FAMILY[legacyId], `alias ${legacyId} has no declared family`).toBeTruthy();
      expect(target!.family, `alias ${legacyId} -> ${targetId} crosses families`).toBe(
        ALIAS_SOURCE_FAMILY[legacyId],
      );
    }
  });

  it('Sora 2 resolves to the historical removed spec and cannot be started', () => {
    expect(resolveVideoModelId('sora-2-pro')).toBe('sora-2');
    const v = validateCapability({ modelId: 'sora-2-pro', mode: 't2v' });
    expect(v?.field).toBe('availability');
  });
});

describe('promised frame and measured output', () => {
  it('holds the short edge on every aspect ratio', () => {
    const tier = res('4K', 2160, 'x');
    expect(projectTargetFrame(tier, '16:9')).toEqual({ width: 3840, height: 2160 });
    expect(projectTargetFrame(tier, '9:16')).toEqual({ width: 2160, height: 3840 });
    expect(projectTargetFrame(tier, '1:1')).toEqual({ width: 2160, height: 2160 });
    expect(projectTargetFrame(tier, '4:3')).toEqual({ width: 2880, height: 2160 });
    expect(projectTargetFrame(tier, '3:4')).toEqual({ width: 2160, height: 2880 });
    expect(projectTargetFrame(tier, '21:9')).toEqual({ width: 5040, height: 2160 });
    expect(projectTargetFrame(tier, '3:2')).toEqual({ width: 3240, height: 2160 });
    expect(projectTargetFrame(tier, '2:3')).toEqual({ width: 2160, height: 3240 });
  });

  it('reproduces the long-edge trap instead of wishing it away', () => {
    const topazLike = res('4K', 2160, 'x', { orientationBehavior: 'long-edge' });
    expect(projectTargetFrame(topazLike, '9:16')).toEqual({ width: 1216, height: 2160 });
  });

  it('classifies measured output against the promise', () => {
    const target = { width: 2160, height: 3840 };
    expect(classifyMeasuredOutput(target, { width: 2160, height: 3840 })).toBe('TARGET_MATCHED');
    expect(classifyMeasuredOutput(target, { width: 1216, height: 2160 })).toBe('PROVIDER_OUTPUT_MISMATCH');
  });

  it('downgrades a tier after three consecutive mismatches and resets on a match', () => {
    let state = { parityStatus: 'FULL_PARITY' as const, consecutiveMismatches: 0, tierDisabled: false };
    let next = applyOutputMeasurement(state, 'PROVIDER_OUTPUT_MISMATCH');
    expect(next.parityStatus).toBe('FULL_PARITY');
    next = applyOutputMeasurement(next, 'PROVIDER_OUTPUT_MISMATCH');
    expect(next.parityStatus).toBe('FULL_PARITY');
    next = applyOutputMeasurement(next, 'PROVIDER_OUTPUT_MISMATCH');
    expect(next.parityStatus).toBe('VERIFY');
    expect(next.downgraded).toBe(true);

    const recovered = applyOutputMeasurement(next, 'TARGET_MATCHED');
    expect(recovered.consecutiveMismatches).toBe(0);
  });
});


describe('hardening pass — explicit tiers, kill switch, per-route parity', () => {
  it('a multi-tier model must name its resolution — no silent first-tier default', () => {
    // Any model whose mode offers more than one tier must be asked explicitly.
    let checked = 0;
    for (const spec of VIDEO_MODEL_SPECS) {
      if (!spec.available) continue;
      for (const mode of spec.modes) {
        if (mode.resolutions.length < 2) continue;
        const v = validateCapability({ modelId: spec.id, mode: mode.mode });
        expect(v?.field, `${spec.id} ${mode.mode} silently defaulted a tier`).toBe('resolution');
        checked++;
      }
    }
    expect(checked, 'no multi-tier mode found to verify').toBeGreaterThan(0);
  });

  it('a tier disabled by measured regressions is rejected', () => {
    const spec = getVideoModelSpec('veo-3.1-fast')!;
    const label = getModeSpec(spec, 't2v')!.resolutions[0].label;
    const base = { modelId: 'veo-3.1-fast', mode: 't2v' as const, resolution: label, durationSeconds: 8, aspectRatio: '16:9' };
    expect(validateCapability(base)).toBeNull();
    const v = validateCapability({ ...base, tierDisabled: true });
    expect(v?.field).toBe('resolution');
    expect(v?.message).toMatch(/disabled/i);
  });

  it('every offered tier documents an exact frame per aspect ratio of its mode', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const mode of spec.modes) {
        for (const tier of mode.resolutions) {
          for (const ratio of mode.aspectRatios) {
            const frame = tier.framesByAspectRatio[ratio];
            expect(frame, `${spec.id} ${mode.mode} ${tier.label} ${ratio}`).toBeTruthy();
            expect(frame.width % 2, `${spec.id} ${tier.label} ${ratio} width odd`).toBe(0);
            expect(frame.height % 2, `${spec.id} ${tier.label} ${ratio} height odd`).toBe(0);
          }
          expect(tier.sizingRuleSource.length, `${spec.id} ${tier.label}`).toBeGreaterThan(10);
        }
      }
    }
  });

  it('parity keys separate mode and route — a t2v mismatch cannot touch i2v', () => {
    const spec = getVideoModelSpec('veo-3.1-fast')!;
    const label = getModeSpec(spec, 't2v')!.resolutions[0].label;
    const t2v = parityKeyString(parityKeyOf(spec, 't2v', label));
    const i2v = parityKeyString(parityKeyOf(spec, 'i2v', label));
    expect(t2v).not.toBe(i2v);
    expect(t2v).toContain(spec.apiRoute);
    expect(t2v).toContain(spec.region);
  });

  it('the same model on two routes keeps two independent parity keys', () => {
    const routes = new Map<string, string[]>();
    for (const spec of VIDEO_MODEL_SPECS) {
      const list = routes.get(spec.family) ?? [];
      list.push(spec.apiRoute);
      routes.set(spec.family, list);
    }
    const a = parityKeyString({ modelId: 'x', apiRoute: 'replicate', region: 'global', mode: 't2v', resolutionLabel: '1080p' });
    const b = parityKeyString({ modelId: 'x', apiRoute: 'modelark', region: 'global', mode: 't2v', resolutionLabel: '1080p' });
    expect(a).not.toBe(b);
  });
});

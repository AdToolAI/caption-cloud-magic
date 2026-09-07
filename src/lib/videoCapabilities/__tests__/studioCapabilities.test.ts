import { describe, expect, it } from 'vitest';
import {
  durationsFor,
  exactFrameLabel,
  getModelCapabilityUnion,
  getStudioCapabilities,
  validateStudioSelection,
  deriveStudioMode,
  modeSupported,
  exactFrame,
  referenceModeRequirement,
} from '../studioCapabilities';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { getVideoModelSpec, isResolutionTierAvailable } from '@/config/videoModelSpecs';

describe('studio capability selector = canonical registry', () => {
  it('every UI model exists in the canonical registry', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      expect(getVideoModelSpec(m.id), `${m.id} missing in videoModelSpecs`).toBeDefined();
    }
  });

  it('UI technical fields are exactly the spec-derived union', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const union = getModelCapabilityUnion(m.id);
      expect(m.durations, m.id).toEqual(union.durations);
      expect(m.aspectRatios, m.id).toEqual(union.aspectRatios);
      const uiRes = m.resolutions ?? [m.resolution];
      const expected = union.resolutionLabels.length > 1
        ? union.resolutionLabels
        : [union.resolutionLabels[0] ?? union.resolutions[0]?.label ?? ''];
      expect(uiRes, m.id).toEqual(expected);
    }
  });

  it('never offers a locked tier as a startable option', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id)!;
      const locked = spec.modes
        .flatMap((mode) => mode.resolutions)
        .filter((r) => r.native && !isResolutionTierAvailable(r))
        .map((r) => r.label);
      const offered = m.resolutions ?? [m.resolution];
      for (const label of locked) {
        expect(offered, `${m.id} offers locked tier ${label}`).not.toContain(label);
      }
    }
  });

  it('never offers an enhance/upscale tier as native generation', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id)!;
      const upscale: string[] = [...((spec.enhanceUpscaleTiers ?? []) as unknown as string[])];
      const offered = m.resolutions ?? [m.resolution];
      for (const label of upscale) {
        expect(offered, `${m.id} exposes upscale tier ${label} as native`).not.toContain(label);
      }
      for (const mode of spec.modes) {
        const caps = getStudioCapabilities(m.id, mode.mode);
        expect(caps.resolutions.every((r) => r.native), `${m.id}/${mode.mode}`).toBe(true);
      }
    }
  });

  it('every startable option passes the shared capability gate', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id)!;
      // Models the registry marks unavailable (e.g. Pika in maintenance) are
      // gate-rejected by design; the UI shows them disabled.
      if (!spec.available) continue;
      for (const mode of spec.modes) {
        const caps = getStudioCapabilities(m.id, mode.mode);
        for (const tier of caps.resolutions.filter((r) => r.startable)) {
          for (const ar of caps.aspectRatios) {
            for (const d of durationsFor(m.id, mode.mode, tier.label)) {
              const violation = validateStudioSelection({
                modelId: m.id,
                mode: mode.mode,
                resolution: tier.label,
                aspectRatio: ar,
                duration: d,
              });
              expect(
                violation,
                `${m.id}/${mode.mode}/${tier.label}/${ar}/${d}s → ${violation?.message}`,
              ).toBeNull();
            }
          }
        }
      }
    }
  });

  it('rejects an invalid selection instead of rewriting it', () => {
    const v = validateStudioSelection({
      modelId: 'hailuo-pro',
      mode: 't2v',
      resolution: '1080p',
      aspectRatio: '16:9',
      duration: 10,
    });
    expect(v?.field).toBe('duration');
  });

  it('hailuo-pro narrows durations per tier', () => {
    expect(durationsFor('hailuo-pro', 't2v', '1080p')).toEqual([6]);
    expect(durationsFor('hailuo-pro', 't2v', '768p')).toEqual([6, 10]);
  });

  it('never claims exact pixels for an unverified tier', () => {
    // Kling 2.5 Turbo 1080p is grandfathered but its frame table is only
    // generically derived — that is an assumption, not provider truth.
    expect(exactFrameLabel('kling-2.5-turbo', 't2v', '1080p', '9:16')).toBeNull();
    expect(exactFrame('kling-2.5-turbo', 't2v', '1080p', '16:9')).toBeNull();
  });

  it('invariant: a pixel label implies a verified AND startable tier', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id)!;
      for (const mode of spec.modes) {
        const caps = getStudioCapabilities(m.id, mode.mode);
        for (const tier of caps.resolutions) {
          for (const ar of caps.aspectRatios) {
            const label = exactFrameLabel(m.id, mode.mode, tier.label, ar);
            if (label === null) continue;
            expect(label).toMatch(/^\d+×\d+$/);
            const raw = mode.resolutions.find((r) => r.label === tier.label)!;
            expect(raw.sizingRuleVerified, `${m.id}/${tier.label}`).toBe(true);
            expect(tier.startable, `${m.id}/${tier.label}`).toBe(true);
            expect(spec.available, m.id).toBe(true);
          }
        }
      }
    }
  });

  it('derives the studio mode from the inputs and never resolves it away', () => {
    expect(deriveStudioMode({ hasStartImage: true })).toBe('i2v');
    expect(deriveStudioMode({ hasReferenceVideo: true })).toBe('v2v');
    expect(deriveStudioMode({})).toBe('t2v');
    // seedance-standard has no v2v mode: unsupported stays unsupported.
    expect(modeSupported('seedance-standard', 'v2v')).toBe(false);
    const caps = getStudioCapabilities('seedance-standard', 'v2v');
    expect(caps.supported).toBe(false);
    expect(caps.resolutions).toEqual([]);
    const violation = validateStudioSelection({ modelId: 'seedance-standard', mode: 'v2v' });
    expect(violation?.field).toBe('mode');
  });

  it('an unavailable model has no startable tier (Pika, maintenance)', () => {
    for (const id of ['pika-2-2-standard', 'pika-2-2-pro']) {
      const spec = getVideoModelSpec(id);
      expect(spec, id).toBeDefined();
      expect(spec!.available, id).toBe(false);
      for (const mode of spec!.modes) {
        const caps = getStudioCapabilities(id, mode.mode);
        expect(caps.modelAvailable, id).toBe(false);
        expect(caps.resolutionLabels, id).toEqual([]);
        for (const r of caps.resolutions) {
          expect(r.startable, `${id}/${r.label}`).toBe(false);
          expect(r.lockedReason, `${id}/${r.label}`).toContain(spec!.releaseStatus);
        }
      }
    }
  });

  it('Seedance and Veo high tiers are not startable today', () => {
    const cases: Array<[string, string[]]> = [
      ['veo-3.1-fast', ['4K']],
      ['veo-3.1-pro', ['4K']],
      ['seedance-standard', ['1080p', '4K']],
      ['seedance-pro', ['1080p', '4K']],
    ];
    for (const [id, tiers] of cases) {
      const spec = getVideoModelSpec(id);
      expect(spec, `${id} must exist in the canonical registry`).toBeDefined();
      const union = getModelCapabilityUnion(id);
      expect(union.supported, id).toBe(true);
      for (const tier of tiers) {
        expect(union.resolutionLabels, `${id} offers ${tier}`).not.toContain(tier);
        const declared = spec!.modes.flatMap((m) => m.resolutions).filter((r) => r.label === tier);
        // A tier that does not exist at all is fine; one that exists must be locked.
        for (const r of declared) expect(isResolutionTierAvailable(r), `${id}/${tier}`).toBe(false);
      }
    }
  });

  it('generic invariant: a locked tier is never offered as startable', () => {
    for (const m of AI_VIDEO_TOOLKIT_MODELS) {
      const spec = getVideoModelSpec(m.id)!;
      for (const mode of spec.modes) {
        const caps = getStudioCapabilities(m.id, mode.mode);
        for (const r of caps.resolutions) {
          const raw = mode.resolutions.find((x) => x.label === r.label)!;
          if (!spec.available || !isResolutionTierAvailable(raw)) {
            expect(r.startable, `${m.id}/${r.label}`).toBe(false);
          }
        }
      }
    }
  });

  it('exposes canonical input slots instead of a hand-kept mirror', () => {
    const seedance = getStudioCapabilities('seedance-2-5', 'reference');
    expect(seedance.inputs.images?.max).toBe(30);
    expect(getStudioCapabilities('seedance-2-5', 'firstLast').inputs.lastFrame).toBe(true);
    const veoRef = referenceModeRequirement('veo-3.1-fast');
    expect(veoRef?.aspectRatios).toEqual(['16:9']);
    expect(veoRef?.durations).toEqual([8]);
    // Registry meta now mirrors exactly that — no second hand-maintained value.
    const meta = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === 'veo-3.1-fast')!;
    expect(meta.capabilities.refRequires).toEqual({ aspectRatios: ['16:9'], durations: [8] });
    expect(meta.capabilities.maxReferences).toBe(3);
  });
});

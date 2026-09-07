import { describe, expect, it } from 'vitest';
import {
  durationsFor,
  exactFrameLabel,
  getModelCapabilityUnion,
  getStudioCapabilities,
  validateStudioSelection,
  deriveStudioMode,
  resolveSupportedMode,
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
      expect(uiRes, m.id).toEqual(
        union.resolutionLabels.length > 1 ? union.resolutionLabels : [union.resolutionLabels[0]],
      );
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
      const upscale = (spec.enhanceUpscaleTiers ?? []).map((t) => t.label);
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

  it('exposes exact pixel truth, portrait included', () => {
    const spec = AI_VIDEO_TOOLKIT_MODELS.find((m) => getStudioCapabilities(m.id, 't2v').aspectRatios.includes('9:16'));
    expect(spec).toBeDefined();
    const caps = getStudioCapabilities(spec!.id, 't2v');
    const label = exactFrameLabel(spec!.id, 't2v', caps.resolutionLabels[0], '9:16');
    expect(label).toMatch(/^\d+×\d+$/);
    const [w, h] = label!.split('×').map(Number);
    expect(h).toBeGreaterThan(w);
  });

  it('derives and resolves the studio mode without inventing one', () => {
    expect(deriveStudioMode({ hasStartImage: true })).toBe('i2v');
    expect(deriveStudioMode({})).toBe('t2v');
    const modes = getVideoModelSpec('hailuo-pro')!.modes.map((m) => m.mode);
    expect(modes).toContain(resolveSupportedMode('hailuo-pro', 'v2v'));
  });

  it('Seedance and Veo locked tiers stay locked', () => {
    const locked: Array<[string, string]> = [
      ['veo-3-1-fast', '4K'],
      ['veo-3-1', '4K'],
    ];
    for (const [id, tier] of locked) {
      const spec = getVideoModelSpec(id);
      if (!spec) continue;
      const found = spec.modes.flatMap((m) => m.resolutions).filter((r) => r.label === tier);
      for (const r of found) expect(isResolutionTierAvailable(r), `${id}/${tier}`).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import {
  SPECS_SOURCE_HASH,
  VIDEO_MODEL_SPECS,
  VIDEO_MODEL_ALIASES,
  getVideoModelSpec,
  maxNativeResolution,
  validateCapability,
  projectTargetFrame,
  res,
} from '@/config/videoModelSpecs';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { VIDEO_PRICING_CATALOG } from '@/lib/cost/videoPricingCatalog';

const SOURCE_PATH = resolve(process.cwd(), 'supabase/functions/_shared/videoModelSpecs.ts');

describe('video model spec mirror parity', () => {
  it('client mirror hash matches the canonical server source', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n');
    const hash = createHash('sha256').update(source, 'utf8').digest('hex');
    expect(hash).toBe(SPECS_SOURCE_HASH);
  });
});

describe('spec completeness (Phase 7 hard gates)', () => {
  it('every resolution carries exact pixel dimensions — never a bare label', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const m of spec.modes) {
        expect(m.resolutions.length, `${spec.id}/${m.mode} has no resolution`).toBeGreaterThan(0);
        for (const r of m.resolutions) {
          expect(r.shortEdge, `${spec.id}/${m.mode}/${r.label}`).toBeGreaterThan(0);
          expect(r.landscape.width).toBeGreaterThan(r.landscape.height);
          expect(r.portrait.height).toBeGreaterThan(r.portrait.width);
          expect(r.portrait.width).toBe(r.shortEdge);
          expect(r.landscape.height).toBe(r.shortEdge);
        }
      }
    }
  });

  it('an available model is either grandfathered or has a passing smoke test', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      if (!spec.available) continue;
      if (spec.grandfathered) continue;
      expect(spec.smokeTest?.runId, `${spec.id} is available without a smoke-test run id`).toBeTruthy();
    }
  });

  it('FULL_PARITY requires a smoke test with measured pixels and pricing', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      if (spec.parityStatus !== 'FULL_PARITY') continue;
      const smoke = spec.smokeTest;
      expect(smoke?.runId, `${spec.id}: FULL_PARITY without run id`).toBeTruthy();
      expect(smoke?.measured.width, `${spec.id}: FULL_PARITY without measured width`).toBeGreaterThan(0);
      expect(smoke?.measured.height, `${spec.id}: FULL_PARITY without measured height`).toBeGreaterThan(0);
      expect(smoke?.pricing, `${spec.id}: FULL_PARITY without pricing verification`).toBeTruthy();
      expect(smoke?.pricing?.effectiveMargin, `${spec.id}: margin not verified`).toBeGreaterThan(0);
    }
  });

  it('every deprecated model names its successor', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      if (!spec.deprecated) continue;
      expect(spec.supersededBy, `${spec.id} is deprecated without supersededBy`).toBeTruthy();
      expect(getVideoModelSpec(spec.supersededBy!), `${spec.id}: unknown successor`).toBeTruthy();
    }
  });

  it('every model declares route, region and verification provenance', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      expect(spec.apiRoute, `${spec.id}: missing apiRoute`).toBeTruthy();
      expect(spec.region, `${spec.id}: missing region`).toBeTruthy();
      expect(spec.providerDocsVersion, `${spec.id}: missing providerDocsVersion`).toBeTruthy();
      expect(spec.verificationSourceUrl, `${spec.id}: missing verificationSourceUrl`).toBeTruthy();
      expect(spec.verificationNotes, `${spec.id}: missing verificationNotes`).toBeTruthy();
      expect(spec.verifiedBy, `${spec.id}: missing verifiedBy`).toBeTruthy();
    }
  });

  it('spec ids are unique', () => {
    const ids = VIDEO_MODEL_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('registry, pricing and alias parity', () => {
  it('every selectable toolkit model has a spec', () => {
    for (const model of AI_VIDEO_TOOLKIT_MODELS) {
      expect(getVideoModelSpec(model.id), `no spec for toolkit model ${model.id}`).toBeTruthy();
    }
  });

  it('every resolution pricingId exists in the billing catalog', () => {
    for (const spec of VIDEO_MODEL_SPECS) {
      for (const m of spec.modes) {
        for (const r of m.resolutions) {
          expect(
            VIDEO_PRICING_CATALOG[r.pricingId],
            `${spec.id}/${m.mode}/${r.label}: unknown pricing id "${r.pricingId}"`,
          ).toBeTruthy();
        }
      }
    }
  });

  it('every alias resolves to a live spec', () => {
    for (const [alias, target] of Object.entries(VIDEO_MODEL_ALIASES)) {
      expect(getVideoModelSpec(alias)?.id, `alias ${alias} is dead`).toBe(target);
    }
  });
});

describe('capability validation rejects instead of clamping', () => {
  it('rejects an unsupported resolution', () => {
    const v = validateCapability({ modelId: 'seedance-2-5', mode: 't2v', resolution: '4K' });
    expect(v?.field).toBe('resolution');
  });

  it('rejects Hailuo Pro 1080p at 10 seconds', () => {
    const v = validateCapability({
      modelId: 'hailuo-pro', mode: 't2v', resolution: '1080p', durationSeconds: 10,
    });
    expect(v?.field).toBe('duration');
  });

  it('rejects LTX 4K above 8 seconds instead of silently downgrading', () => {
    const v = validateCapability({
      modelId: 'ltx-standard', mode: 't2v', resolution: '4K', durationSeconds: 12,
    });
    expect(v?.field).toBe('duration');
  });

  it('rejects Veo 3.1 1080p at 4 seconds', () => {
    const v = validateCapability({
      modelId: 'veo-3.1-fast', mode: 't2v', resolution: '1080p', durationSeconds: 4,
    });
    expect(v?.field).toBe('duration');
  });

  it('rejects an unsupported mode', () => {
    expect(validateCapability({ modelId: 'runway-gen4-aleph', mode: 't2v' })?.field).toBe('mode');
  });

  it('rejects a model in maintenance', () => {
    expect(validateCapability({ modelId: 'pika-2-2-pro', mode: 't2v' })?.field).toBe('availability');
  });

  it('accepts a valid combination', () => {
    expect(
      validateCapability({
        modelId: 'seedance-2-5', mode: 'i2v', resolution: '720p', durationSeconds: 10, aspectRatio: '9:16',
      }),
    ).toBeNull();
  });
});

describe('orientation-aware target frames', () => {
  it('portrait 4K really is 2160x3840', () => {
    const r = res('4K', 2160, 'seedance-2-5');
    expect(projectTargetFrame(r, '9:16')).toEqual({ width: 2160, height: 3840 });
    expect(projectTargetFrame(r, '16:9')).toEqual({ width: 3840, height: 2160 });
  });

  it('maxNativeResolution ignores enhance-only upscale tiers', () => {
    const spec = getVideoModelSpec('vidu-q2-reference')!;
    expect(spec.enhanceUpscaleTiers).toContain('4K');
    expect(maxNativeResolution(spec)?.label).toBe('1080p');
  });
});

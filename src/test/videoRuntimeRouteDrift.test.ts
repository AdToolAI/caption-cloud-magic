import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VIDEO_MODEL_SPECS,
  getVideoModelSpec,
  resolveGenerationMode,
  resolveRouteIdentity,
  isSingleProviderSlug,
  parityKeyOf,
  parityKeyString,
  type VideoMode,
} from '../../supabase/functions/_shared/videoModelSpecs';

/**
 * RUNTIME <-> CANONICAL ROUTE DRIFT.
 *
 * Where canonical route identity exists, provider dispatch must not maintain a
 * contradictory second hand-written provider slug.
 */

const FN = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase', 'functions', name, 'index.ts'), 'utf8');

const SLUG_LITERAL = /['"]([a-z0-9][a-z0-9._-]+\/[a-z0-9][a-z0-9._/-]+)['"]/g;

const IGNORED_LITERAL = /^(https?|npm|image|video|audio|application|text)\b/;

/** Generators whose slug map is intentionally kept (documented in the report). */
const INTENTIONAL_MAPS: Record<string, string> = {
  'generate-pika-video':
    'Pika is unavailable (maintenance); the legacy Replicate slug is dead code kept for the historic contract.',
};

function slugLiterals(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(SLUG_LITERAL)) {
    const slug = m[1];
    if (IGNORED_LITERAL.test(slug)) continue;
    if (slug.includes('functions/v1') || slug.startsWith('std@')) continue;
    out.add(slug);
  }
  return [...out];
}

const CANONICAL_SLUGS = new Set<string>();
for (const spec of VIDEO_MODEL_SPECS) {
  CANONICAL_SLUGS.add(spec.providerModelSlug);
  for (const m of spec.modes) if (m.providerModelSlug) CANONICAL_SLUGS.add(m.providerModelSlug);
}

describe('Wan dispatches the canonical route identity', () => {
  const src = FN('generate-wan-video');

  it('keeps no second provider-slug map', () => {
    expect(src).not.toMatch(/REPLICATE_MODELS/);
    expect(slugLiterals(src)).toEqual([]);
  });

  it('dispatches gate.routeIdentity.providerModelSlug', () => {
    expect(src).toMatch(/gate\.routeIdentity\?\.providerModelSlug/);
  });

  const wanModels = ['wan-standard', 'wan-2-6-standard', 'wan-2-6-pro', 'wan-2-7-standard', 'wan-2-7-pro'];
  for (const id of wanModels) {
    it(`${id}: t2v and i2v resolve to distinct provider contracts`, () => {
      const spec = getVideoModelSpec(id)!;
      const t2v = resolveRouteIdentity(spec, 't2v').providerModelSlug;
      const i2v = resolveRouteIdentity(spec, 'i2v').providerModelSlug;
      expect(t2v).toMatch(/-t2v$/);
      expect(i2v).toMatch(/-i2v$/);
      expect(t2v).not.toBe(i2v);
      expect(isSingleProviderSlug(t2v)).toBe(true);
      expect(isSingleProviderSlug(i2v)).toBe(true);
    });
  }

  it('the runtime mode used for dispatch is the gate-resolved mode', () => {
    // start image -> i2v, no start image -> t2v; same resolver as the gate.
    expect(resolveGenerationMode('wan-2-7-standard', { hasFirstFrame: true })).toBe('i2v');
    expect(resolveGenerationMode('wan-2-7-standard', {})).toBe('t2v');
  });
});

describe('Vidu route + mode truth', () => {
  const src = FN('generate-vidu-video');

  it('keeps no second provider-slug map and dispatches canonical', () => {
    expect(src).not.toMatch(/const REPLICATE_MODELS/);
    expect(slugLiterals(src)).toEqual([]);
    expect(src).toMatch(/gate\.routeIdentity\?\.providerModelSlug/);
  });

  it('the nonexistent vidu/q3-i2v slug is absent from canonical', () => {
    expect([...CANONICAL_SLUGS]).not.toContain('vidu/q3-i2v');
  });

  it('all Vidu specs resolve to a really hosted q3 contract', () => {
    for (const id of ['vidu-q2-reference', 'vidu-q2-i2v', 'vidu-q2-t2v']) {
      const spec = getVideoModelSpec(id)!;
      for (const m of spec.modes) {
        const slug = resolveRouteIdentity(spec, m.mode).providerModelSlug;
        expect(['vidu/q3-pro', 'vidu/q3-turbo']).toContain(slug);
      }
    }
  });

  it('no Vidu spec advertises native multi-reference input', () => {
    for (const id of ['vidu-q2-reference', 'vidu-q2-i2v', 'vidu-q2-t2v']) {
      const spec = getVideoModelSpec(id)!;
      for (const m of spec.modes) {
        expect(m.mode).not.toBe('reference');
        expect(m.inputs?.referenceImages ?? 0).toBe(0);
      }
    }
  });

  it('reference uploads never resolve to a mode the runtime cannot execute', () => {
    // The runtime feeds referenceImages[0] as the start image, so the mode the
    // gate sees is i2v (or firstLast) — never `reference`.
    const mode: VideoMode = resolveGenerationMode('vidu-q2-reference', { hasFirstFrame: true });
    expect(mode).toBe('i2v');
    expect(getVideoModelSpec('vidu-q2-reference')!.modes.some((m) => m.mode === mode)).toBe(true);
    expect(src).toMatch(/startImageUrl \?\? \(Array\.isArray\(referenceImages\)/);
  });

  it('first+last requires a start image', () => {
    for (const id of ['vidu-q2-reference', 'vidu-q2-i2v']) {
      const fl = getVideoModelSpec(id)!.modes.find((m) => m.mode === 'firstLast')!;
      expect(fl.inputs?.firstFrame).toBe(true);
      expect(fl.inputs?.lastFrameRequiresFirstFrame).toBe(true);
    }
  });
});

describe('repo-wide: no contradictory hand-written provider slug', () => {
  const GENERATORS = [
    'generate-wan-video',
    'generate-vidu-video',
    'generate-kling-video',
    'generate-seedance-video',
    'generate-seedance25-video',
    'generate-veo-video',
    'generate-hailuo-video',
    'generate-ltx-video',
    'generate-grok-video',
    'generate-luma-video',
    'generate-happyhorse-video',
    'generate-pika-video',
  ];

  for (const fn of GENERATORS) {
    it(`${fn}: every hardcoded slug exists in canonical`, () => {
      if (INTENTIONAL_MAPS[fn]) return; // documented exception
      for (const slug of slugLiterals(FN(fn))) {
        expect(CANONICAL_SLUGS, `${fn} dispatches "${slug}" which canonical does not know`).toContain(slug);
      }
    });
  }
});

describe('parity provider slug is diagnostic, not persisted', () => {
  it('parityKeyString carries the executed provider contract', () => {
    const spec = getVideoModelSpec('wan-2-7-standard')!;
    const key = parityKeyOf(spec, 'i2v', '720p');
    expect(key.providerModelSlug).toBe('wan-video/wan-2.7-i2v');
    expect(parityKeyString(key)).toContain('wan-video/wan-2.7-i2v');
  });

  it('the persisted parity context deliberately has no slug column', () => {
    const gateSrc = readFileSync(
      join(process.cwd(), 'supabase', 'functions', '_shared', 'videoCapabilityGate.ts'),
      'utf8',
    );
    const iface = gateSrc.slice(
      gateSrc.indexOf('export interface ParityContextColumns'),
      gateSrc.indexOf('export interface CapabilityGateResult'),
    );
    expect(iface).not.toMatch(/provider_model_slug/);
    // and the slug must never be smuggled into api_route
    expect(iface).toMatch(/parity_api_route: string;/);
  });
});

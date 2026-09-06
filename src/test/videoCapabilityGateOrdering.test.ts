import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The capability gate is only worth anything if it runs FIRST. This test reads
 * the edge functions as source and asserts the ordering contract:
 *
 *   parse body -> capability gate -> wallet -> deduct -> provider
 *
 * It also forbids the silent-clamp patterns the parity upgrade removed.
 */

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

const GENERATORS = readdirSync(FUNCTIONS_DIR).filter(
  (name) => name.startsWith('generate-') && name.endsWith('-video'),
);

function source(fn: string): string {
  return readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf8');
}

const WALLET_MARKERS = [
  "from('ai_video_wallets')",
  'from("ai_video_wallets")',
  'deduct_ai_video_credits',
];

const PROVIDER_MARKERS = [
  'replicate.predictions.create',
  'predictions.create',
  'fetch(MODELARK',
  'createModelArkTask',
];

function firstIndexOf(src: string, markers: string[]): number {
  const hits = markers.map((m) => src.indexOf(m)).filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

describe('every video generator runs the capability gate first', () => {
  it('found the generator functions', () => {
    expect(GENERATORS.length).toBeGreaterThanOrEqual(13);
  });

  for (const fn of GENERATORS) {
    it(`${fn}: imports and calls the shared gate`, () => {
      const src = source(fn);
      expect(src, `${fn} does not import the capability gate`).toContain('videoCapabilityGate.ts');
      expect(src, `${fn} never calls capabilityGate()`).toMatch(/capabilityGate\(/);
    });

    it(`${fn}: gate runs before wallet, deduction and provider dispatch`, () => {
      const src = source(fn);
      const gateIndex = src.indexOf('capabilityGate(\n');
      expect(gateIndex, `${fn}: no gate call found`).toBeGreaterThan(0);

      const walletIndex = firstIndexOf(src, WALLET_MARKERS);
      if (walletIndex >= 0) {
        expect(gateIndex, `${fn}: wallet is touched before the gate`).toBeLessThan(walletIndex);
      }
      const providerIndex = firstIndexOf(src, PROVIDER_MARKERS);
      if (providerIndex >= 0) {
        expect(gateIndex, `${fn}: provider is called before the gate`).toBeLessThan(providerIndex);
      }
    });

    it(`${fn}: no silent clamps left`, () => {
      const src = source(fn);
      const forbidden: Array<[RegExp, string]> = [
        [/const snapDuration\b/, 'duration snapping'],
        [/Math\.abs\([^)]*duration/i, 'nearest-duration snapping'],
        [/duration\s*>\s*10\s*\?\s*'1080p'/, 'silent resolution downgrade'],
        [/SUPPORTED_ASPECT_RATIOS\.includes\([^)]*\)\s*\?/, 'aspect-ratio fallback'],
        [/aspectRatio\s*\|\|\s*'16:9'/, 'aspect-ratio default rewrite'],
      ];
      for (const [pattern, label] of forbidden) {
        expect(pattern.test(src), `${fn} still contains ${label}`).toBe(false);
      }
    });
  }
});

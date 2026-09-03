import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  VIDEO_PRICING_CATALOG,
  PREMIUM_ENGINE_CATALOG_IDS,
} from '@/lib/cost/videoPricingCatalog';
import {
  COMPOSER_SOURCE_TO_CATALOG,
  NON_CATALOG_CLIP_COSTS,
  buildComposerCostTable,
} from '@/lib/cost/composerSourceToCatalog';
import { VIDEO_PROVIDER_MARGINS, computeMarginPct } from '@/lib/cost/videoProviderMargins';
import { USD_PER_EUR } from '@/lib/cost/fx';
import { CLIP_SOURCE_COSTS } from '@/types/video-composer';

const ROOT = resolve(__dirname, '../../../..');
const SHARED_CATALOG = resolve(ROOT, 'supabase/functions/_shared/videoPricingCatalog.ts');
const SHARED_MAP = resolve(ROOT, 'supabase/functions/_shared/composerSourceToCatalog.ts');

/** Extract `id: sellEUR/costEUR` pairs from the Deno-side catalog source. */
function parseSharedCatalog(): Record<string, { sellEUR: number; costEUR: number }> {
  const src = readFileSync(SHARED_CATALOG, 'utf8');
  const out: Record<string, { sellEUR: number; costEUR: number }> = {};
  const rowRe = /\{\s*id:\s*'([^']+)'[^}]*?sellEUR:\s*([\d.]+)[^}]*?costEUR:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(src)) !== null) {
    out[m[1]] = { sellEUR: Number(m[2]), costEUR: Number(m[3]) };
  }
  return out;
}

function parseSharedSourceMap(): Record<string, { standard: string; pro: string }> {
  const src = readFileSync(SHARED_MAP, 'utf8');
  const out: Record<string, { standard: string; pro: string }> = {};
  const rowRe = /'([a-z0-9-]+)':\s*\{\s*standard:\s*'([^']+)',\s*pro:\s*'([^']+)'\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(src)) !== null) {
    out[m[1]] = { standard: m[2], pro: m[3] };
  }
  return out;
}

// Seedance 2.5 720p was deliberately repriced to a 10.00 EUR / 30 s headline
// price on 03.09.2026, which lands below the 1.75x margin floor (~1.54x).
const MARGIN_FLOOR_EXCEPTIONS = new Set(['seedance-2-5']);

describe('pricing catalog — 1.75× minimum margin policy', () => {
  it('every model sells at >= 1.75× provider cost (20.08.2026 re-pricing)', () => {
    const offenders: string[] = [];
    for (const entry of Object.values(VIDEO_PRICING_CATALOG)) {
      if (MARGIN_FLOOR_EXCEPTIONS.has(entry.id)) continue;
      const factor = entry.sellEUR / entry.costEUR;
      if (factor < 1.75) {
        offenders.push(`${entry.id}: ${factor.toFixed(2)}×`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Seedance 2.5 keeps the agreed 30 s price points (720p 10.00 EUR / 11.50 USD, 480p 5.80 EUR)', () => {
    expect(VIDEO_PRICING_CATALOG['seedance-2-5'].sellEUR * 30).toBeCloseTo(10.0, 2);
    expect(VIDEO_PRICING_CATALOG['seedance-2-5'].sellUSD * 30).toBeCloseTo(11.5, 2);
    expect(VIDEO_PRICING_CATALOG['seedance-2-5-480p'].sellEUR * 30).toBeCloseTo(5.8, 2);
  });

  it('sellUSD is derived from sellEUR with the shared FX factor (1 EUR = 1.15 USD)', () => {
    for (const entry of Object.values(VIDEO_PRICING_CATALOG)) {
      expect(entry.sellUSD).toBe(Math.round(entry.sellEUR * USD_PER_EUR * 10000) / 10000);
    }
  });
});

describe('client ↔ edge-function catalog parity', () => {
  it('shared catalog has the same ids and prices as the client mirror', () => {
    const shared = parseSharedCatalog();
    expect(Object.keys(shared).sort()).toEqual(Object.keys(VIDEO_PRICING_CATALOG).sort());
    for (const [id, row] of Object.entries(shared)) {
      expect(`${id}:${VIDEO_PRICING_CATALOG[id].sellEUR}`).toBe(`${id}:${row.sellEUR}`);
      expect(`${id}:${VIDEO_PRICING_CATALOG[id].costEUR}`).toBe(`${id}:${row.costEUR}`);
    }
  });

  it('shared composer source map matches the client mirror', () => {
    const shared = parseSharedSourceMap();
    const clientKeys = Object.keys(COMPOSER_SOURCE_TO_CATALOG).sort();
    expect(Object.keys(shared).sort()).toEqual(clientKeys);
    for (const key of clientKeys) {
      expect(shared[key]).toEqual(COMPOSER_SOURCE_TO_CATALOG[key]);
    }
  });
});

describe('composer billing rail', () => {
  it('every composer source maps to an existing catalog entry', () => {
    for (const [source, tiers] of Object.entries(COMPOSER_SOURCE_TO_CATALOG)) {
      expect(VIDEO_PRICING_CATALOG[tiers.standard], `${source}/standard`).toBeDefined();
      expect(VIDEO_PRICING_CATALOG[tiers.pro], `${source}/pro`).toBeDefined();
    }
  });

  it('CLIP_SOURCE_COSTS is fully derived from the catalog', () => {
    const derived = buildComposerCostTable();
    expect(CLIP_SOURCE_COSTS).toEqual(derived);
  });

  it('covers all clip sources incl. non-catalog rails', () => {
    const sources = [
      ...Object.keys(COMPOSER_SOURCE_TO_CATALOG),
      ...Object.keys(NON_CATALOG_CLIP_COSTS),
    ];
    for (const s of sources) {
      expect(CLIP_SOURCE_COSTS[s as keyof typeof CLIP_SOURCE_COSTS]).toBeDefined();
    }
  });

  it('never sells a composer clip below provider cost', () => {
    const offenders: string[] = [];
    for (const [source, tiers] of Object.entries(COMPOSER_SOURCE_TO_CATALOG)) {
      for (const tier of ['standard', 'pro'] as const) {
        const entry = VIDEO_PRICING_CATALOG[tiers[tier]];
        const sellPerSec = entry.unit === 'per-clip'
          ? entry.sellEUR / (entry.fixedClipSeconds || 5)
          : entry.sellEUR;
        const costPerSec = entry.unit === 'per-clip'
          ? entry.costEUR / (entry.fixedClipSeconds || 5)
          : entry.costEUR;
        const booked = CLIP_SOURCE_COSTS[source as keyof typeof CLIP_SOURCE_COSTS][tier];
        if (booked + 1e-9 < costPerSec) offenders.push(`${source}/${tier}`);
        expect(booked).toBeCloseTo(+sellPerSec.toFixed(4), 4);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('admin margin table', () => {
  it('is derived 1:1 from the catalog', () => {
    expect(VIDEO_PROVIDER_MARGINS).toHaveLength(Object.keys(VIDEO_PRICING_CATALOG).length);
    for (const row of VIDEO_PROVIDER_MARGINS) {
      const entry = VIDEO_PRICING_CATALOG[row.id];
      expect(entry).toBeDefined();
      expect(row.sellEUR).toBe(entry.sellEUR);
      expect(row.costEUR).toBe(entry.costEUR);
      expect(row.tier).toBe(PREMIUM_ENGINE_CATALOG_IDS.has(row.id) ? 'premium-engine' : 'standard');
      // Seedance 2.5 720p is the documented low-margin headline price (see above).
      if (!MARGIN_FLOOR_EXCEPTIONS.has(row.id)) {
        expect(computeMarginPct(row)).toBeGreaterThan(0.42);
      }
    }
  });
});

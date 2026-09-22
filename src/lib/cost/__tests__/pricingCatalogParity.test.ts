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
import { USD_PER_EUR, breakEvenSellEUR, BREAK_EVEN_FACTOR } from '@/lib/cost/fx';
import { CLIP_SOURCE_COSTS } from '@/types/video-composer';

const ROOT = resolve(__dirname, '../../../..');
const SHARED_CATALOG = resolve(ROOT, 'supabase/functions/_shared/videoPricingCatalog.ts');
const SHARED_MAP = resolve(ROOT, 'supabase/functions/_shared/composerSourceToCatalog.ts');

/**
 * Extract `id: costEUR` from the Deno-side catalog source. Since the
 * break-even policy (22.09.2026) only the provider cost is maintained; the
 * sell price is derived from it on both sides.
 */
function parseSharedCatalog(): Record<string, { sellEUR: number; costEUR: number }> {
  const src = readFileSync(SHARED_CATALOG, 'utf8');
  const out: Record<string, { sellEUR: number; costEUR: number }> = {};
  const rowRe = /\{\s*id:\s*'([^']+)'[^}]*?costEUR:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(src)) !== null) {
    const costEUR = Number(m[2]);
    out[m[1]] = { sellEUR: breakEvenSellEUR(costEUR), costEUR };
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

describe('pricing catalog — break-even policy (22.09.2026)', () => {
  it('every model sells at exactly the break-even factor over provider cost', () => {
    const offenders: string[] = [];
    for (const entry of Object.values(VIDEO_PRICING_CATALOG)) {
      if (Math.abs(entry.sellEUR - breakEvenSellEUR(entry.costEUR)) > 1e-4) {
        offenders.push(`${entry.id}: ${entry.sellEUR} != ${breakEvenSellEUR(entry.costEUR)}`);
      }
    }
    expect(offenders).toEqual([]);
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
      // Break-even policy: the gross margin only covers VAT, payment fees
      // and the Founder discount — it is identical for every row.
      expect(computeMarginPct(row)).toBeCloseTo(1 - 1 / BREAK_EVEN_FACTOR, 3);
    }
  });
});

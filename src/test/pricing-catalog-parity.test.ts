/**
 * Pricing parity — the UI must never advertise a price the backend does not charge.
 *
 * The backend catalog (`supabase/functions/_shared/videoPricingCatalog.ts`) is
 * the single source of truth; every model offered in the UI registry must exist
 * there and the local fallback price must match it. Mismatches silently produced
 * "estimated cost ≠ charged cost" for users, so they now fail the build.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AI_VIDEO_TOOLKIT_MODELS } from '@/config/aiVideoModelRegistry';
import { USD_PER_EUR } from '@/lib/cost/fx';
import { VIDEO_PRICING_CATALOG as CLIENT_CATALOG } from '@/lib/cost/videoPricingCatalog';

function loadBackendCatalog(): Record<string, { sellEUR: number; sellUSD: number }> {
  const src = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/videoPricingCatalog.ts'),
    'utf8',
  );
  const out: Record<string, { sellEUR: number; sellUSD: number }> = {};
  const re = /'([^']+)':\s*\{\s*id:\s*'[^']+',[^}]*?sellEUR:\s*([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const sellEUR = Number(m[2]);
    // USD is derived from EUR in the catalog, never hand-maintained.
    out[m[1]] = { sellEUR, sellUSD: Math.round(sellEUR * USD_PER_EUR * 10000) / 10000 };
  }
  return out;
}

describe('video pricing parity (UI ↔ backend catalog)', () => {
  const catalog = loadBackendCatalog();

  it('parses the backend catalog', () => {
    expect(Object.keys(catalog).length).toBeGreaterThan(10);
  });

  it.each(AI_VIDEO_TOOLKIT_MODELS.map((m) => [m.id, m] as const))(
    'model %s exists in the backend catalog with matching price',
    (id, model) => {
      const entry = catalog[id];
      expect(entry, `model "${id}" is missing from the backend pricing catalog`).toBeTruthy();
      expect(model.costPerSecond.EUR).toBeCloseTo(entry!.sellEUR, 4);
      expect(model.costPerSecond.USD).toBeCloseTo(entry!.sellUSD, 4);
    },
  );
});

/**
 * v510 — the client mirror must also agree on DURATIONS, not just prices.
 * A divergent min/max duration let the UI offer a length the catalog does not
 * price (and the capability gate then rejects after the user committed).
 */
function loadBackendRows(): Record<string, Record<string, number>> {
  const src = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/videoPricingCatalog.ts'),
    'utf8',
  );
  const out: Record<string, Record<string, number>> = {};
  const re = /'([^']+)':\s*\{\s*id:\s*'[^']+',([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const row: Record<string, number> = {};
    for (const key of ['sellEUR', 'costEUR', 'minDuration', 'maxDuration', 'fixedClipSeconds']) {
      const v = new RegExp(`${key}:\\s*([\\d.]+)`).exec(m[2]);
      if (v) row[key] = Number(v[1]);
    }
    out[m[1]] = row;
  }
  return out;
}

describe('pricing catalog mirror (client ↔ server)', () => {
  const backend = loadBackendRows();

  it('has the same row set on both sides', () => {
    expect(Object.keys(CLIENT_CATALOG).sort()).toEqual(Object.keys(backend).sort());
  });

  it.each(Object.keys(backend))('row %s matches price and duration bounds', (id) => {
    const server = backend[id];
    const client = (CLIENT_CATALOG as Record<string, any>)[id];
    expect(client, `row "${id}" missing in the client mirror`).toBeTruthy();
    for (const key of ['sellEUR', 'costEUR', 'minDuration', 'maxDuration', 'fixedClipSeconds']) {
      expect(client[key] ?? null, `${id}.${key}`).toEqual(server[key] ?? null);
    }
  });
});

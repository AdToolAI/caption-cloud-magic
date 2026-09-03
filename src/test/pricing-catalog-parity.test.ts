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

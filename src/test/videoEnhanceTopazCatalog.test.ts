/**
 * Topaz catalogue parity.
 *
 * The server catalogue is the authority for what may reach the provider; the
 * client mirror only adds labels. A drift between the two would offer a model
 * the express endpoint rejects — or price a run on the wrong credit table.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  TOPAZ_INTERPOLATION_VIEWS,
  TOPAZ_VIDEO_MODEL_VIEWS,
  topazModelView,
  topazScaleFitsView,
} from '@/config/videoEnhanceModels/topazCatalog';
import { VIDEO_ENHANCE_MODELS } from '@/config/videoEnhanceModels/models';
import { VIDEO_RATE_CARDS } from '@/lib/videoEnhance/rates';

const serverSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/topaz-video-catalog.ts'),
  'utf8',
);

interface ServerEntry {
  id: string;
  slug: string;
  family: string;
  fixed?: number;
  manual: boolean;
  verified: boolean;
}

/**
 * Field-scan rather than one long pattern: the catalogue gains fields over
 * time, and a positional regex would silently stop matching entries instead
 * of failing loudly.
 */
function serverEntries(): ServerEntry[] {
  const body = serverSource.slice(serverSource.indexOf('TOPAZ_VIDEO_MODELS'));
  const blocks = body.split(/\n\s*\{\s*\n/).slice(1);
  const out: ServerEntry[] = [];
  for (const block of blocks) {
    const id = /\bid:\s*'([a-z0-9-]+)'/.exec(block)?.[1];
    const slug = /\bslug:\s*'([a-z0-9-]+)'/.exec(block)?.[1];
    const family = /\bcreditFamily:\s*'(precision|restoration)'/.exec(block)?.[1];
    if (!id || !slug || !family) continue;
    const fixed = /\bfixedUpscale:\s*(\d+)/.exec(block)?.[1];
    out.push({
      id,
      slug,
      family,
      fixed: fixed ? Number(fixed) : undefined,
      manual: /\bmanualParameters:\s*true/.test(block),
      verified: /\bcostVerified:\s*true/.test(block),
    });
  }
  return out;
}


describe('Topaz video catalogue parity', () => {
  const server = serverEntries();

  it('parses the server catalogue', () => {
    expect(server.length).toBe(TOPAZ_VIDEO_MODEL_VIEWS.length);
    expect(server.length).toBeGreaterThan(5);
  });

  it.each(TOPAZ_VIDEO_MODEL_VIEWS.map((m) => [m.id, m] as const))(
    '%s matches the server entry',
    (id, view) => {
      const entry = server.find((e) => e.id === id);
      expect(entry, `model "${id}" missing on the server`).toBeTruthy();
      expect(view.slug).toBe(entry!.slug);
      expect(view.creditFamily).toBe(entry!.family);
      expect(view.fixedUpscale).toBe(entry!.fixed);
    },
  );

  it('offers every catalogue model as a processing mode', () => {
    const topaz = VIDEO_ENHANCE_MODELS.find((m) => m.id === 'topaz-video-upscale')!;
    expect(topaz.processingModes.map((m) => m.id).sort()).toEqual(
      TOPAZ_VIDEO_MODEL_VIEWS.map((m) => m.id).sort(),
    );
  });

  it('prices every model, and restoration models below the precision table', () => {
    const card = VIDEO_RATE_CARDS['topaz-video-upscale'];
    if (card.type !== 'per_unit') throw new Error('expected a per_unit card');
    for (const model of TOPAZ_VIDEO_MODEL_VIEWS) {
      const table = card.unitsPerOutputSecondByMode?.[model.id];
      expect(table, `no credit table for ${model.id}`).toBeTruthy();
      expect(table!['4k']).toBeGreaterThan(0);
    }
    const precision = card.unitsPerOutputSecondByMode!['proteus']['4k']!;
    const restoration = card.unitsPerOutputSecondByMode!['nyx']['4k']!;
    expect(restoration).toBeLessThan(precision);
  });

  it('names an interpolation model for every documented express slug', () => {
    for (const view of TOPAZ_INTERPOLATION_VIEWS) {
      expect(serverSource).toContain(`slug: '${view.slug}'`);
    }
  });

  it('blocks a fixed-factor model at the wrong target size', () => {
    const rhea = topazModelView('rhea');
    const source = { width: 1920, height: 1080 };
    expect(topazScaleFitsView(rhea, source, { width: 3840, height: 2160 })).toBe(false);
    expect(topazScaleFitsView(rhea, { width: 960, height: 540 }, { width: 3840, height: 2160 })).toBe(
      true,
    );
    // The general-purpose model has no fixed factor and always fits.
    expect(topazModelView('proteus').fixedUpscale).toBeUndefined();
    expect(topazScaleFitsView(topazModelView('proteus'), source, { width: 3840, height: 2160 })).toBe(
      true,
    );
  });
});

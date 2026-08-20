// ============================================================================
// Composer clip source → canonical pricing-catalog ID (client mirror)
// ----------------------------------------------------------------------------
// Mirror of supabase/functions/_shared/composerSourceToCatalog.ts.
// Parity is enforced by src/lib/cost/__tests__/pricingCatalogParity.test.ts.
// ============================================================================

import { VIDEO_PRICING_CATALOG } from './videoPricingCatalog';

export type ClipQualityTier = 'standard' | 'pro';

export const COMPOSER_SOURCE_TO_CATALOG: Record<string, Record<ClipQualityTier, string>> = {
  'ai-hailuo':     { standard: 'hailuo-standard', pro: 'hailuo-pro' },
  'ai-kling':      { standard: 'kling-omni', pro: 'kling-omni' },
  'ai-kling-omni': { standard: 'kling-omni', pro: 'kling-omni' },
  'ai-sora':       { standard: 'sora-2-standard', pro: 'sora-2-pro' },
  'ai-wan':        { standard: 'wan-standard', pro: 'wan-pro' },
  'ai-seedance':   { standard: 'seedance-mini', pro: 'seedance-mini-1080p' },
  'ai-seedance25': { standard: 'seedance-2-5-480p', pro: 'seedance-2-5' },
  'ai-luma':       { standard: 'luma-standard', pro: 'luma-pro' },
  'ai-veo':        { standard: 'veo-3.1-fast', pro: 'veo-3.1-pro' },
  'ai-runway':     { standard: 'runway-gen4-aleph', pro: 'runway-gen4-aleph' },
  'ai-pika':       { standard: 'pika-2-2-standard', pro: 'pika-2-2-pro' },
  'ai-happyhorse': { standard: 'happyhorse-standard', pro: 'happyhorse-pro' },
  'ai-vidu':       { standard: 'vidu-q2-reference', pro: 'vidu-q2-reference' },
};

export const NON_CATALOG_CLIP_COSTS: Record<string, Record<ClipQualityTier, number>> = {
  'ai-image':    { standard: 0.01, pro: 0.015 },
  stock:         { standard: 0, pro: 0 },
  'stock-image': { standard: 0, pro: 0 },
  upload:        { standard: 0, pro: 0 },
};

export function catalogPricePerSecond(catalogId: string): number {
  const entry = VIDEO_PRICING_CATALOG[catalogId];
  if (!entry) return 0;
  if (entry.unit === 'per-clip') {
    const seconds = entry.fixedClipSeconds || 5;
    return +(entry.sellEUR / seconds).toFixed(4);
  }
  return entry.sellEUR;
}

/** Derived composer cost table — identical to the Edge-Function table. */
export function buildComposerCostTable(): Record<string, Record<ClipQualityTier, number>> {
  const table: Record<string, Record<ClipQualityTier, number>> = {};
  for (const [source, tiers] of Object.entries(COMPOSER_SOURCE_TO_CATALOG)) {
    table[source] = {
      standard: catalogPricePerSecond(tiers.standard),
      pro: catalogPricePerSecond(tiers.pro),
    };
  }
  for (const [source, tiers] of Object.entries(NON_CATALOG_CLIP_COSTS)) {
    table[source] = { ...tiers };
  }
  return table;
}

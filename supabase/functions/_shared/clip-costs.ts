/**
 * Canonical per-second cost table for AI video clip generation.
 *
 * Derived — NOT hand-maintained. Every value comes from
 * `videoPricingCatalog.ts` via `composerSourceToCatalog.ts`, so the dispatcher
 * (`compose-video-clips`), the refund path (`compose-clip-webhook`) and the
 * recovery job can never drift from the price the user was quoted.
 *
 * Margin policy: sell = exactly 3.00× provider cost.
 * Mirrored client-side in `src/types/video-composer.ts` (CLIP_SOURCE_COSTS),
 * guarded by `src/lib/cost/__tests__/pricingCatalogParity.test.ts`.
 */
import { VIDEO_PRICING_CATALOG } from "./videoPricingCatalog.ts";
import {
  COMPOSER_SOURCE_TO_CATALOG,
  NON_CATALOG_CLIP_COSTS,
} from "./composerSourceToCatalog.ts";

export type ClipQuality = "standard" | "pro";

function perSecond(catalogId: string): number {
  const entry = VIDEO_PRICING_CATALOG[catalogId];
  if (!entry) return 0;
  if (entry.unit === "per-clip") {
    const seconds = entry.fixedClipSeconds || 5;
    return +(entry.sellEUR / seconds).toFixed(4);
  }
  return entry.sellEUR;
}

function buildTable(): Record<string, Record<ClipQuality, number>> {
  const table: Record<string, Record<ClipQuality, number>> = {};
  for (const [source, tiers] of Object.entries(COMPOSER_SOURCE_TO_CATALOG)) {
    table[source] = {
      standard: perSecond(tiers.standard),
      pro: perSecond(tiers.pro),
    };
  }
  for (const [source, tiers] of Object.entries(NON_CATALOG_CLIP_COSTS)) {
    table[source] = { ...tiers };
  }
  return table;
}

export const CLIP_COSTS: Record<string, Record<ClipQuality, number>> = buildTable();

/** Per-second cost lookup with safe fallback (matches legacy 0.15 €/s default). */
export function clipCostPerSecond(
  source: string | null | undefined,
  quality: ClipQuality | string | null | undefined,
  fallback = 0.15,
): number {
  const q: ClipQuality = quality === "pro" ? "pro" : "standard";
  const row = source ? CLIP_COSTS[source] : undefined;
  return row?.[q] ?? fallback;
}

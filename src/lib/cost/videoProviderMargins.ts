/**
 * Video-Provider Margin view — DERIVED from the canonical pricing catalog.
 * --------------------------------------------------------------
 * Scope: ONLY direct AI video providers (text/image-to-video).
 * Lipsync (Sync.so), HeyGen Talking Head, ElevenLabs Audio,
 * Music Studio and Picture Studio run on separate rails and are
 * intentionally excluded here.
 *
 * Used by:
 *   - Admin → Cost Monitor → "Video-Provider Live-Marge" card
 *   - QA cockpit margin checks
 *
 * No hand-maintained numbers: every row comes from
 * `src/lib/cost/videoPricingCatalog.ts` (sell = 3.00× cost).
 */

import {
  VIDEO_PRICING_CATALOG,
  PREMIUM_ENGINE_CATALOG_IDS,
} from './videoPricingCatalog';

export type MarginTier = 'standard' | 'premium-engine';

export interface VideoProviderMargin {
  /** Stable provider key (matches catalog + client config ids) */
  id: string;
  /** Friendly display name */
  label: string;
  /** Pricing unit — most providers are per-second; Vidu is flat per clip */
  unit: 'per-second' | 'per-clip';
  /** User-facing sell price in EUR (per second OR per clip) */
  sellEUR: number;
  /** Real provider cost in EUR (same unit as sell) */
  costEUR: number;
  /** Marketing tier — drives Premium-Engine badge in UI */
  tier: MarginTier;
}

export const VIDEO_PROVIDER_MARGINS: VideoProviderMargin[] = Object.values(
  VIDEO_PRICING_CATALOG,
).map((entry) => ({
  id: entry.id,
  label: entry.label,
  unit: entry.unit,
  sellEUR: entry.sellEUR,
  costEUR: entry.costEUR,
  tier: PREMIUM_ENGINE_CATALOG_IDS.has(entry.id) ? 'premium-engine' : 'standard',
}));

export const MARGIN_FLOOR = 0.66; // warn if margin < 66% (drift below 2.94× target)

export function computeMarginPct(row: Pick<VideoProviderMargin, 'sellEUR' | 'costEUR'>): number {
  if (row.sellEUR <= 0) return 0;
  return (row.sellEUR - row.costEUR) / row.sellEUR;
}

/** Average blended margin across the whole list (un-weighted, for at-a-glance KPI). */
export function blendedMargin(rows: VideoProviderMargin[] = VIDEO_PROVIDER_MARGINS): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((acc, r) => acc + computeMarginPct(r), 0);
  return total / rows.length;
}

/** Quick lookup for the Premium-Engine badge in provider pickers. */
export function isPremiumEngine(providerId: string | null | undefined): boolean {
  if (!providerId) return false;
  return PREMIUM_ENGINE_CATALOG_IDS.has(providerId);
}

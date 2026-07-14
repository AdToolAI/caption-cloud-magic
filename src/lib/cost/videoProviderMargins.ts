/**
 * Video-Provider Margin Single-Source-of-Truth
 * --------------------------------------------------------------
 * Centralized view of {sell price | real provider cost | margin %}
 * across all 11 AI video providers (plus Runway + Pika).
 *
 * Scope: ONLY direct AI video providers (text/image-to-video).
 * Lipsync (Sync.so), HeyGen Talking Head, ElevenLabs Audio,
 * Music Studio and Picture Studio are tracked separately and
 * intentionally excluded here.
 *
 * Used by:
 *   - Admin → Cost Monitor → "Video-Provider Live-Marge" card
 *   - QA cockpit margin checks
 *
 * Costs based on Replicate / Runway public list prices, June 2026.
 * NORMALIZED 14.07.2026: All sell prices set to exactly 3.00× cost.
 * Tier `premium-engine` flags ultra-expensive frontier models
 * (Sora/Veo/Grok) that get a transparency badge in the UI.
 */

export type MarginTier = 'standard' | 'premium-engine';

export interface VideoProviderMargin {
  /** Stable provider key (matches client config ids) */
  id: string;
  /** Friendly display name */
  label: string;
  /** Pricing unit — most providers are per-second; Vidu Q2 is flat per clip */
  unit: 'per-second' | 'per-clip';
  /** User-facing sell price in EUR (per second OR per clip) */
  sellEUR: number;
  /** Estimated real Replicate / Runway cost in EUR (same unit as sell) */
  costEUR: number;
  /** Marketing tier — drives Premium-Engine badge in UI */
  tier: MarginTier;
}

/**
 * Canonical price list. Keep in sync with `src/config/*VideoCredits.ts`
 * and `supabase/functions/generate-{pika,runway}-video/index.ts`.
 */
export const VIDEO_PROVIDER_MARGINS: VideoProviderMargin[] = [
  // Hailuo
  { id: 'hailuo-standard', label: 'Hailuo 2.3 Std 768p', unit: 'per-second', sellEUR: 0.14, costEUR: 0.045, tier: 'standard' },
  { id: 'hailuo-pro',      label: 'Hailuo 2.3 Pro 1080p', unit: 'per-second', sellEUR: 0.23, costEUR: 0.075, tier: 'standard' },
  // HappyHorse
  { id: 'happyhorse-standard', label: 'HappyHorse 720p', unit: 'per-second', sellEUR: 0.42, costEUR: 0.14, tier: 'standard' },
  { id: 'happyhorse-pro',      label: 'HappyHorse Pro 1080p', unit: 'per-second', sellEUR: 0.84, costEUR: 0.28, tier: 'standard' },
  // Seedance
  { id: 'seedance-mini',     label: 'Seedance 2.0 Mini', unit: 'per-second', sellEUR: 0.06, costEUR: 0.02, tier: 'standard' },
  { id: 'seedance-standard', label: 'Seedance 2.0 Std', unit: 'per-second', sellEUR: 0.09, costEUR: 0.03, tier: 'standard' },
  { id: 'seedance-pro',      label: 'Seedance 2.0 Pro', unit: 'per-second', sellEUR: 0.18, costEUR: 0.06, tier: 'standard' },
  // Kling
  { id: 'kling-3-standard', label: 'Kling 3 Std 720p', unit: 'per-second', sellEUR: 0.18, costEUR: 0.06, tier: 'standard' },
  { id: 'kling-3-pro',      label: 'Kling 3 Pro 1080p', unit: 'per-second', sellEUR: 0.30, costEUR: 0.10, tier: 'standard' },
  // Wan 2.5 / 2.6
  { id: 'wan-standard',     label: 'Wan 2.5 Std', unit: 'per-second', sellEUR: 0.12, costEUR: 0.04, tier: 'standard' },
  { id: 'wan-pro',          label: 'Wan 2.5 Pro', unit: 'per-second', sellEUR: 0.21, costEUR: 0.07, tier: 'standard' },
  { id: 'wan-2-6-standard', label: 'Wan 2.6 Std', unit: 'per-second', sellEUR: 0.12, costEUR: 0.04, tier: 'standard' },
  { id: 'wan-2-6-pro',      label: 'Wan 2.6 Pro', unit: 'per-second', sellEUR: 0.21, costEUR: 0.07, tier: 'standard' },
  // Luma
  { id: 'luma-standard', label: 'Luma Ray 2 Std', unit: 'per-second', sellEUR: 0.21, costEUR: 0.07, tier: 'standard' },
  { id: 'luma-pro',      label: 'Luma Ray 2 Pro', unit: 'per-second', sellEUR: 0.36, costEUR: 0.12, tier: 'standard' },
  // LTX
  { id: 'ltx-standard', label: 'LTX 2.0 Std', unit: 'per-second', sellEUR: 0.06, costEUR: 0.02, tier: 'standard' },
  { id: 'ltx-pro',      label: 'LTX 2.0 Pro', unit: 'per-second', sellEUR: 0.12, costEUR: 0.04, tier: 'standard' },
  // Vidu Q2 (flat 5s)
  { id: 'vidu-q2-reference', label: 'Vidu Q2 Reference (5s)', unit: 'per-clip', sellEUR: 0.66, costEUR: 0.22, tier: 'standard' },
  { id: 'vidu-q2-i2v',       label: 'Vidu Q2 I2V (5s)',       unit: 'per-clip', sellEUR: 0.60, costEUR: 0.20, tier: 'standard' },
  { id: 'vidu-q2-t2v',       label: 'Vidu Q2 T2V (5s)',       unit: 'per-clip', sellEUR: 0.60, costEUR: 0.20, tier: 'standard' },
  // Pika
  { id: 'pika-2-2-standard', label: 'Pika 2.2 Std', unit: 'per-second', sellEUR: 0.12, costEUR: 0.04, tier: 'standard' },
  { id: 'pika-2-2-pro',      label: 'Pika 2.2 Pro', unit: 'per-second', sellEUR: 0.27, costEUR: 0.09, tier: 'standard' },
  // Runway Gen-4 Aleph
  { id: 'runway-gen4-aleph', label: 'Runway Gen-4 Aleph', unit: 'per-second', sellEUR: 0.24, costEUR: 0.08, tier: 'standard' },
  // PREMIUM ENGINES — frontier models, user-visible disclaimer
  { id: 'veo-3.1-lite-720p',  label: 'Veo 3.1 Lite 720p',  unit: 'per-second', sellEUR: 0.45, costEUR: 0.15, tier: 'premium-engine' },
  { id: 'veo-3.1-lite-1080p', label: 'Veo 3.1 Lite 1080p', unit: 'per-second', sellEUR: 0.66, costEUR: 0.22, tier: 'premium-engine' },
  { id: 'veo-3.1-fast',       label: 'Veo 3.1 Fast 1080p', unit: 'per-second', sellEUR: 1.20, costEUR: 0.40, tier: 'premium-engine' },
  { id: 'veo-3.1-pro',        label: 'Veo 3.1 Pro 1080p',  unit: 'per-second', sellEUR: 3.30, costEUR: 1.10, tier: 'premium-engine' },
  { id: 'sora-2-standard',    label: 'Sora 2 Standard',    unit: 'per-second', sellEUR: 0.60, costEUR: 0.20, tier: 'premium-engine' },
  { id: 'sora-2-pro',         label: 'Sora 2 Pro',         unit: 'per-second', sellEUR: 1.35, costEUR: 0.45, tier: 'premium-engine' },
  { id: 'grok-imagine',       label: 'Grok Imagine',       unit: 'per-second', sellEUR: 0.45, costEUR: 0.15, tier: 'premium-engine' },
];

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
const PREMIUM_ENGINE_IDS = new Set(
  VIDEO_PROVIDER_MARGINS.filter((r) => r.tier === 'premium-engine').map((r) => r.id)
);

export function isPremiumEngine(providerId: string | null | undefined): boolean {
  if (!providerId) return false;
  return PREMIUM_ENGINE_IDS.has(providerId);
}

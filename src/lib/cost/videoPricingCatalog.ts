import { usdFromEur } from './fx';
// ============================================================================
// CLIENT MIRROR of supabase/functions/_shared/videoPricingCatalog.ts
// ----------------------------------------------------------------------------
// The Edge Functions cannot import from `src/`, and the client cannot import
// from `supabase/functions/`. Instead of two hand-maintained price tables, this
// file is a byte-comparable mirror of the shared catalog. The drift is guarded
// by `src/lib/cost/__tests__/pricingCatalogParity.test.ts`, which parses the
// shared file at test time and fails the build on any divergence.
//
// Margin policy (03.09.2026): sell x PAYMENT_NET_FACTOR (0.90) >= 1.75 x provider
// cost — the floor is measured on NET revenue, after payment-processing fees.
// AI video model (prices cut ~35% vs. the old 3.00× policy).
// Lip-Sync (Sync.so), ElevenLabs audio, Music and Picture Studio run on
// separate rails and are intentionally NOT part of this catalog.
// ============================================================================

export type CatalogEntry = {
  id: string;
  label: string;
  unit: 'per-second' | 'per-clip';
  sellEUR: number;
  /** Sell price in USD — DERIVED from sellEUR via USD_PER_EUR, never hand-maintained. */
  sellUSD: number;
  costEUR: number;
  minDuration?: number;
  maxDuration?: number;
  fixedClipSeconds?: number;
};

type CatalogSource = Omit<CatalogEntry, 'sellUSD'>;

const CATALOG_SOURCE: Record<string, CatalogSource> = {
  'hailuo-standard':      { id: 'hailuo-standard',      label: 'Hailuo 2.3 Std 768p',  unit: 'per-second', sellEUR: 0.1, costEUR: 0.045, minDuration: 3,  maxDuration: 10 },
  'hailuo-pro':           { id: 'hailuo-pro',           label: 'Hailuo 2.3 Pro 1080p', unit: 'per-second', sellEUR: 0.165, costEUR: 0.075, minDuration: 3,  maxDuration: 10 },

  'happyhorse-standard':  { id: 'happyhorse-standard',  label: 'HappyHorse 720p',      unit: 'per-second', sellEUR: 0.3, costEUR: 0.14,  minDuration: 3,  maxDuration: 15 },
  'happyhorse-pro':       { id: 'happyhorse-pro',       label: 'HappyHorse Pro 1080p', unit: 'per-second', sellEUR: 0.605, costEUR: 0.28,  minDuration: 3,  maxDuration: 15 },

  'seedance-mini':        { id: 'seedance-mini',        label: 'Seedance 1 Lite (Draft)', unit: 'per-second', sellEUR: 0.045, costEUR: 0.02,  minDuration: 3,  maxDuration: 15 },
  'seedance-mini-1080p':  { id: 'seedance-mini-1080p',  label: 'Seedance 1 Lite 1080p',   unit: 'per-second', sellEUR: 0.1, costEUR: 0.045, minDuration: 3, maxDuration: 15 },
  'seedance-standard':    { id: 'seedance-standard',    label: 'Seedance 2.0 Fast 720p',  unit: 'per-second', sellEUR: 0.32, costEUR: 0.15,  minDuration: 3,  maxDuration: 15 },
  'seedance-pro':         { id: 'seedance-pro',         label: 'Seedance 2.0 720p',       unit: 'per-second', sellEUR: 0.385, costEUR: 0.18,  minDuration: 3,  maxDuration: 15 },
  'seedance-2-5':         { id: 'seedance-2-5',         label: 'Seedance 2.5 (ModelArk)', unit: 'per-second', sellEUR: 0.3333, costEUR: 0.217, minDuration: 4,  maxDuration: 30 },
  'seedance-2-5-480p':    { id: 'seedance-2-5-480p',    label: 'Seedance 2.5 480p (ModelArk)', unit: 'per-second', sellEUR: 0.1932, costEUR: 0.1085, minDuration: 4,  maxDuration: 30 },

  'kling-3':              { id: 'kling-3',              label: 'Kling 3.0 1080p',      unit: 'per-second', sellEUR: 0.135, costEUR: 0.06,  minDuration: 3,  maxDuration: 15 },
  'kling-2.5-turbo':      { id: 'kling-2.5-turbo',      label: 'Kling 2.5 Turbo Pro',  unit: 'per-second', sellEUR: 0.07, costEUR: 0.03,  minDuration: 5,  maxDuration: 10 },
  'kling-2.6':            { id: 'kling-2.6',            label: 'Kling 2.6',            unit: 'per-second', sellEUR: 0.09, costEUR: 0.04,  minDuration: 5,  maxDuration: 15 },
  'kling-omni':           { id: 'kling-omni',           label: 'Kling 3.0 Omni',       unit: 'per-second', sellEUR: 0.43, costEUR: 0.20,  minDuration: 3,  maxDuration: 15 },

  'wan-standard':         { id: 'wan-standard',         label: 'Wan 2.5 Std',          unit: 'per-second', sellEUR: 0.09, costEUR: 0.04,  minDuration: 4,  maxDuration: 10 },
  'wan-pro':              { id: 'wan-pro',              label: 'Wan 2.5 Pro',          unit: 'per-second', sellEUR: 0.155, costEUR: 0.07,  minDuration: 4,  maxDuration: 10 },
  'wan-2-6-standard':     { id: 'wan-2-6-standard',     label: 'Wan 2.6 Std',          unit: 'per-second', sellEUR: 0.09, costEUR: 0.04,  minDuration: 4,  maxDuration: 15 },
  'wan-2-6-pro':          { id: 'wan-2-6-pro',          label: 'Wan 2.6 Pro',          unit: 'per-second', sellEUR: 0.155, costEUR: 0.07,  minDuration: 4,  maxDuration: 15 },
  'wan-2-7-standard':     { id: 'wan-2-7-standard',     label: 'Wan 2.7 720p',         unit: 'per-second', sellEUR: 0.22, costEUR: 0.10,  minDuration: 2,  maxDuration: 15 },
  'wan-2-7-pro':          { id: 'wan-2-7-pro',          label: 'Wan 2.7 Pro 1080p',    unit: 'per-second', sellEUR: 0.32, costEUR: 0.15,  minDuration: 2,  maxDuration: 15 },

  'luma-standard':        { id: 'luma-standard',        label: 'Luma Ray 2 Std',       unit: 'per-second', sellEUR: 0.155, costEUR: 0.07,  minDuration: 5,  maxDuration: 9  },
  'luma-pro':             { id: 'luma-pro',             label: 'Luma Ray 2 Pro',       unit: 'per-second', sellEUR: 0.255, costEUR: 0.12,  minDuration: 5,  maxDuration: 9  },
  'luma-ray32-5s':        { id: 'luma-ray32-5s',        label: 'Luma Ray 3.2 (5s)',    unit: 'per-second', sellEUR: 0.135, costEUR: 0.06,  minDuration: 5,  maxDuration: 5  },
  'luma-ray32-10s':       { id: 'luma-ray32-10s',       label: 'Luma Ray 3.2 (10s)',   unit: 'per-second', sellEUR: 0.2, costEUR: 0.09,  minDuration: 10, maxDuration: 10 },

  'ltx-standard':         { id: 'ltx-standard',         label: 'LTX 2.3 Fast',         unit: 'per-second', sellEUR: 0.135, costEUR: 0.06,  minDuration: 6,  maxDuration: 20 },
  'ltx-pro':              { id: 'ltx-pro',              label: 'LTX 2.3 Pro',          unit: 'per-second', sellEUR: 0.18, costEUR: 0.08,  minDuration: 6,  maxDuration: 10 },

  'vidu-q2-reference':    { id: 'vidu-q2-reference',    label: 'Vidu Q3 Pro (Start+End)', unit: 'per-second', sellEUR: 0.265, costEUR: 0.125, minDuration: 1, maxDuration: 16 },
  'vidu-q2-i2v':          { id: 'vidu-q2-i2v',          label: 'Vidu Q3 Pro I2V',         unit: 'per-second', sellEUR: 0.265, costEUR: 0.125, minDuration: 1, maxDuration: 16 },
  'vidu-q2-t2v':          { id: 'vidu-q2-t2v',          label: 'Vidu Q3 Turbo T2V',       unit: 'per-second', sellEUR: 0.145, costEUR: 0.065, minDuration: 1, maxDuration: 16 },

  'pika-2-2-standard':    { id: 'pika-2-2-standard',    label: 'Pika 2.2 Std',         unit: 'per-second', sellEUR: 0.09, costEUR: 0.04,  minDuration: 3,  maxDuration: 10 },
  'pika-2-2-pro':         { id: 'pika-2-2-pro',         label: 'Pika 2.2 Pro',         unit: 'per-second', sellEUR: 0.2, costEUR: 0.09,  minDuration: 3,  maxDuration: 10 },

  'runway-gen4-aleph':    { id: 'runway-gen4-aleph',    label: 'Runway Gen-4 Aleph',   unit: 'per-second', sellEUR: 0.18, costEUR: 0.08,  minDuration: 5,  maxDuration: 10 },

  'veo-3.1-lite-720p':    { id: 'veo-3.1-lite-720p',    label: 'Veo 3.1 Lite 720p',    unit: 'per-second', sellEUR: 0.32, costEUR: 0.15,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-lite-1080p':   { id: 'veo-3.1-lite-1080p',   label: 'Veo 3.1 Lite 1080p',   unit: 'per-second', sellEUR: 0.475, costEUR: 0.22,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-fast':         { id: 'veo-3.1-fast',         label: 'Veo 3.1 Fast 1080p',   unit: 'per-second', sellEUR: 0.86, costEUR: 0.40,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-pro':          { id: 'veo-3.1-pro',          label: 'Veo 3.1 Pro 1080p',    unit: 'per-second', sellEUR: 2.365, costEUR: 1.10,  minDuration: 4,  maxDuration: 8  },
  'sora-2-standard':      { id: 'sora-2-standard',      label: 'Sora 2 Standard (EOL 24.09.2026)',      unit: 'per-second', sellEUR: 0.22, costEUR: 0.10,  minDuration: 4,  maxDuration: 12 },
  'sora-2-pro':           { id: 'sora-2-pro',           label: 'Sora 2 Pro (EOL 24.09.2026)',           unit: 'per-second', sellEUR: 1.08, costEUR: 0.50,  minDuration: 4,  maxDuration: 12 },
  'grok-imagine':         { id: 'grok-imagine',         label: 'Grok Imagine',         unit: 'per-second', sellEUR: 0.11, costEUR: 0.05,  minDuration: 1,  maxDuration: 15 },
};

/**
 * Canonical catalog. EUR is maintained by hand; USD is derived once with the
 * shared FX factor so the displayed and the deducted price always match.
 */
export const VIDEO_PRICING_CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  Object.entries(CATALOG_SOURCE).map(([id, e]) => [id, { ...e, sellUSD: usdFromEur(e.sellEUR) }]),
) as Record<string, CatalogEntry>;

/** Sell price per second (or per clip for per-clip models). */
export function resolveCostPerSecond(modelId: string, currency: 'EUR' | 'USD' = 'EUR'): number | null {
  const entry = VIDEO_PRICING_CATALOG[modelId];
  if (!entry) return null;
  return currency === 'USD' ? entry.sellUSD : entry.sellEUR;
}

/** Models that carry the Premium-Engine transparency badge in the UI. */
export const PREMIUM_ENGINE_CATALOG_IDS = new Set<string>([
  'veo-3.1-lite-720p',
  'veo-3.1-lite-1080p',
  'veo-3.1-fast',
  'veo-3.1-pro',
  'sora-2-standard',
  'sora-2-pro',
  'grok-imagine',
]);

export const CATALOG_VERSION = '2026-08-21';

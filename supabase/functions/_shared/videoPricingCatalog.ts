// ============================================================================
// CANONICAL VIDEO PRICING CATALOG — single source of truth (14.07.2026)
// ----------------------------------------------------------------------------
// Every generate-*-video Edge Function AND the frontend read from this file
// (via the /functions/v1/pricing-catalog endpoint) so the price shown to the
// user before generation always matches the amount actually deducted after.
//
// Margin policy: exactly 3.00× the provider cost (Replicate/Runway/Fal),
// enforced across all AI video models. Lipsync (Sync.so), Audio (ElevenLabs)
// and Picture models are NOT part of this catalog — they are billed on
// separate rails and priced independently.
// ============================================================================

export type CatalogEntry = {
  id: string;
  label: string;
  unit: 'per-second' | 'per-clip';
  /** Sell price (what we charge the user) in EUR. */
  sellEUR: number;
  /** Sell price in USD (currently 1:1 with EUR — same normalized value). */
  sellUSD: number;
  /** Real provider cost in EUR — for admin margin views only. */
  costEUR: number;
  /** Min clip duration in seconds (undefined for per-clip models). */
  minDuration?: number;
  /** Max clip duration in seconds (undefined for per-clip models). */
  maxDuration?: number;
  /** For per-clip models, the fixed clip length (5s for Vidu Q2). */
  fixedClipSeconds?: number;
};

export const VIDEO_PRICING_CATALOG: Record<string, CatalogEntry> = {
  // Hailuo
  'hailuo-standard':      { id: 'hailuo-standard',      label: 'Hailuo 2.3 Std 768p',  unit: 'per-second', sellEUR: 0.14, sellUSD: 0.14, costEUR: 0.045, minDuration: 3,  maxDuration: 10 },
  'hailuo-pro':           { id: 'hailuo-pro',           label: 'Hailuo 2.3 Pro 1080p', unit: 'per-second', sellEUR: 0.23, sellUSD: 0.23, costEUR: 0.075, minDuration: 3,  maxDuration: 10 },

  // HappyHorse
  'happyhorse-standard':  { id: 'happyhorse-standard',  label: 'HappyHorse 720p',      unit: 'per-second', sellEUR: 0.42, sellUSD: 0.42, costEUR: 0.14,  minDuration: 3,  maxDuration: 15 },
  'happyhorse-pro':       { id: 'happyhorse-pro',       label: 'HappyHorse Pro 1080p', unit: 'per-second', sellEUR: 0.84, sellUSD: 0.84, costEUR: 0.28,  minDuration: 3,  maxDuration: 15 },

  // Seedance 2.0
  'seedance-mini':        { id: 'seedance-mini',        label: 'Seedance 2.0 Mini',    unit: 'per-second', sellEUR: 0.06, sellUSD: 0.06, costEUR: 0.02,  minDuration: 3,  maxDuration: 15 },
  'seedance-standard':    { id: 'seedance-standard',    label: 'Seedance 2.0 Std',     unit: 'per-second', sellEUR: 0.09, sellUSD: 0.09, costEUR: 0.03,  minDuration: 3,  maxDuration: 15 },
  'seedance-pro':         { id: 'seedance-pro',         label: 'Seedance 2.0 Pro',     unit: 'per-second', sellEUR: 0.18, sellUSD: 0.18, costEUR: 0.06,  minDuration: 3,  maxDuration: 15 },

  // Kling
  'kling-3':              { id: 'kling-3',              label: 'Kling 3.0 1080p',      unit: 'per-second', sellEUR: 0.18, sellUSD: 0.18, costEUR: 0.06,  minDuration: 3,  maxDuration: 15 },
  'kling-2.5-turbo':      { id: 'kling-2.5-turbo',      label: 'Kling 2.5 Turbo Pro',  unit: 'per-second', sellEUR: 0.09, sellUSD: 0.09, costEUR: 0.03,  minDuration: 5,  maxDuration: 10 },
  'kling-2.6':            { id: 'kling-2.6',            label: 'Kling 2.6',            unit: 'per-second', sellEUR: 0.12, sellUSD: 0.12, costEUR: 0.04,  minDuration: 5,  maxDuration: 15 },
  'kling-omni':           { id: 'kling-omni',           label: 'Kling 3.0 Omni',       unit: 'per-second', sellEUR: 0.60, sellUSD: 0.60, costEUR: 0.20,  minDuration: 5,  maxDuration: 15 },

  // Wan 2.5 / 2.6
  'wan-standard':         { id: 'wan-standard',         label: 'Wan 2.5 Std',          unit: 'per-second', sellEUR: 0.12, sellUSD: 0.12, costEUR: 0.04,  minDuration: 4,  maxDuration: 10 },
  'wan-pro':              { id: 'wan-pro',              label: 'Wan 2.5 Pro',          unit: 'per-second', sellEUR: 0.21, sellUSD: 0.21, costEUR: 0.07,  minDuration: 4,  maxDuration: 10 },
  'wan-2-6-standard':     { id: 'wan-2-6-standard',     label: 'Wan 2.6 Std',          unit: 'per-second', sellEUR: 0.12, sellUSD: 0.12, costEUR: 0.04,  minDuration: 4,  maxDuration: 15 },
  'wan-2-6-pro':          { id: 'wan-2-6-pro',          label: 'Wan 2.6 Pro',          unit: 'per-second', sellEUR: 0.21, sellUSD: 0.21, costEUR: 0.07,  minDuration: 4,  maxDuration: 15 },

  // Luma
  'luma-standard':        { id: 'luma-standard',        label: 'Luma Ray 2 Std',       unit: 'per-second', sellEUR: 0.21, sellUSD: 0.21, costEUR: 0.07,  minDuration: 5,  maxDuration: 9  },
  'luma-pro':             { id: 'luma-pro',             label: 'Luma Ray 2 Pro',       unit: 'per-second', sellEUR: 0.36, sellUSD: 0.36, costEUR: 0.12,  minDuration: 5,  maxDuration: 9  },

  // LTX
  'ltx-standard':         { id: 'ltx-standard',         label: 'LTX 2.0 Std',          unit: 'per-second', sellEUR: 0.06, sellUSD: 0.06, costEUR: 0.02,  minDuration: 3,  maxDuration: 10 },
  'ltx-pro':              { id: 'ltx-pro',              label: 'LTX 2.0 Pro',          unit: 'per-second', sellEUR: 0.12, sellUSD: 0.12, costEUR: 0.04,  minDuration: 3,  maxDuration: 10 },

  // Vidu Q2 (per-clip 5s)
  'vidu-q2-reference':    { id: 'vidu-q2-reference',    label: 'Vidu Q2 Reference (5s)', unit: 'per-clip', sellEUR: 0.66, sellUSD: 0.66, costEUR: 0.22, fixedClipSeconds: 5 },
  'vidu-q2-i2v':          { id: 'vidu-q2-i2v',          label: 'Vidu Q2 I2V (5s)',       unit: 'per-clip', sellEUR: 0.60, sellUSD: 0.60, costEUR: 0.20, fixedClipSeconds: 5 },
  'vidu-q2-t2v':          { id: 'vidu-q2-t2v',          label: 'Vidu Q2 T2V (5s)',       unit: 'per-clip', sellEUR: 0.60, sellUSD: 0.60, costEUR: 0.20, fixedClipSeconds: 5 },

  // Pika
  'pika-2-2-standard':    { id: 'pika-2-2-standard',    label: 'Pika 2.2 Std',         unit: 'per-second', sellEUR: 0.12, sellUSD: 0.12, costEUR: 0.04,  minDuration: 3,  maxDuration: 10 },
  'pika-2-2-pro':         { id: 'pika-2-2-pro',         label: 'Pika 2.2 Pro',         unit: 'per-second', sellEUR: 0.27, sellUSD: 0.27, costEUR: 0.09,  minDuration: 3,  maxDuration: 10 },

  // Runway
  'runway-gen4-aleph':    { id: 'runway-gen4-aleph',    label: 'Runway Gen-4 Aleph',   unit: 'per-second', sellEUR: 0.24, sellUSD: 0.24, costEUR: 0.08,  minDuration: 5,  maxDuration: 10 },

  // Premium engines
  'veo-3.1-lite-720p':    { id: 'veo-3.1-lite-720p',    label: 'Veo 3.1 Lite 720p',    unit: 'per-second', sellEUR: 0.45, sellUSD: 0.45, costEUR: 0.15,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-lite-1080p':   { id: 'veo-3.1-lite-1080p',   label: 'Veo 3.1 Lite 1080p',   unit: 'per-second', sellEUR: 0.66, sellUSD: 0.66, costEUR: 0.22,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-fast':         { id: 'veo-3.1-fast',         label: 'Veo 3.1 Fast 1080p',   unit: 'per-second', sellEUR: 1.20, sellUSD: 1.20, costEUR: 0.40,  minDuration: 4,  maxDuration: 8  },
  'veo-3.1-pro':          { id: 'veo-3.1-pro',          label: 'Veo 3.1 Pro 1080p',    unit: 'per-second', sellEUR: 3.30, sellUSD: 3.30, costEUR: 1.10,  minDuration: 4,  maxDuration: 8  },
  'sora-2-standard':      { id: 'sora-2-standard',      label: 'Sora 2 Standard',      unit: 'per-second', sellEUR: 0.60, sellUSD: 0.60, costEUR: 0.20,  minDuration: 4,  maxDuration: 20 },
  'sora-2-pro':           { id: 'sora-2-pro',           label: 'Sora 2 Pro',           unit: 'per-second', sellEUR: 1.35, sellUSD: 1.35, costEUR: 0.45,  minDuration: 4,  maxDuration: 20 },
  'grok-imagine':         { id: 'grok-imagine',         label: 'Grok Imagine',         unit: 'per-second', sellEUR: 0.45, sellUSD: 0.45, costEUR: 0.15,  minDuration: 4,  maxDuration: 15 },
};

/** Canonical price resolver used by every generate-*-video Edge Function. */
export function resolveCostPerSecond(modelId: string, currency: 'EUR' | 'USD' = 'EUR'): number | null {
  const entry = VIDEO_PRICING_CATALOG[modelId];
  if (!entry) return null;
  return currency === 'USD' ? entry.sellUSD : entry.sellEUR;
}

/** Compute total cost (EUR) for a duration; respects per-clip pricing (Vidu). */
export function computeTotalCost(modelId: string, durationSeconds: number, currency: 'EUR' | 'USD' = 'EUR'): number | null {
  const entry = VIDEO_PRICING_CATALOG[modelId];
  if (!entry) return null;
  const price = currency === 'USD' ? entry.sellUSD : entry.sellEUR;
  if (entry.unit === 'per-clip') return price;
  return +(price * durationSeconds).toFixed(4);
}

export const CATALOG_VERSION = '2026-07-14';

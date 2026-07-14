/**
 * Canonical per-second cost table for AI video clip generation.
 *
 * Single source of truth for both the dispatcher (`compose-video-clips`) and
 * the refund path (`compose-clip-webhook`). Adding a new provider in one
 * place used to be a footgun (under-charges + under-refunds) — now every
 * caller imports from here.
 *
 * Values mirror the client-side table in `src/types/video-composer.ts`.
 */
export type ClipQuality = "standard" | "pro";

// Normalized 14.07.2026 — exactly 3.00× Replicate cost margin across all video models.
// Lip-Sync and picture models keep their prior margin policy and live elsewhere.
// Keep aligned with `src/types/video-composer.ts` (CLIP_SOURCE_COSTS) and
// `src/lib/cost/videoProviderMargins.ts`.
export const CLIP_COSTS: Record<string, Record<ClipQuality, number>> = {
  "ai-hailuo":     { standard: 0.14, pro: 0.23 },
  "ai-kling":      { standard: 0.18, pro: 0.30 },
  "ai-kling-omni": { standard: 0.60, pro: 0.60 }, // native lip-sync + audio

  "ai-sora":       { standard: 0.60, pro: 1.35 },
  "ai-wan":        { standard: 0.12, pro: 0.21 },
  "ai-seedance":   { standard: 0.09, pro: 0.18 }, // Mini tier is 0.06 (see registry)
  "ai-luma":       { standard: 0.21, pro: 0.36 },
  "ai-veo":        { standard: 0.45, pro: 3.30 },
  "ai-runway":     { standard: 0.24, pro: 0.24 },
  "ai-pika":       { standard: 0.12, pro: 0.27 },
  "ai-happyhorse": { standard: 0.42, pro: 0.84 }, // 720p / 1080p
  "ai-vidu":       { standard: 0.13, pro: 0.13 }, // flat €0.66 / 5s
  "ai-grok":       { standard: 0.45, pro: 0.45 }, // 1080p only
  "ai-ltx":        { standard: 0.06, pro: 0.12 },
  "ai-image":      { standard: 0.01, pro: 0.015 },
};

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

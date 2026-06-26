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

// Margin policy: ~60-70% across the board. Sora/Veo/Grok = Premium-Engine tier (~65%).
// Keep aligned with `src/types/video-composer.ts` (CLIP_SOURCE_COSTS) and
// `src/lib/cost/videoProviderMargins.ts`.
export const CLIP_COSTS: Record<string, Record<ClipQuality, number>> = {
  "ai-hailuo":     { standard: 0.15, pro: 0.22 },
  "ai-kling":      { standard: 0.18, pro: 0.28 },
  "ai-sora":       { standard: 0.55, pro: 1.30 },
  "ai-wan":        { standard: 0.12, pro: 0.20 },
  "ai-seedance":   { standard: 0.15, pro: 0.20 },
  "ai-luma":       { standard: 0.20, pro: 0.35 },
  "ai-veo":        { standard: 0.42, pro: 3.15 },
  "ai-runway":     { standard: 0.23, pro: 0.23 },
  "ai-pika":       { standard: 0.14, pro: 0.26 },
  "ai-happyhorse": { standard: 0.40, pro: 0.80 }, // 720p / 1080p (~65% margin)
  "ai-vidu":       { standard: 0.13, pro: 0.13 }, // flat €0.65 / 5s
  "ai-grok":       { standard: 0.42, pro: 0.42 }, // 1080p only (premium-engine)
  "ai-ltx":        { standard: 0.08, pro: 0.12 },
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

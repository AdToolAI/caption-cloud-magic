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

export const CLIP_COSTS: Record<string, Record<ClipQuality, number>> = {
  "ai-hailuo":     { standard: 0.15, pro: 0.20 },
  "ai-kling":      { standard: 0.15, pro: 0.21 },
  "ai-sora":       { standard: 0.25, pro: 0.53 },
  "ai-wan":        { standard: 0.10, pro: 0.18 },
  "ai-seedance":   { standard: 0.12, pro: 0.20 },
  "ai-luma":       { standard: 0.20, pro: 0.32 },
  "ai-veo":        { standard: 0.20, pro: 1.40 },
  "ai-runway":     { standard: 0.15, pro: 0.15 },
  "ai-pika":       { standard: 0.10, pro: 0.18 },
  "ai-happyhorse": { standard: 0.28, pro: 0.56 }, // 720p / 1080p (Replicate 50% margin)
  "ai-vidu":       { standard: 0.09, pro: 0.09 }, // flat €0.45 / 5s
  "ai-grok":       { standard: 0.20, pro: 0.20 }, // 1080p only
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

// Frontend mirror of supabase/functions/_shared/posting-times-fetcher.ts
// Used for client-side slot scoring (warning the user when they pick a low-score time).
// Keep peak data in sync with the edge module.

interface PlatformPeak {
  hour: number;
  dayTypes: Array<"all" | "weekday" | "weekend" | "tue-thu">;
  score: number;
}

const PLATFORM_PEAKS: Record<string, PlatformPeak[]> = {
  instagram: [
    { hour: 11, dayTypes: ["weekday"], score: 85 },
    { hour: 14, dayTypes: ["weekday"], score: 80 },
    { hour: 19, dayTypes: ["all"], score: 90 },
    { hour: 21, dayTypes: ["weekend"], score: 88 },
    { hour: 9, dayTypes: ["weekday"], score: 65 },
    { hour: 13, dayTypes: ["weekday"], score: 70 },
    { hour: 17, dayTypes: ["weekday"], score: 68 },
    { hour: 20, dayTypes: ["all"], score: 72 },
  ],
  tiktok: [
    { hour: 18, dayTypes: ["all"], score: 88 },
    { hour: 21, dayTypes: ["all"], score: 92 },
    { hour: 12, dayTypes: ["weekend"], score: 85 },
    { hour: 16, dayTypes: ["weekday"], score: 70 },
    { hour: 19, dayTypes: ["weekday"], score: 75 },
    { hour: 22, dayTypes: ["weekend"], score: 68 },
  ],
  linkedin: [
    { hour: 8, dayTypes: ["tue-thu"], score: 87 },
    { hour: 12, dayTypes: ["weekday"], score: 85 },
    { hour: 17, dayTypes: ["weekday"], score: 83 },
    { hour: 9, dayTypes: ["weekday"], score: 72 },
    { hour: 14, dayTypes: ["weekday"], score: 65 },
    { hour: 16, dayTypes: ["weekday"], score: 70 },
  ],
  x: [
    { hour: 9, dayTypes: ["weekday"], score: 83 },
    { hour: 13, dayTypes: ["weekday"], score: 80 },
    { hour: 17, dayTypes: ["weekday"], score: 86 },
    { hour: 8, dayTypes: ["weekday"], score: 70 },
    { hour: 12, dayTypes: ["weekday"], score: 72 },
    { hour: 19, dayTypes: ["all"], score: 75 },
  ],
  facebook: [
    { hour: 13, dayTypes: ["weekday"], score: 82 },
    { hour: 19, dayTypes: ["all"], score: 85 },
    { hour: 21, dayTypes: ["weekend"], score: 88 },
    { hour: 11, dayTypes: ["weekday"], score: 68 },
    { hour: 15, dayTypes: ["weekday"], score: 65 },
    { hour: 20, dayTypes: ["all"], score: 70 },
  ],
  youtube: [
    { hour: 14, dayTypes: ["weekend"], score: 88 },
    { hour: 20, dayTypes: ["all"], score: 90 },
    { hour: 12, dayTypes: ["weekday"], score: 75 },
    { hour: 18, dayTypes: ["all"], score: 78 },
    { hour: 22, dayTypes: ["all"], score: 70 },
    { hour: 15, dayTypes: ["weekend"], score: 72 },
  ],
};
PLATFORM_PEAKS.twitter = PLATFORM_PEAKS.x;

function getDayType(date: Date): "weekend" | "tue-thu" | "weekday" {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  if (day >= 2 && day <= 4) return "tue-thu";
  return "weekday";
}

export interface SlotEvaluation {
  score: number;
  bestHour: number | null;
  bestScore: number;
}

/**
 * Score a chosen (platform, dateTime). Also returns the best alternative hour
 * for that day so the UI can suggest a swap.
 */
export function evaluateSlot(platform: string, isoOrDate: string | Date): SlotEvaluation {
  const peaks = PLATFORM_PEAKS[(platform || "").toLowerCase()];
  if (!peaks) return { score: 0, bestHour: null, bestScore: 0 };
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return { score: 0, bestHour: null, bestScore: 0 };
  const hour = date.getHours();
  const dayType = getDayType(date);
  const applicable = peaks.filter(
    (p) => p.dayTypes.includes("all") || p.dayTypes.includes(dayType),
  );
  let exact: PlatformPeak | null = null;
  let best: PlatformPeak | null = null;
  for (const p of applicable) {
    if (p.hour === hour && (!exact || p.score > exact.score)) exact = p;
    if (!best || p.score > best.score) best = p;
  }
  let score = 0;
  if (exact) {
    score = exact.score;
  } else if (best) {
    const dist = Math.abs(best.hour - hour);
    const decay = Math.max(0, 1 - dist * 0.15);
    score = Math.max(20, Math.round(best.score * decay));
  }
  return {
    score,
    bestHour: best ? best.hour : null,
    bestScore: best ? best.score : 0,
  };
}

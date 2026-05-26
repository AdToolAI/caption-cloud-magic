/**
 * Heatmap aggregation utilities for the Content Command Center.
 * Pure functions — no React, no side effects.
 */

import type { PostingTimesData } from "@/hooks/usePostingTimes";

export interface HeatmapPost {
  id: string;
  title?: string;
  caption?: string;
  brief?: string;
  channels: string[];
  status: string;
  start_at: string;
  assets_json?: any;
}

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Mon … 6 = Sun
export type HourIndex = number; // 0..23

export interface BucketKey {
  day: DayIndex;
  hour: HourIndex;
}

export const bucketKey = (day: DayIndex, hour: HourIndex): string => `${day}-${hour}`;

/** JS Date getDay(): Sun=0..Sat=6 → our Mon=0..Sun=6 */
export function jsDayToMon0(jsDay: number): DayIndex {
  return ((jsDay + 6) % 7) as DayIndex;
}

export interface PostBucket {
  posts: HeatmapPost[];
  count: number;
}

export interface ScoreBucket {
  score: number; // 0..100
  reasons: string[];
  samples: number;
}

export interface Conflict {
  key: string;
  count: number;
}

export interface GoldenGap {
  key: string;
  day: DayIndex;
  hour: HourIndex;
  score: number;
  reasons: string[];
}

export interface ChannelBalance {
  channel: string;
  count: number;
  pct: number;
}

/** Aggregate posts into Day×Hour buckets, filtered by channel if given. */
export function aggregatePosts(
  posts: HeatmapPost[],
  channelFilter: string | "all",
): Map<string, PostBucket> {
  const map = new Map<string, PostBucket>();
  for (const post of posts) {
    if (!post.start_at) continue;
    if (channelFilter !== "all" && !post.channels?.includes(channelFilter)) continue;
    const d = new Date(post.start_at);
    if (isNaN(d.getTime())) continue;
    const day = jsDayToMon0(d.getDay());
    const hour = d.getHours() as HourIndex;
    const k = bucketKey(day, hour);
    const existing = map.get(k);
    if (existing) {
      existing.posts.push(post);
      existing.count++;
    } else {
      map.set(k, { posts: [post], count: 1 });
    }
  }
  return map;
}

/** Convert posting-times API response into a Day×Hour score map (averaged over days). */
export function aggregateScores(
  data: PostingTimesData | undefined,
  platform: string,
): Map<string, ScoreBucket> {
  const map = new Map<string, ScoreBucket>();
  if (!data) return map;
  const days = data.platforms?.[platform] ?? [];
  for (const day of days) {
    for (const slot of day.slots ?? []) {
      const d = new Date(slot.start);
      if (isNaN(d.getTime())) continue;
      const dayIdx = jsDayToMon0(d.getDay());
      const hour = d.getHours() as HourIndex;
      const k = bucketKey(dayIdx, hour);
      const existing = map.get(k);
      if (existing) {
        existing.score =
          (existing.score * existing.samples + slot.score) / (existing.samples + 1);
        existing.samples += 1;
        // Keep first 3 unique reasons
        for (const r of slot.reasons ?? []) {
          if (existing.reasons.length < 3 && !existing.reasons.includes(r)) {
            existing.reasons.push(r);
          }
        }
      } else {
        map.set(k, {
          score: slot.score,
          reasons: (slot.reasons ?? []).slice(0, 3),
          samples: 1,
        });
      }
    }
  }
  return map;
}

export function detectConflicts(
  bucketMap: Map<string, PostBucket>,
  threshold = 3,
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const [key, b] of bucketMap.entries()) {
    if (b.count >= threshold) conflicts.push({ key, count: b.count });
  }
  return conflicts.sort((a, b) => b.count - a.count);
}

/** Best unused slot: high score, zero posts. */
export function findGoldenGap(
  scoreMap: Map<string, ScoreBucket>,
  bucketMap: Map<string, PostBucket>,
): GoldenGap | null {
  let best: GoldenGap | null = null;
  for (const [key, s] of scoreMap.entries()) {
    if (bucketMap.has(key)) continue;
    if (s.score < 50) continue;
    if (!best || s.score > best.score) {
      const [dStr, hStr] = key.split("-");
      best = {
        key,
        day: Number(dStr) as DayIndex,
        hour: Number(hStr) as HourIndex,
        score: Math.round(s.score),
        reasons: s.reasons,
      };
    }
  }
  return best;
}

export function channelBalance(posts: HeatmapPost[]): ChannelBalance[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of posts) {
    for (const ch of p.channels ?? []) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      total++;
    }
  }
  return Array.from(counts.entries())
    .map(([channel, count]) => ({
      channel,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Compute the next concrete Date matching (day, hour), at minute 0. */
export function nextDateFor(day: DayIndex, hour: HourIndex, from: Date = new Date()): Date {
  const todayMon0 = jsDayToMon0(from.getDay());
  let deltaDays = (day - todayMon0 + 7) % 7;
  // If today and the hour already passed, jump to next week
  if (deltaDays === 0 && from.getHours() >= hour) deltaDays = 7;
  const target = new Date(from);
  target.setDate(from.getDate() + deltaDays);
  target.setHours(hour, 0, 0, 0);
  return target;
}

export const DAY_LABELS_DE: string[] = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
export const DAY_LABELS_LONG_DE: string[] = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

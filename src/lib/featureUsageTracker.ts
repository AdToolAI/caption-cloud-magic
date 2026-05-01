import { supabase } from "@/integrations/supabase/client";

/**
 * Power features tracked for the FeatureDiscoveryWatcher.
 * Add a new key here when wiring up a new power feature.
 */
export type PowerFeatureKey =
  | "directors_cut"
  | "sora_long_form"
  | "video_composer"
  | "picture_studio"
  | "ai_video_toolkit"
  | "talking_head"
  | "music_studio"
  | "motion_studio"
  | "email_director"
  | "ad_director"
  | "autopilot"
  | "brand_characters"
  | "marketplace"
  | "news_hub"
  | "trend_radar"
  | "video_translator"
  | "magic_edit"
  | "upscaler"
  | "universal_creator"
  | "universal_video_creator";

const LS_PREFIX = "feature_usage_count_";

/**
 * Increments a per-user counter for a power feature, in both
 * localStorage (instant, used by the watcher) and the DB (durable analytics).
 * Safe to call without an authenticated session — DB call is skipped.
 */
export async function trackFeatureUsage(
  feature: PowerFeatureKey
): Promise<number> {
  // Local counter — instantly readable by the watcher
  let localCount = 0;
  try {
    const raw = localStorage.getItem(LS_PREFIX + feature);
    localCount = raw ? parseInt(raw, 10) || 0 : 0;
    localCount += 1;
    localStorage.setItem(LS_PREFIX + feature, String(localCount));
  } catch {
    // ignore quota / disabled storage
  }

  // DB increment (best-effort, async)
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return localCount;

    await (supabase.rpc as any)("increment_feature_usage", {
      p_user_id: userId,
      p_feature_key: feature,
    });
  } catch {
    // ignore
  }

  return localCount;
}

export function getLocalFeatureCount(feature: PowerFeatureKey): number {
  try {
    const raw = localStorage.getItem(LS_PREFIX + feature);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

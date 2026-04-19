import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { PlanId } from "@/config/pricing";

/**
 * Detects "heavy users on a lower tier" — e.g. a Basic user who has generated
 * 5+ pieces of content in the last 7 days — and surfaces a Pro upsell.
 * Runs at most once per session (and is gated by useUpgradeTrigger cooldown).
 */
const HEAVY_USAGE_THRESHOLD = 5;

export const UsageRecommendationWatcher = () => {
  const { user } = useAuth();
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();
  const checked = useRef(false);

  useEffect(() => {
    if (!user || !balance || checked.current) return;

    const plan = balance.plan_code as PlanId;
    if (plan !== "free" && plan !== "basic") return; // Pro/enterprise already covered

    checked.current = true;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_metrics_daily" as any)
          .select("posts_created, posts_published")
          .eq("user_id", user.id)
          .gte("date", sevenDaysAgo);

        if (error || !data) return;

        const totalActions = (data as any[]).reduce(
          (sum, row) => sum + (row.posts_created ?? 0) + (row.posts_published ?? 0),
          0
        );

        if (totalActions >= HEAVY_USAGE_THRESHOLD) {
          const recommended: PlanId = plan === "free" ? "pro" : "pro";
          trigger({
            source: "usage_recommendation",
            recommendedPlan: recommended,
            currentPlan: plan,
            feature: "Heavy usage",
            contextValue: totalActions,
            metadata: { actions_last_7_days: totalActions },
          });
        }
      } catch (err) {
        console.debug("[usage-recommendation] check failed:", err);
      }
    })();
  }, [user, balance, trigger]);

  return null;
};

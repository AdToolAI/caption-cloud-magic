import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { PlanId } from "@/config/pricing";

/**
 * After the user reaches a meaningful streak milestone (7d / 30d / 60d / 100d),
 * show a soft annual-plan upsell — "you're using AdTool intensively, save with the Pro plan".
 * Skipped for enterprise users.
 */
const UPSELL_MILESTONES = new Set([7, 30, 60, 100]);

export const StreakMilestoneUpsellWatcher = () => {
  const { user } = useAuth();
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`streak-upsell-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "streak_milestones",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const m = payload.new as { milestone_days: number };
          if (!UPSELL_MILESTONES.has(m.milestone_days)) return;

          const currentPlan = (balance?.plan_code as PlanId) ?? "free";
          if (currentPlan === "enterprise") return;

          const recommended: PlanId =
            currentPlan === "free" ? "basic" :
            currentPlan === "basic" ? "pro" :
            "enterprise";

          // Slight delay so milestone celebration toast lands first
          setTimeout(() => {
            trigger({
              source: "streak_milestone",
              recommendedPlan: recommended,
              currentPlan,
              feature: `${m.milestone_days}-day streak`,
              contextValue: m.milestone_days,
              metadata: { milestone_days: m.milestone_days },
            });
          }, 3500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, balance?.plan_code, trigger]);

  return null;
};

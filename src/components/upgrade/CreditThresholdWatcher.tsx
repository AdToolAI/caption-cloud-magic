import { useEffect, useRef } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { PlanId } from "@/config/pricing";

/**
 * Watches the user's credit balance and surfaces a contextual upgrade prompt
 * when credits drop below a threshold. Fires at most once per cooldown window
 * (24h, enforced inside useUpgradeTrigger).
 */
const LOW_THRESHOLD_PCT = 0.1; // 10% of monthly credits

export const CreditThresholdWatcher = () => {
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();
  const lastSeen = useRef<number | null>(null);

  useEffect(() => {
    if (!balance) return;
    if (balance.plan_code === "enterprise") return; // Already top tier
    if (!balance.monthly_credits || balance.monthly_credits <= 0) return;

    const ratio = balance.balance / balance.monthly_credits;

    // Only fire when crossing the threshold downward (avoid re-firing on stable state)
    const wasAbove = lastSeen.current === null || lastSeen.current > LOW_THRESHOLD_PCT;
    lastSeen.current = ratio;

    if (ratio <= LOW_THRESHOLD_PCT && wasAbove) {
      // Recommend next tier up
      const recommended: PlanId =
        balance.plan_code === "free" ? "basic" :
        balance.plan_code === "basic" ? "pro" :
        "enterprise";

      trigger({
        source: "credit_threshold",
        recommendedPlan: recommended,
        currentPlan: balance.plan_code as PlanId,
        feature: "Credits",
        contextValue: balance.balance,
        metadata: {
          monthly_credits: balance.monthly_credits,
          usage_pct: Math.round((1 - ratio) * 100),
        },
      });
    }
  }, [balance, trigger]);

  return null;
};

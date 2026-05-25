import { useCallback } from "react";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { useCredits } from "@/hooks/useCredits";
import { useTrialStatus } from "@/hooks/useTrialStatus";
import { PlanId } from "@/config/pricing";

/**
 * Gate a Pro/Enterprise feature behind the SmartUpgradeModal.
 *
 * Active trial users always pass — they get the full experience so they can
 * fully evaluate the product before being asked to convert.
 */
export interface FeatureGateOptions {
  feature: string;
  requiredPlan: PlanId;
}

export const useFeatureGate = ({ feature, requiredPlan }: FeatureGateOptions) => {
  const { balance } = useCredits();
  const trial = useTrialStatus();
  const { trigger } = useUpgradeTrigger();

  const planRank: Record<PlanId, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };

  return useCallback((): boolean => {
    // Active trial → full access to every gated feature.
    if (trial.status === "active") return true;

    const currentPlan = (balance?.plan_code as PlanId) ?? "free";
    if (planRank[currentPlan] >= planRank[requiredPlan]) {
      return true;
    }
    trigger({
      source: "feature_wall",
      recommendedPlan: requiredPlan,
      currentPlan,
      feature,
    });
    return false;
  }, [balance?.plan_code, trial.status, requiredPlan, feature, trigger]);
};

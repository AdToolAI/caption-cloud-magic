import { useCallback } from "react";
import { useUpgradeTrigger } from "@/hooks/useUpgradeTrigger";
import { useCredits } from "@/hooks/useCredits";
import { PlanId } from "@/config/pricing";

/**
 * Gate a Pro/Enterprise feature behind the SmartUpgradeModal.
 *
 * @example
 * const checkSora = useFeatureGate({ feature: "Sora 2", requiredPlan: "pro" });
 *
 * <Button onClick={() => { if (!checkSora()) return; openSora(); }} />
 */
export interface FeatureGateOptions {
  feature: string;
  requiredPlan: PlanId;
}

export const useFeatureGate = ({ feature, requiredPlan }: FeatureGateOptions) => {
  const { balance } = useCredits();
  const { trigger } = useUpgradeTrigger();

  const planRank: Record<PlanId, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };

  /** Returns true if the user already has access; otherwise opens the upgrade modal and returns false. */
  return useCallback((): boolean => {
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
  }, [balance?.plan_code, requiredPlan, feature, trigger]);
};

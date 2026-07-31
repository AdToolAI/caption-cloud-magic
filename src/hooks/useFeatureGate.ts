import { useCallback } from "react";
import { PlanId } from "@/config/pricing";

/**
 * useFeatureGate — No-Op (Beta 2026).
 *
 * Das generische Credit-/Plan-Gating wurde mit dem Beta-Basic-Abo (14,99 €)
 * abgeschafft. Alle Features sind für Beta-User freigeschaltet. Zugang wird
 * ausschließlich über den Stripe-Subscription-Status (`useAuth().subscribed`)
 * geregelt, nicht mehr über Credit-Balance oder Plan-Tier.
 *
 * Dieser Hook bleibt als Shim: gibt eine Callback zurück, die immer `true`
 * liefert. So bricht kein Consumer.
 */
export interface FeatureGateOptions {
  feature: string;
  requiredPlan: PlanId;
}

export const useFeatureGate = (_options: FeatureGateOptions) => {
  return useCallback((): boolean => true, []);
};

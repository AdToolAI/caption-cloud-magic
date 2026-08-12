import { pricingPlans, PlanType, PlanFeatures } from "@/config/pricing";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";


/**
 * Check if a user's plan has access to a specific feature
 */
export const hasAccess = (
  _userPlan: PlanType | null | undefined,
  _feature: keyof PlanFeatures
): boolean => true; // Open Access (Beta 2026): keine Feature-Sperren mehr.

/**
 * Get the numeric limit for a feature (e.g., captionsPerMonth)
 */
export const getFeatureLimit = (
  _userPlan: PlanType | null | undefined,
  _feature: keyof PlanFeatures
): number => Infinity; // Open Access (Beta 2026): keine Limits mehr.

/**
 * Check if a user has reached their feature limit
 */
export const hasReachedLimit = (
  _userPlan: PlanType | null | undefined,
  _feature: keyof PlanFeatures,
  _currentUsage: number
): boolean => false; // Open Access (Beta 2026): kein Limit wird je erreicht.

/**
 * Get the required plan for a feature
 */
export const getRequiredPlan = (feature: keyof PlanFeatures): PlanType | null => {
  const plans = Object.entries(pricingPlans) as [PlanType, typeof pricingPlans[PlanType]][];
  
  for (const [planKey, plan] of plans) {
    const featureValue = plan.features[feature];
    if (featureValue === true || featureValue === Infinity) {
      return planKey;
    }
  }
  
  return null;
};

/**
 * Emit a `feature_gate_hit` PostHog event when the UI blocks a user from a
 * feature they don't have plan access to. Call this from the code path that
 * actually shows the paywall / lock UI — not from the pure hasAccess check.
 */
export const trackFeatureGateHit = (
  feature: keyof PlanFeatures,
  userPlan: PlanType | null | undefined,
  extra: Record<string, unknown> = {}
): void => {
  try {
    trackEvent(ANALYTICS_EVENTS.FEATURE_GATE_HIT, {
      feature,
      current_plan: userPlan ?? 'anonymous',
      required_plan: getRequiredPlan(feature),
      ...extra,
    });
  } catch {
    // never let analytics break the gate UX
  }
};

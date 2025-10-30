import { pricingPlans, PlanType, PlanFeatures } from "@/config/pricing";

/**
 * Check if a user's plan has access to a specific feature
 */
export const hasAccess = (
  userPlan: PlanType | null | undefined, 
  feature: keyof PlanFeatures
): boolean => {
  if (!userPlan) return false;
  
  const plan = pricingPlans[userPlan];
  const featureValue = plan.features[feature];
  
  return featureValue === true;
};

/**
 * Get the numeric limit for a feature (e.g., captionsPerMonth)
 */
export const getFeatureLimit = (
  userPlan: PlanType | null | undefined,
  feature: keyof PlanFeatures
): number => {
  if (!userPlan) return 0;
  
  const plan = pricingPlans[userPlan];
  const value = plan.features[feature];
  
  if (typeof value === 'number') return value;
  if (value === true) return Infinity;
  return 0;
};

/**
 * Check if a user has reached their feature limit
 */
export const hasReachedLimit = (
  userPlan: PlanType | null | undefined,
  feature: keyof PlanFeatures,
  currentUsage: number
): boolean => {
  const limit = getFeatureLimit(userPlan, feature);
  if (limit === Infinity) return false;
  return currentUsage >= limit;
};

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

export const pricingPlans = {
  free: {
    name: "Free",
    price: 0,
    currency: "€",
    path: "/auth",
    features: {
      captionsPerMonth: 20,
      brandsLimit: 1,
      hasWatermark: true,
      hashtagGenerator: false,
      analytics: false,
      team: false,
      prioritySupport: false,
    }
  },
  basic: {
    name: "Basic",
    price: 9.99,
    currency: "€",
    priceId: "price_basic_monthly", // Replace with actual Stripe price ID
    checkoutUrl: "", // Will use server checkout if empty
    features: {
      captionsPerMonth: 200,
      brandsLimit: 2,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: false,
      team: false,
      prioritySupport: false,
    }
  },
  pro: {
    name: "Pro",
    price: 29.99,
    currency: "€",
    priceId: "price_pro_monthly", // Replace with actual Stripe price ID
    checkoutUrl: "", // Will use server checkout if empty
    features: {
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      team: true,
      prioritySupport: true,
    }
  }
} as const;

export type PlanType = keyof typeof pricingPlans;
export type PlanFeatures = typeof pricingPlans[PlanType]['features'];

export const hasAccess = (
  userPlan: PlanType, 
  feature: keyof PlanFeatures
): boolean => {
  return pricingPlans[userPlan].features[feature] === true || 
         pricingPlans[userPlan].features[feature] === Infinity;
};

export const getFeatureLimit = (
  userPlan: PlanType,
  feature: keyof PlanFeatures
): number => {
  const value = pricingPlans[userPlan].features[feature];
  if (typeof value === 'number') return value;
  return value ? Infinity : 0;
};

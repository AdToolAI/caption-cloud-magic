export const pricingPlans = {
  basic: {
    name: "Basic",
    price: 19.99,
    currency: "€",
    priceId: "price_1SLqZyDRu4kfSFxjfhMnx186",
    productId: "prod_TIRSoTyzmRpbpT",
    checkoutUrl: "",
    credits: {
      monthly: 1500,
      overage: true,
    },
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
    price: 49.99,
    currency: "€",
    priceId: "price_1SLqd6DRu4kfSFxjM1v5wUrp",
    productId: "prod_TIRWOmhxlzFCwW",
    checkoutUrl: "",
    credits: {
      monthly: 10000,
      overage: true,
    },
    features: {
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      team: true,
      prioritySupport: true,
    }
  },
  enterprise: {
    name: "Enterprise",
    price: 99.99,
    currency: "€",
    priceId: "price_1SLqfFDRu4kfSFxjy2ZxDkby",
    productId: "prod_TIRYBu4fdR2BEw",
    checkoutUrl: "",
    credits: {
      monthly: Infinity,
      overage: false,
    },
    features: {
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      team: true,
      prioritySupport: true,
      apiAccess: true,
      whiteLabeling: true,
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

export const getPlanCredits = (planType: PlanType): number => {
  return pricingPlans[planType].credits.monthly;
};

export const getProductInfo = (productId: string | null) => {
  if (!productId) return { name: 'Free', price: 0, currency: '€' };
  if (productId === 'prod_TIRSoTyzmRpbpT') return { name: 'Basic', price: 19.99, currency: '€' };
  if (productId === 'prod_TIRWOmhxlzFCwW') return { name: 'Pro', price: 49.99, currency: '€' };
  if (productId === 'prod_TIRYBu4fdR2BEw') return { name: 'Enterprise', price: 99.99, currency: '€' };
  return { name: 'Free', price: 0, currency: '€' };
};

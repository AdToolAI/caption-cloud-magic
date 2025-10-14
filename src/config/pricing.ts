export const pricingPlans = {
  basic: {
    name: "Basic",
    price: 9.99,
    currency: "€",
    priceId: "price_1SHMtk1xgyPAUyx68aadotiN",
    productId: "prod_TDoWFAZjKKUnA2",
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
    price: 29.99,
    currency: "€",
    priceId: "price_1SHMv51xgyPAUyx6lZ2h3O5A",
    productId: "prod_TDoYdYP1nOOWsN",
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
    price: 69.99,
    currency: "€",
    priceId: "price_1SI5iZ1xgyPAUyx6Rts11rpP",
    productId: "prod_TEYqEq3Bd3HP2x",
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
  if (productId === 'prod_TDoWFAZjKKUnA2') return { name: 'Basic', price: 9.99, currency: '€' };
  if (productId === 'prod_TDoYdYP1nOOWsN') return { name: 'Pro', price: 29.99, currency: '€' };
  if (productId === 'prod_TEYqEq3Bd3HP2x') return { name: 'Enterprise', price: 69.99, currency: '€' };
  return { name: 'Free', price: 0, currency: '€' };
};

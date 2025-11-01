export type PlanId = 'basic' | 'pro' | 'enterprise';
export type Currency = 'EUR' | 'USD';

export interface PlanFeatures {
  posting: boolean;
  quickCalendarPost: boolean;
  team: boolean;
  whiteLabel: boolean;
  api: boolean;
  // Legacy features for backward compatibility
  captionsPerMonth?: number | typeof Infinity;
  brandsLimit?: number | typeof Infinity;
  hasWatermark?: boolean;
  hashtagGenerator?: boolean;
  analytics?: boolean;
  prioritySupport?: boolean;
  autoSchedule?: boolean;
  apiAccess?: boolean;
  whiteLabeling?: boolean;
}

export interface PricingPlan {
  id: PlanId;
  label: string;
  name: string; // Backward compatibility
  price: Record<Currency, number>;
  currency: string; // Backward compatibility (default currency)
  credits: number | 'unlimited';
  features: PlanFeatures;
  // Stripe integration fields
  priceId?: string; // EUR price ID (default)
  productId?: string;
  checkoutUrl?: string;
}

export const PRICING_V21: Record<PlanId, PricingPlan> = {
  basic: {
    id: 'basic',
    label: 'Basic',
    name: 'Basic',
    price: { EUR: 14.95, USD: 14.95 },
    currency: '€',
    credits: 800,
    priceId: 'price_1SLqZyDRu4kfSFxjfhMnx186',
    productId: 'prod_TIRSoTyzmRpbpT',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: false,
      team: false,
      whiteLabel: false,
      api: false,
      // Legacy features
      captionsPerMonth: 200,
      brandsLimit: 2,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: false,
      prioritySupport: false,
      autoSchedule: false
    }
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    name: 'Pro',
    price: { EUR: 34.95, USD: 34.95 },
    currency: '€',
    credits: 2500,
    priceId: 'price_1SLqd6DRu4kfSFxjM1v5wUrp',
    productId: 'prod_TIRWOmhxlzFCwW',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: false,
      // Legacy features
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      prioritySupport: true,
      autoSchedule: true
    }
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    name: 'Enterprise',
    price: { EUR: 69.95, USD: 69.95 },
    currency: '€',
    credits: 'unlimited',
    priceId: 'price_1SLqfFDRu4kfSFxjy2ZxDkby',
    productId: 'prod_TIRYBu4fdR2BEw',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: true,
      // Legacy features
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      prioritySupport: true,
      apiAccess: true,
      whiteLabeling: true,
      autoSchedule: true
    }
  }
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  ff_pricing_v21: true,
  ff_pricing_sst: true,
  ff_onboarding_v1: true,
  ff_quickpost_gate: true,
  ff_reco_card: true,
  ff_empty_states_v2: true,
  ff_affiliates: true,
} as const;

// Legacy export for backward compatibility
export const pricingPlans = PRICING_V21;
export type PlanType = PlanId;

// Helper function for backward compatibility
export const getProductInfo = (productId: string | null) => {
  if (!productId) return { name: 'Free', price: 0, currency: '€' };
  if (productId === 'prod_TIRSoTyzmRpbpT') return { name: 'Basic', price: 14.95, currency: '€' };
  if (productId === 'prod_TIRWOmhxlzFCwW') return { name: 'Pro', price: 34.95, currency: '€' };
  if (productId === 'prod_TIRYBu4fdR2BEw') return { name: 'Enterprise', price: 69.95, currency: '€' };
  return { name: 'Free', price: 0, currency: '€' };
};

// Access control helpers
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
  const credits = pricingPlans[planType].credits;
  return credits === 'unlimited' ? Infinity : credits;
};

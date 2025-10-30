export type PlanId = 'basic' | 'pro' | 'enterprise';
export type Currency = 'EUR' | 'USD';

export interface PlanFeatures {
  posting: boolean;
  quickCalendarPost: boolean;
  team: boolean;
  whiteLabel: boolean;
  api: boolean;
}

export interface PricingPlan {
  id: PlanId;
  label: string;
  price: Record<Currency, number>;
  credits: number | 'unlimited';
  features: PlanFeatures;
}

export const PRICING_V21: Record<PlanId, PricingPlan> = {
  basic: {
    id: 'basic',
    label: 'Basic',
    price: { EUR: 14.99, USD: 14.99 },
    credits: 800,
    features: {
      posting: true,
      quickCalendarPost: false,
      team: false,
      whiteLabel: false,
      api: false
    }
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    price: { EUR: 34.95, USD: 34.95 },
    credits: 2500,
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: false
    }
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    price: { EUR: 69.95, USD: 69.95 },
    credits: 'unlimited',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: true
    }
  }
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  ff_pricing_v21: true,
  ff_quickpost_gate: true,
  ff_affiliates: true,
} as const;

// Legacy export for backward compatibility
export const pricingPlans = PRICING_V21;
export type PlanType = PlanId;

// Helper function for backward compatibility
export const getProductInfo = (productId: string | null) => {
  if (!productId) return { name: 'Free', price: 0, currency: '€' };
  if (productId === 'prod_TIRSoTyzmRpbpT') return { name: 'Basic', price: 14.99, currency: '€' };
  if (productId === 'prod_TIRWOmhxlzFCwW') return { name: 'Pro', price: 34.95, currency: '€' };
  if (productId === 'prod_TIRYBu4fdR2BEw') return { name: 'Enterprise', price: 69.95, currency: '€' };
  return { name: 'Free', price: 0, currency: '€' };
};

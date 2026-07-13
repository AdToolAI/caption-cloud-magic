export type PlanId = 'free' | 'basic' | 'pro' | 'enterprise';
export type Currency = 'EUR' | 'USD';

export interface PlanFeatures {
  posting: boolean;
  quickCalendarPost: boolean;
  team: boolean;
  whiteLabel: boolean;
  api: boolean;
  xTwitterAccess: boolean;
  storageMb: number;
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
  free: {
    id: 'free',
    label: 'Free',
    name: 'Free',
    price: { EUR: 0, USD: 0 },
    currency: '€',
    credits: 0,
    features: {
      posting: false,
      quickCalendarPost: false,
      team: false,
      whiteLabel: false,
      api: false,
      xTwitterAccess: false,
      storageMb: 512, // 512 MB for free users
      // Legacy features
      captionsPerMonth: 0,
      brandsLimit: 1,
      hasWatermark: true,
      hashtagGenerator: false,
      analytics: false,
      prioritySupport: false,
      autoSchedule: false
    }
  },
  basic: {
    id: 'basic',
    label: 'Beta-Basic',
    name: 'Beta-Basic',
    price: { EUR: 14.99, USD: 14.99 },
    currency: '€',
    credits: 800,
    priceId: 'price_1SLqZyDRu4kfSFxjfhMnx186',
    productId: 'prod_TIRSoTyzmRpbpT',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: false,
      xTwitterAccess: true,
      storageMb: 5120, // 5 GB — Beta users get full access
      // Legacy features
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      prioritySupport: true,
      autoSchedule: true,
      whiteLabeling: true,
    }
  },
  // Legacy aliases — during Beta only "beta-basic" exists. These entries
  // point at the same price/product as `basic` so any lingering imports keep
  // working, but the Pricing UI only surfaces the single Beta plan.
  pro: {
    id: 'pro',
    label: 'Beta-Basic',
    name: 'Beta-Basic',
    price: { EUR: 14.99, USD: 14.99 },
    currency: '€',
    credits: 800,
    priceId: 'price_1SLqZyDRu4kfSFxjfhMnx186',
    productId: 'prod_TIRSoTyzmRpbpT',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: false,
      xTwitterAccess: true,
      storageMb: 5120,
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      prioritySupport: true,
      autoSchedule: true,
      whiteLabeling: true,
    }
  },
  enterprise: {
    id: 'enterprise',
    label: 'Beta-Basic',
    name: 'Beta-Basic',
    price: { EUR: 14.99, USD: 14.99 },
    currency: '€',
    credits: 800,
    priceId: 'price_1SLqZyDRu4kfSFxjfhMnx186',
    productId: 'prod_TIRSoTyzmRpbpT',
    checkoutUrl: '',
    features: {
      posting: true,
      quickCalendarPost: true,
      team: true,
      whiteLabel: true,
      api: false,
      xTwitterAccess: true,
      storageMb: 5120,
      captionsPerMonth: Infinity,
      brandsLimit: Infinity,
      hasWatermark: false,
      hashtagGenerator: true,
      analytics: true,
      prioritySupport: true,
      apiAccess: false,
      whiteLabeling: true,
      autoSchedule: true,
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

// Helper — during Beta every non-empty productId that ever represented a paid
// plan (legacy Basic/Pro/Enterprise) is normalized to Beta-Basic so past
// subscribers keep full access.
const LEGACY_PAID_PRODUCT_IDS = new Set<string>([
  'prod_TIRSoTyzmRpbpT', // Basic (canonical)
  'prod_TDoWFAZjKKUnA2', // legacy Basic
  'prod_TDoYdYP1nOOWsN', // legacy Pro
  'prod_TIRWOmhxlzFCwW', // legacy Pro
  'prod_UOG4wbiQjDONAj', // Pro v2
  'prod_UOG5TjlcpNNZLZ', // Pro alt
  'prod_UREZAv0LG9vz1E', // Pro alt
  'prod_TIRYBu4fdR2BEw', // Enterprise
]);

export const getProductInfo = (productId: string | null) => {
  if (!productId) return { name: 'Free', price: 0, currency: '€' };
  if (LEGACY_PAID_PRODUCT_IDS.has(productId)) {
    return { name: 'Beta-Basic', price: 14.99, currency: '€' };
  }
  return { name: 'Free', price: 0, currency: '€' };
};

/**
 * Single source of truth for "does this user have a paid subscription?".
 * During Beta there is exactly one paid plan (Beta-Basic), so any active
 * subscription unlocks every feature. `productId` is accepted for forward
 * compatibility when tiers return.
 */
export const isSubscribed = (
  subscribed: boolean | null | undefined,
  _productId?: string | null,
): boolean => !!subscribed;


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

// Get storage quota by plan code
export const getStorageQuota = (planCode: string | null): number => {
  switch (planCode) {
    case 'basic':
      return 2048; // 2 GB
    case 'pro':
      return 5120; // 5 GB
    case 'enterprise':
      return 10240; // 10 GB
    default:
      return 1024; // 1 GB for free users
  }
};

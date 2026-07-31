import { PlanId, Currency } from './pricing';

/**
 * Stripe Price ID mapping for multi-currency support
 * 
 * IMPORTANT: User must create these prices in Stripe Dashboard first!
 * Then update these IDs with the actual Price IDs from Stripe
 */
export const STRIPE_PRICE_MAP: Record<PlanId, Record<Currency, string>> = {
  free: {
    EUR: '', // Free plan has no price
    USD: '' // Free plan has no price
  },
  basic: {
    EUR: 'price_1TzLNc1xgyPAUyx6exJw3ihw', // Beta-Basic €14.99/month
    USD: 'price_1TzLNc1xgyPAUyx6exJw3ihw'  // Reuse EUR price (single Beta-Basic during Beta)
  },
  pro: {
    EUR: 'price_1TzLNc1xgyPAUyx6exJw3ihw', // Beta-Basic (Pro tier disabled during Beta)
    USD: 'price_1TzLNc1xgyPAUyx6exJw3ihw'
  },
  enterprise: {
    EUR: 'price_1TzLNc1xgyPAUyx6exJw3ihw',
    USD: 'price_1TzLNc1xgyPAUyx6exJw3ihw'
  }
};

/**
 * Stripe Product ID mapping (remains unchanged)
 */
export const STRIPE_PRODUCT_MAP: Record<PlanId, string> = {
  free: '',
  basic: 'prod_UyE4edZ94ktyOt',
  pro: 'prod_UyE4edZ94ktyOt',
  enterprise: 'prod_UyE4edZ94ktyOt'
};

/**
 * Get Stripe Price ID for a plan and currency
 */
export const getStripePriceId = (plan: PlanId, currency: Currency): string => {
  return STRIPE_PRICE_MAP[plan][currency];
};

/**
 * Get Stripe Product ID for a plan
 */
export const getStripeProductId = (plan: PlanId): string => {
  return STRIPE_PRODUCT_MAP[plan];
};

/**
 * Intro promotion codes (Stripe Promotion Code IDs)
 */
export const INTRO_PROMO_CODES = {
  basic: {
    EUR: 'START-BASIC',
    USD: 'START-BASIC'
  },
  enterprise: {
    EUR: 'START-ENT',
    USD: 'START-ENT'
  }
} as const;

/**
 * Founders Launch promo coupons (applied automatically by create-checkout)
 *  - FOUNDERS: first 1000 subscribers, 20 % off for 24 months
 *              → €19.99 → €15.99 effective for 24 months.
 *  - LAUNCH:   everyone else, standard Beta price €19.99 (no discount).
 */
export const PRO_PROMO_COUPONS = {
  founders: 'PRO-FOUNDERS-24M',
  launch: 'PRO-LAUNCH-3M',
} as const;

export const FOUNDERS_MAX_SLOTS = 1000;
export const PRO_REGULAR_PRICE_EUR = 19.99;
export const PRO_PROMO_PRICE_EUR = 15.99;

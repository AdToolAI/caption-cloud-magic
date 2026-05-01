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
    EUR: 'price_1SLqZyDRu4kfSFxjfhMnx186', // UPDATE: Create new price in Stripe for €14.99/month
    USD: 'price_1SO4JdDRu4kfSFxjDInm0jUQ' // Basic Plan $14.99/month
  },
  pro: {
    EUR: 'price_1TSLxWDRu4kfSFxjEJNi8nGN', // Pro Plan €29.99/month (Regular v2 — promo applied via coupon)
    USD: 'price_1TSLxWDRu4kfSFxjEJNi8nGN'  // EUR-only price (USD checkout falls back to EUR)
  },
  enterprise: {
    EUR: 'price_1SLqfFDRu4kfSFxjy2ZxDkby',
    USD: 'price_1SO4LVDRu4kfSFxj8HEmHlHq'
  }
};

/**
 * Stripe Product ID mapping (remains unchanged)
 */
export const STRIPE_PRODUCT_MAP: Record<PlanId, string> = {
  free: '',
  basic: 'prod_TIRSoTyzmRpbpT',
  pro: 'prod_UOG4wbiQjDONAj', // Pro Plan v2 (€29.99 regular, canonical "AdTool AI Pro")
  enterprise: 'prod_TIRYBu4fdR2BEw'
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
 * Pro Launch promo coupons (applied automatically by create-checkout)
 *  - FOUNDERS: first 1000 subscribers, €15 off for 24 months
 *  - LAUNCH:   everyone else, €15 off for 3 months
 * Both bring €29.99 → €14.99 effective.
 */
export const PRO_PROMO_COUPONS = {
  founders: 'PRO-FOUNDERS-24M',
  launch: 'PRO-LAUNCH-3M',
} as const;

export const FOUNDERS_MAX_SLOTS = 1000;
export const PRO_REGULAR_PRICE_EUR = 29.99;
export const PRO_PROMO_PRICE_EUR = 14.99;

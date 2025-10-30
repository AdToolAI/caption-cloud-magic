import { PlanId, Currency } from './pricing';

/**
 * Stripe Price ID mapping for multi-currency support
 * 
 * IMPORTANT: User must create these prices in Stripe Dashboard first!
 * Then update these IDs with the actual Price IDs from Stripe
 */
export const STRIPE_PRICE_MAP: Record<PlanId, Record<Currency, string>> = {
  basic: {
    EUR: 'price_1SLqZyDRu4kfSFxjfhMnx186', // UPDATE: Create new price in Stripe for €14.99/month
    USD: 'price_basic_usd_PLACEHOLDER' // UPDATE: Create new price in Stripe for $14.99/month
  },
  pro: {
    EUR: 'price_1SLqd6DRu4kfSFxjM1v5wUrp', // UPDATE: Create new price in Stripe for €34.95/month
    USD: 'price_pro_usd_PLACEHOLDER' // UPDATE: Create new price in Stripe for $34.95/month
  },
  enterprise: {
    EUR: 'price_1SLqfFDRu4kfSFxjy2ZxDkby', // UPDATE: Create new price in Stripe for €69.95/month
    USD: 'price_ent_usd_PLACEHOLDER' // UPDATE: Create new price in Stripe for $69.95/month
  }
};

/**
 * Stripe Product ID mapping (remains unchanged)
 */
export const STRIPE_PRODUCT_MAP: Record<PlanId, string> = {
  basic: 'prod_TIRSoTyzmRpbpT',
  pro: 'prod_TIRWOmhxlzFCwW',
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

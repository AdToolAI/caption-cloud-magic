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
    EUR: 'price_1TPTYEDRu4kfSFxj0eWG34YP', // Pro Plan €19.99/month (Launch)
    USD: 'price_1TPTZc1xgyPAUyx6WugCHBnx' // Pro Plan $19.99/month (Launch)
  },
  enterprise: {
    EUR: 'price_1SLqfFDRu4kfSFxjy2ZxDkby', // UPDATE: Create new price in Stripe for €69.95/month
    USD: 'price_1SO4LVDRu4kfSFxj8HEmHlHq' // Enterprise Plan $69.95/month
  }
};

/**
 * Stripe Product ID mapping (remains unchanged)
 */
export const STRIPE_PRODUCT_MAP: Record<PlanId, string> = {
  free: '', // Free plan has no product
  basic: 'prod_TIRSoTyzmRpbpT',
  pro: 'prod_UOG4wbiQjDONAj', // Pro Plan (Launch €19.99)
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

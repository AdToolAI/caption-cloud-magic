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
 * Founders-Programm
 *  - Es gibt genau EIN Abomodell: Beta-Basic 14,99 €/Monat, ohne Rabatt.
 *  - Der Founders-Vorteil ist ein 20-%-Rabatt auf JEDEN Credit-Kauf
 *    (Stripe-Coupon `FOUNDERS_VIDEO_20`), gültig 24 Monate ab Slot-Claim.
 *    Angewendet wird er in der Edge-Function `ai-video-purchase-credits`.
 */
export const FOUNDERS_MAX_SLOTS = 1000;
export const FOUNDERS_CREDIT_COUPON = 'FOUNDERS_VIDEO_20';
export const FOUNDERS_CREDIT_DISCOUNT_PERCENT = 20;
export const FOUNDERS_DISCOUNT_MONTHS = 24;
export const BETA_BASIC_PRICE_EUR = 14.99;

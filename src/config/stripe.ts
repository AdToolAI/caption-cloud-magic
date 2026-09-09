import { PlanId, Currency } from './pricing';

/**
 * Stripe-Katalog des Kontos „AdTool AI" (acct_1SLqO0DRu4kfSFxj).
 *
 * Multi-Währung: EUR ist Basis-/Abrechnungswährung (deutsches Stripe-Konto),
 * USD und GBP sind eigene, fest definierte Verkaufspreise. Die Zahlungswährung
 * ist strikt getrennt von der internen Credit-Verrechnung — ein Paket schreibt
 * in jeder Währung dieselbe Credit-Menge gut.
 */
export type PaymentCurrency = Currency | 'GBP';

export const STRIPE_PRICE_MAP: Record<PlanId, Record<PaymentCurrency, string>> = {
  free: {
    EUR: '', // Free plan has no price
    USD: '',
    GBP: ''
  },
  basic: {
    EUR: 'price_1SLqZyDRu4kfSFxjfhMnx186', // Beta-Basic 14,95 €/Monat
    USD: 'price_1UDAkPDRu4kfSFxj4sINBGEZ', // Beta-Basic $14.95/month
    GBP: 'price_1UDAkPDRu4kfSFxjuSnWYGY4'  // Beta-Basic £14.95/month
  },
  pro: {
    EUR: 'price_1SLqZyDRu4kfSFxjfhMnx186', // Alias während der Beta
    USD: 'price_1UDAkPDRu4kfSFxj4sINBGEZ',
    GBP: 'price_1UDAkPDRu4kfSFxjuSnWYGY4'
  },
  enterprise: {
    EUR: 'price_1SLqZyDRu4kfSFxjfhMnx186',
    USD: 'price_1UDAkPDRu4kfSFxj4sINBGEZ',
    GBP: 'price_1UDAkPDRu4kfSFxjuSnWYGY4'
  }
};

/**
 * Stripe Product ID mapping.
 * Wird nur noch für Alt-Zuordnungen genutzt; die Plan-Erkennung läuft über
 * das aktive Abo, nicht über eine fest verdrahtete Produkt-ID.
 */
export const STRIPE_PRODUCT_MAP: Record<PlanId, string> = {
  free: '',
  basic: '',
  pro: '',
  enterprise: ''
};

/**
 * Get Stripe Price ID for a plan and payment currency
 */
export const getStripePriceId = (plan: PlanId, currency: PaymentCurrency): string => {
  return STRIPE_PRICE_MAP[plan][currency] ?? STRIPE_PRICE_MAP[plan].EUR;
};

/**
 * Get Stripe Product ID for a plan
 */
export const getStripeProductId = (plan: PlanId): string => {
  return STRIPE_PRODUCT_MAP[plan];
};

/**
 * Founders-Programm
 *  - Es gibt genau EIN Abomodell: Beta-Basic 14,95 €/Monat, ohne Rabatt.
 *  - Der Founders-Vorteil ist ein 10-%-Rabatt auf JEDEN Credit-Kauf
 *    (Stripe-Coupon `FOUNDERS_VIDEO_10`), gültig 24 Monate ab Slot-Claim.
 *    Angewendet wird er in der Edge-Function `ai-video-purchase-credits`.
 */
export const FOUNDERS_MAX_SLOTS = 1000;
export const FOUNDERS_CREDIT_COUPON = 'FOUNDERS_VIDEO_10';
export const FOUNDERS_CREDIT_DISCOUNT_PERCENT = 10;
export const FOUNDERS_DISCOUNT_MONTHS = 24;
export const BETA_BASIC_PRICE_EUR = 14.95;

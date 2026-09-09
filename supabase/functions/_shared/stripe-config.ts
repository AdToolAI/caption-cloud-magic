/**
 * Zentrale Stripe-Konfiguration für alle Edge-Functions.
 * Konto: „AdTool AI" (acct_1SLqO0DRu4kfSFxj).
 * Frontend-Pendant: src/config/stripe.ts (Werte müssen synchron bleiben).
 *
 * Es gibt genau EIN Abomodell: Beta-Basic 14,95 pro Monat — ohne Rabatt,
 * mit festen Preisen in EUR (Basis), USD und GBP.
 * Der Founders-Vorteil ist ein 10-%-Rabatt auf jeden Credit-Kauf (24 Monate),
 * siehe `ai-video-purchase-credits` + Coupon FOUNDERS_CREDIT_COUPON.
 */

export type PaymentCurrency = "EUR" | "USD" | "GBP";

/** Beta-Basic, eine Zeile pro Zahlungswährung. */
export const STRIPE_SUBSCRIPTION_PRICES: Record<PaymentCurrency, string> = {
  EUR: "price_1SLqZyDRu4kfSFxjfhMnx186", // 14,95 €/Monat
  USD: "price_1UDAkPDRu4kfSFxj4sINBGEZ", // $14.95/month
  GBP: "price_1UDAkPDRu4kfSFxjuSnWYGY4", // £14.95/month
};

/** USD-Pendant (englische UI). */
export const STRIPE_PRICE_USD = STRIPE_SUBSCRIPTION_PRICES.USD;
export const STRIPE_PRICE_GBP = STRIPE_SUBSCRIPTION_PRICES.GBP;

export const STRIPE_PRICE_MAP: Record<string, string> = {
  basic: STRIPE_SUBSCRIPTION_PRICES.EUR,
  pro: STRIPE_SUBSCRIPTION_PRICES.EUR,        // Alias während der Beta
  enterprise: STRIPE_SUBSCRIPTION_PRICES.EUR, // Alias während der Beta
};

export const STRIPE_PRODUCT_MAP: Record<string, string> = {
  basic: "",
  pro: "",
  enterprise: "",
};

/** Alle aktiven Abo-Price-IDs (für den Founders-Slot-Claim im Checkout). */
export const SUBSCRIPTION_PRICE_IDS = new Set<string>([
  STRIPE_SUBSCRIPTION_PRICES.EUR,
  STRIPE_SUBSCRIPTION_PRICES.USD,
  STRIPE_SUBSCRIPTION_PRICES.GBP,
]);

/** Legacy-Alias — wird von bestehenden Imports weiterverwendet. */
export const PRO_PRICE_IDS = SUBSCRIPTION_PRICE_IDS;

/** Founders: 10 % auf jeden Credit-Kauf, 24 Monate ab Slot-Claim. */
export const FOUNDERS_CREDIT_COUPON = "FOUNDERS_VIDEO_10";
export const FOUNDERS_CREDIT_DISCOUNT_PERCENT = 10;
export const FOUNDERS_DISCOUNT_MONTHS = 24;
export const FOUNDERS_MAX_SLOTS = 1000;


/**
 * Interne Marker in `public.founders_signups`. Das sind KEINE Stripe-Coupons —
 * sie kennzeichnen nur, ob ein Nutzer einen Founders-Slot hält. Auf das Abo
 * wird nie ein Rabatt angewendet.
 */
export const FOUNDERS_SLOT_MARKER = "PRO-FOUNDERS-24M";
export const LAUNCH_SLOT_MARKER = "PRO-LAUNCH-3M";

export const STRIPE_API_VERSION = "2025-08-27.basil";

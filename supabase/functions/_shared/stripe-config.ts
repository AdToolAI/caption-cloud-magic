/**
 * Zentrale Stripe-Konfiguration für alle Edge-Functions.
 * Einzige Quelle der Wahrheit für Price-IDs, Product-IDs, Coupons und Slot-Limits.
 * Frontend-Pendant: src/config/stripe.ts (Werte müssen synchron bleiben).
 */

export const STRIPE_PRICE_MAP: Record<string, string> = {
  basic: "price_1SLqZyDRu4kfSFxjfhMnx186",      // AdTool AI Basic — 14,99€/Monat
  pro: "price_1TSLxWDRu4kfSFxjEJNi8nGN",        // AdTool AI Pro — 29,99€/Monat (Beta-Preis via Coupon)
  enterprise: "price_1SLqfFDRu4kfSFxjy2ZxDkby", // Legacy Enterprise
};

export const STRIPE_PRODUCT_MAP: Record<string, string> = {
  basic: "prod_TIRSoTyzmRpbpT",
  pro: "prod_UOG4wbiQjDONAj",
  enterprise: "prod_TIRYBu4fdR2BEw",
};

/** Alle aktiven Pro-Price-IDs (für Coupon-Auto-Resolution im Checkout). */
export const PRO_PRICE_IDS = new Set<string>([
  STRIPE_PRICE_MAP.pro,
]);

export const FOUNDERS_COUPON = "PRO-FOUNDERS-24M";
export const LAUNCH_COUPON = "PRO-LAUNCH-3M";
export const FOUNDERS_MAX_SLOTS = 1000;

export const STRIPE_API_VERSION = "2025-08-27.basil";

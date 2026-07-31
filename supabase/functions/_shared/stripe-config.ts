/**
 * Zentrale Stripe-Konfiguration für alle Edge-Functions.
 * Einzige Quelle der Wahrheit für Price-IDs, Product-IDs, Coupons und Slot-Limits.
 * Frontend-Pendant: src/config/stripe.ts (Werte müssen synchron bleiben).
 *
 * Es gibt genau EIN Abomodell: Beta-Basic 14,99 €/Monat — ohne Rabatt.
 * Der Founders-Vorteil ist ein 20-%-Rabatt auf jeden Credit-Kauf (24 Monate),
 * siehe `ai-video-purchase-credits` + Coupon FOUNDERS_CREDIT_COUPON.
 */

export const STRIPE_PRICE_MAP: Record<string, string> = {
  basic: "price_1TzLNc1xgyPAUyx6exJw3ihw",      // Beta-Basic — 14,99 €/Monat
  pro: "price_1TzLNc1xgyPAUyx6exJw3ihw",        // Alias während der Beta
  enterprise: "price_1TzLNc1xgyPAUyx6exJw3ihw", // Alias während der Beta
};

export const STRIPE_PRODUCT_MAP: Record<string, string> = {
  basic: "prod_UyE4edZ94ktyOt",
  pro: "prod_UyE4edZ94ktyOt",
  enterprise: "prod_UyE4edZ94ktyOt",
};

/** Alle aktiven Abo-Price-IDs (für den Founders-Slot-Claim im Checkout). */
export const SUBSCRIPTION_PRICE_IDS = new Set<string>([
  STRIPE_PRICE_MAP.basic,
]);

/** Legacy-Alias — wird von bestehenden Imports weiterverwendet. */
export const PRO_PRICE_IDS = SUBSCRIPTION_PRICE_IDS;

/** Founders: 20 % auf jeden Credit-Kauf, 24 Monate ab Slot-Claim. */
export const FOUNDERS_CREDIT_COUPON = "FOUNDERS_VIDEO_20";
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

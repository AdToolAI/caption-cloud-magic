/**
 * Affiliate system configuration
 */
export const AFFILIATE_CONFIG = {
  /**
   * Commission rate for affiliates (20%)
   */
  COMMISSION_RATE: 0.20,
  
  /**
   * Duration in months for which commission is paid per referral
   */
  COMMISSION_DURATION_MONTHS: 12,
  
  /**
   * Discount percentage for customers using affiliate codes
   */
  CUSTOMER_DISCOUNT_PERCENT: 30,
  
  /**
   * Duration in months for customer discount
   */
  CUSTOMER_DISCOUNT_DURATION_MONTHS: 3,
} as const;

/**
 * Calculate commission amount from invoice total
 */
export const calculateCommission = (amountCents: number, rate: number = AFFILIATE_CONFIG.COMMISSION_RATE): number => {
  return Math.round(amountCents * rate);
};

/**
 * Check if referral is still within commission period
 */
export const isReferralActive = (startedAt: Date, maxMonths: number = AFFILIATE_CONFIG.COMMISSION_DURATION_MONTHS): boolean => {
  const now = new Date();
  const monthsElapsed = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  return monthsElapsed < maxMonths;
};

/**
 * Stripe promotion code templates for affiliates
 * Format: AFFILIATE_30_3M_{EUR|USD}
 * Discount: 30% off for 3 months
 */
export const AFFILIATE_STRIPE_COUPONS = {
  EUR: 'AFFILIATE_30_3M_EUR',
  USD: 'AFFILIATE_30_3M_USD',
} as const;

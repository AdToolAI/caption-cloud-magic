import { PlanId, Currency } from '@/config/pricing';

/**
 * Check if user is eligible for intro pricing
 * User must not have any previous subscriptions
 */
export const isEligibleForIntro = (hasAnySubscription: boolean): boolean => {
  return !hasAnySubscription;
};

/**
 * Intro promotion code mapping
 * Basic: 14.99 -> 4.99 (amount_off = 10.00)
 * Enterprise: 69.99 -> 9.99 (amount_off = 60.00)
 * Pro: No intro pricing
 */
export const INTRO_CODE_MAP: Record<PlanId, Record<Currency, string> | null> = {
  basic: {
    EUR: 'START-BASIC',
    USD: 'START-BASIC'
  },
  pro: null, // No intro pricing for Pro
  enterprise: {
    EUR: 'START-ENT',
    USD: 'START-ENT'
  }
};

/**
 * Get the intro promotion code for a plan and currency
 */
export const getIntroCode = (plan: PlanId, currency: Currency): string | null => {
  const codes = INTRO_CODE_MAP[plan];
  if (!codes) return null;
  return codes[currency] || null;
};

/**
 * Calculate intro pricing
 */
export const getIntroPricing = (plan: PlanId): { EUR: number; USD: number } | null => {
  if (plan === 'basic') {
    return { EUR: 4.99, USD: 4.99 };
  }
  if (plan === 'enterprise') {
    return { EUR: 9.99, USD: 9.99 };
  }
  return null;
};

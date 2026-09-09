/**
 * Central subscription price display.
 *
 * One subscription (Beta Basic) at 14.95 per month. The displayed currency
 * follows the UI language: € for DE/ES, $ for EN. Display only — the charged
 * currency stays with the existing Stripe price configuration.
 */
import { getLang } from '@/lib/i18nText';
import { BETA_BASIC_PRICE_EUR } from '@/config/stripe';

export const BETA_BASIC_AMOUNT = BETA_BASIC_PRICE_EUR;

/** "14,95 €" (de/es) or "$14.95" (en). */
export function subscriptionPrice(): string {
  const lang = getLang();
  if (lang === 'de') return '14,95 €';
  if (lang === 'es') return '14,95 €';
  return '$14.95';
}

/** "14,95 €/Monat" · "14,95 €/mes" · "$14.95/month". */
export function subscriptionPricePerMonth(): string {
  const lang = getLang();
  if (lang === 'de') return `${subscriptionPrice()}/Monat`;
  if (lang === 'es') return `${subscriptionPrice()}/mes`;
  return `${subscriptionPrice()}/month`;
}

/** Localized upgrade CTA used by every gate dialog. */
export function upgradeCtaLabel(): string {
  const lang = getLang();
  if (lang === 'de') return `Upgrade auf Beta Basic – ${subscriptionPricePerMonth()}`;
  if (lang === 'es') return `Mejora a Beta Basic – ${subscriptionPricePerMonth()}`;
  return `Upgrade to Beta Basic – ${subscriptionPricePerMonth()}`;
}

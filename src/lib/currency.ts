import { Currency } from '@/config/pricing';

/**
 * Detect user's preferred currency based on browser locale
 * Defaults to EUR for European countries, USD otherwise
 */
export const detectUserCurrency = (): Currency => {
  try {
    const locale = navigator.language || 'en-US';
    const countryCode = locale.split('-')[1]?.toUpperCase();
    
    // European countries use EUR
    const eurCountries = ['AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 
                          'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'];
    
    if (countryCode && eurCountries.includes(countryCode)) {
      return 'EUR';
    }
    
    return 'USD';
  } catch {
    return 'EUR'; // Default to EUR
  }
};

/**
 * Format price with currency symbol
 */
export const formatPrice = (amount: number, currency: Currency): string => {
  if (currency === 'EUR') {
    return `${amount.toFixed(2).replace('.', ',')} €`;
  }
  return `$${amount.toFixed(2)}`;
};

/**
 * Get currency symbol
 */
export const getCurrencySymbol = (currency: Currency): string => {
  return currency === 'EUR' ? '€' : '$';
};

/**
 * Parse currency from locale
 */
export const getCurrencyFromLocale = (locale: string): Currency => {
  if (locale.startsWith('de') || locale.startsWith('es') || locale.startsWith('fr')) {
    return 'EUR';
  }
  return 'USD';
};

/**
 * Get currency based on UI language.
 * Englische UI = USD, Deutsch/Spanisch = EUR. Alle Preise sind 1:1 gepflegt
 * (Beta-Basic 14,99 € / $14.99, Credit-Packs 10/50/100/250), es gibt für jede
 * Währung einen eigenen Stripe-Preis — es wird also nie EUR abgebucht,
 * während USD angezeigt wird.
 */
export const getCurrencyForLanguage = (language: string): Currency => {
  return language === 'de' || language === 'es' ? 'EUR' : 'USD';
};

/**
 * Format a price value for display based on language.
 * Betrag ist 1:1 in beiden Währungen; Symbol und Dezimaltrenner folgen der UI-Sprache.
 */
export const formatPriceForLanguage = (amount: number, language: string): string => {
  const currency = getCurrencyForLanguage(language);
  if (currency === 'EUR') {
    return `€${amount.toFixed(2).replace('.', ',')}`;
  }
  return `$${amount.toFixed(2)}`;
};


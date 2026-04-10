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
 * Get currency based on UI language
 * EN → USD, DE/ES → EUR
 */
export const getCurrencyForLanguage = (language: string): Currency => {
  return language === 'en' ? 'USD' : 'EUR';
};

/**
 * Format a price value for display based on language
 */
export const formatPriceForLanguage = (amount: number, language: string): string => {
  const currency = getCurrencyForLanguage(language);
  if (currency === 'EUR') {
    return `€${amount.toFixed(2).replace('.', ',')}`;
  }
  return `$${amount.toFixed(2)}`;
};

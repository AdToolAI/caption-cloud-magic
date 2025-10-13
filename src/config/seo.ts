/**
 * Zentrale SEO-Konfiguration für CaptionGenie
 * Alle SEO-bezogenen URLs und Einstellungen werden hier verwaltet
 */

export const SEO_CONFIG = {
  // Base URL - wird aus Environment Variable gelesen
  baseUrl: import.meta.env.VITE_BASE_URL || 'https://captiongenie.app',
  
  // Site Information
  siteName: 'CaptionGenie',
  defaultTitle: 'CaptionGenie - KI Social Media Caption Generator',
  defaultDescription: 'Erstelle perfekte Instagram, Facebook & LinkedIn Captions in Sekunden mit KI. Über 10.000 Creator vertrauen CaptionGenie.',
  
  // Social Media
  twitterHandle: '@captiongenie',
  facebookAppId: '', // Optional: Facebook App ID
  
  // Images
  defaultOgImage: '/og-image.jpg',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  
  // Languages
  defaultLanguage: 'de',
  supportedLanguages: ['de', 'en', 'es'],
  
  // Google Analytics
  gaId: import.meta.env.VITE_GA_MEASUREMENT_ID || '',
  
  // Brand Colors (für OG-Images)
  brandColors: {
    primary: '#8B5CF6',
    secondary: '#D946EF',
  },
};

/**
 * Generiert vollständige kanonische URL
 */
export const getCanonicalUrl = (path: string): string => {
  // Entfernt führenden Slash wenn vorhanden und fügt ihn dann hinzu
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${SEO_CONFIG.baseUrl}${cleanPath}`;
};

/**
 * Generiert OG-Image URL
 */
export const getOgImageUrl = (imagePath?: string): string => {
  const image = imagePath || SEO_CONFIG.defaultOgImage;
  if (image.startsWith('http')) {
    return image;
  }
  return `${SEO_CONFIG.baseUrl}${image}`;
};

/**
 * Generiert locale basierend auf Sprache
 */
export const getLocale = (lang: string): string => {
  const localeMap: Record<string, string> = {
    de: 'de_DE',
    en: 'en_US',
    es: 'es_ES',
  };
  return localeMap[lang] || localeMap[SEO_CONFIG.defaultLanguage];
};

/**
 * SEO-optimierte Seiten-Konfiguration
 */
export const PAGES_SEO = {
  home: {
    path: '/',
    title: 'KI Social Media Caption Generator',
    description: 'Erstelle perfekte Instagram, Facebook & LinkedIn Captions in Sekunden mit KI. Über 10.000 Creator vertrauen CaptionGenie.',
    ogImage: '/og-home.jpg',
    priority: 1.0,
    changefreq: 'weekly' as const,
  },
  pricing: {
    path: '/pricing',
    title: 'Preise & Pakete',
    description: 'Wähle den perfekten Plan für deine Social Media Strategie. Starte kostenlos oder upgrade für unbegrenzte Captions.',
    ogImage: '/og-pricing.jpg',
    priority: 0.9,
    changefreq: 'monthly' as const,
  },
  faq: {
    path: '/faq',
    title: 'Häufig gestellte Fragen',
    description: 'Antworten auf die häufigsten Fragen zu CaptionGenie. Erfahre mehr über Funktionen, Preise und Integration.',
    ogImage: '/og-faq.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
  },
  features: {
    path: '/features',
    title: 'Features & Funktionen',
    description: 'Entdecke alle Funktionen von CaptionGenie: KI-Captions, Hashtag-Generator, Brand Voice und mehr.',
    ogImage: '/og-features.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
  },
  legal: {
    path: '/legal',
    title: 'Rechtliches',
    description: 'Impressum, Datenschutz und AGB von CaptionGenie.',
    ogImage: '/og-image.jpg',
    priority: 0.3,
    changefreq: 'yearly' as const,
    noindex: true,
  },
} as const;

/**
 * Zentrale SEO-Konfiguration für AdTool AI
 * Alle SEO-bezogenen URLs und Einstellungen werden hier verwaltet
 */

export const SEO_CONFIG = {
  // Base URL - wird aus Environment Variable gelesen
  baseUrl: import.meta.env.VITE_BASE_URL || 'https://useadtool.ai',
  
  // Site Information
  siteName: 'AdTool AI',
  defaultTitle: 'AdTool AI - KI Social Media Manager & Caption Generator',
  defaultDescription: 'Erstelle perfekte Social Media Captions mit KI in Sekunden. Instagram, TikTok, LinkedIn & mehr. Über 10.000 Creator vertrauen AdTool AI für besseren Content.',
  
  // Social Media
  twitterHandle: '@adtoolai',
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
  
  // Additional SEO Settings
  author: 'AdTool AI Team',
  keywords: [
    'KI Caption Generator',
    'Social Media Manager',
    'Instagram Captions',
    'TikTok Content',
    'LinkedIn Posts',
    'AI Social Media',
    'Content Creator Tools',
    'Social Media Planner',
  ],
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
    title: 'KI Social Media Caption Generator - Instagram, TikTok & LinkedIn',
    description: 'Erstelle perfekte Social Media Captions in Sekunden mit KI. Instagram, TikTok, LinkedIn & Facebook. Über 10.000 Creator vertrauen AdTool AI für viralen Content.',
    ogImage: '/og-home.jpg',
    priority: 1.0,
    changefreq: 'weekly' as const,
    keywords: ['KI Caption Generator', 'Instagram Captions', 'TikTok Hooks', 'Social Media AI'],
  },
  pricing: {
    path: '/pricing',
    title: 'Preise & Pakete - Kostenlos starten | AdTool AI',
    description: 'Transparente Preise für jeden Creator. Starte kostenlos mit 5 Captions täglich. Pro-Plan ab €9.99 für unbegrenzte AI-Captions & Content-Planer.',
    ogImage: '/og-pricing.jpg',
    priority: 0.9,
    changefreq: 'monthly' as const,
    keywords: ['AdTool AI Preise', 'Social Media Tools Kosten', 'Caption Generator Preis'],
  },
  faq: {
    path: '/faq',
    title: 'Häufig gestellte Fragen - AdTool AI Support',
    description: 'Antworten auf die häufigsten Fragen zu AdTool AI. Funktionen, Preise, Integration, Datenschutz und mehr. Schnelle Hilfe für Creator.',
    ogImage: '/og-faq.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
    keywords: ['AdTool AI FAQ', 'Social Media Tool Hilfe', 'Caption Generator Fragen'],
  },
  features: {
    path: '/features',
    title: 'Features - KI-Captions, Planer & Analytics | AdTool AI',
    description: 'Entdecke alle Features: KI-Caption-Generator, Content-Planer, Hashtag-Generator, Brand Voice, Analytics & mehr. Alles für deinen Social Media Erfolg.',
    ogImage: '/og-features.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
    keywords: ['Social Media Features', 'KI Content Tools', 'Caption Generator Features'],
  },
  legal: {
    path: '/legal',
    title: 'Impressum & Rechtliches - AdTool AI',
    description: 'Impressum, Datenschutzerklärung und AGB von AdTool AI. Transparente Informationen zu Datenschutz und rechtlichen Aspekten.',
    ogImage: '/og-image.jpg',
    priority: 0.3,
    changefreq: 'yearly' as const,
    noindex: true,
  },
} as const;

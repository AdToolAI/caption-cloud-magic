/**
 * Zentrale SEO-Konfiguration für AdTool AI
 * Alle SEO-bezogenen URLs und Einstellungen werden hier verwaltet
 */

export const SEO_CONFIG = {
  // Base URL - wird aus Environment Variable gelesen
  baseUrl: import.meta.env.VITE_BASE_URL || 'https://useadtool.ai',
  
  // Site Information
  siteName: 'AdTool AI',
  defaultTitle: 'AdTool AI — Ein Creator. Ein ganzes Studio.',
  defaultDescription: 'Erstelle komplette KI-Videos mit den führenden Modellen, Stimmen und Lip-Sync in einem einzigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.',

  
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
    'KI Videogenerator',
    'KI Video erstellen',
    'Lip-Sync KI',
    'AI Avatar Video',
    'Videoproduktion ohne Team',
    'KI Voiceover',
    'Content Creator Tools',
    'KI Werbevideo',
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
    title: 'Ein Creator. Ein ganzes Studio. — KI-Videos mit AdTool AI',
    description: 'Alle führenden KI-Modelle, Stimmen und präziser Lip-Sync in einem durchgängigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.',
    ogImage: '/og-home.jpg',
    priority: 1.0,
    changefreq: 'weekly' as const,
    keywords: ['KI Videogenerator', 'Lip-Sync KI', 'AI Avatar Video', 'KI Werbevideo'],
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

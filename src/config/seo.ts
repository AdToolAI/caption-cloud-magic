import { tx } from "@/lib/i18nText";
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
  defaultDescription: tx({ de: 'Erstelle komplette KI-Videos mit den führenden Modellen, Stimmen und Lip-Sync in einem einzigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.', en: 'Create complete AI videos with leading models, voices, and lip-sync in a single workflow. From idea to finished video — without a film crew.', es: 'Crea videos completos de IA con los modelos, voces y sincronización labial líderes en un solo flujo de trabajo. De la idea al video terminado — sin equipo de filmación.' }),

  
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
    tx({ de: "KI Video erstellen", en: "Create AI video", es: "Crear vídeo de IA" }),
    'Lip-Sync KI',
    tx({ de: "AI Avatar Video", en: "AI avatar video", es: "Vídeo de avatar de IA" }),
    'Videoproduktion ohne Team',
    'KI Voiceover',
    'Content Creator Tools',
    'KI Werbevideo',
  ],
};

/**
 * Generiert vollständige kanonische URL.
 * Absolute Eingaben werden unverändert zurückgegeben (verhindert Domain-Verdopplung
 * wie https://useadtool.ai/https://useadtool.ai/).
 */
export const getCanonicalUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
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
    title: 'Ein Creator. Ein ganzes Studio. — KI-Videoproduktion',
    description: tx({ de: 'Alle führenden KI-Modelle, Stimmen und präziser Lip-Sync in einem durchgängigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.', en: 'All leading AI models, voices, and precise lip-sync in a continuous workflow. From idea to finished video — without a film crew.', es: 'Todos los modelos de IA líderes, voces y sincronización labial precisa en un flujo de trabajo continuo. De la idea al video terminado — sin equipo de filmación.' }),
    ogImage: '/og-home.jpg',
    priority: 1.0,
    changefreq: 'weekly' as const,
    keywords: ['KI Videogenerator', 'Lip-Sync KI', tx({ de: "AI Avatar Video", en: "AI avatar video", es: "Vídeo de avatar de IA" }), 'KI Werbevideo'],
  },
  pricing: {
    path: '/pricing',
    title: 'Preise & Pakete - Kostenlos starten | AdTool AI',
    description: tx({ de: 'Transparente Preise für jeden Creator. Starte kostenlos mit 5 Captions täglich. Pro-Plan ab €9.99 für unbegrenzte AI-Captions & Content-Planer.', en: 'Transparent pricing for every creator. Start for free with 5 captions daily. Pro plan from €9.99 for unlimited AI captions & content planner.', es: 'Precios transparentes para cada creador. Empieza gratis con 5 subtítulos diarios. Plan Pro desde 9,99 € para subtítulos de IA ilimitados y planificador de contenido.' }),
    ogImage: '/og-pricing.jpg',
    priority: 0.9,
    changefreq: 'monthly' as const,
    keywords: ['AdTool AI Preise', 'Social Media Tools Kosten', 'Caption Generator Preis'],
  },
  faq: {
    path: '/faq',
    title: 'Häufig gestellte Fragen - AdTool AI Support',
    description: tx({ de: 'Antworten auf die häufigsten Fragen zu AdTool AI. Funktionen, Preise, Integration, Datenschutz und mehr. Schnelle Hilfe für Creator.', en: 'Answers to the most common questions about AdTool AI. Features, pricing, integration, data protection and more. Quick help for creators.', es: 'Respuestas a las preguntas más frecuentes sobre AdTool AI. Funciones, precios, integración, protección de datos y más. Ayuda rápida para creadores.' }),
    ogImage: '/og-faq.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
    keywords: ['AdTool AI FAQ', 'Social Media Tool Hilfe', 'Caption Generator Fragen'],
  },
  features: {
    path: '/features',
    title: 'Features - KI-Captions, Planer & Analytics | AdTool AI',
    description: tx({ de: 'Entdecke alle Features: KI-Caption-Generator, Content-Planer, Hashtag-Generator, Brand Voice, Analytics & mehr. Alles für deinen Social Media Erfolg.', en: 'Discover all features: AI caption generator, content planner, hashtag generator, brand voice, analytics & more. Everything for your social media success.', es: 'Descubre todas las funciones: generador de subtítulos de IA, planificador de contenido, generador de hashtags, voz de marca, análisis y más. Todo para tu éxito en redes sociales.' }),
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

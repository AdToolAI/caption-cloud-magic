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
  defaultTitle: tx({ de: 'AdTool AI — Ein Creator. Ein ganzes Studio.', en: 'AdTool AI — One creator. One entire studio.', es: 'AdTool AI — Un creador. Un estudio completo.' }),
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
    tx({ de: 'KI Videogenerator', en: 'AI Video Generator', es: 'Generador de vídeo de IA' }),
    tx({ de: "KI Video erstellen", en: "Create AI video", es: "Crear vídeo de IA" }),
    tx({ de: 'Lip-Sync KI', en: 'Lip-Sync AI', es: 'Sincronización labial de IA' }),
    tx({ de: "AI Avatar Video", en: "AI avatar video", es: "Vídeo de avatar de IA" }),
    tx({ de: 'Videoproduktion ohne Team', en: 'Video production without a team', es: 'Producción de vídeo sin equipo.' }),
    tx({ de: 'KI Voiceover', en: 'AI Voiceover', es: 'Voz en off de IA' }),
    tx({ de: 'Content Creator Tools', en: 'Content creator tools', es: 'Herramientas para creadores de contenido' }),
    tx({ de: 'KI Werbevideo', en: 'AI advertising video', es: 'Vídeo publicitario de IA' }),
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
    title: tx({ de: 'Ein Creator. Ein ganzes Studio. — KI-Videoproduktion', en: 'One creator. One entire studio. — AI video production', es: 'Un creador. Un estudio completo. — Producción de vídeo de IA' }),
    description: tx({ de: 'Alle führenden KI-Modelle, Stimmen und präziser Lip-Sync in einem durchgängigen Workflow. Von der Idee zum fertigen Video — ohne Filmteam.', en: 'All leading AI models, voices, and precise lip-sync in a continuous workflow. From idea to finished video — without a film crew.', es: 'Todos los modelos de IA líderes, voces y sincronización labial precisa en un flujo de trabajo continuo. De la idea al video terminado — sin equipo de filmación.' }),
    ogImage: '/og-home.jpg',
    priority: 1.0,
    changefreq: 'weekly' as const,
    keywords: ['KI Videogenerator', 'Lip-Sync KI', tx({ de: "AI Avatar Video", en: "AI avatar video", es: "Vídeo de avatar de IA" }), 'KI Werbevideo'],
  },
  pricing: {
    path: '/pricing',
    title: tx({ de: 'Preise & Pakete - Kostenlos starten | AdTool AI', en: 'Pricing & packages - Start for free | AdTool AI', es: 'Precios y paquetes: empieza gratis | AdTool AI' }),
    description: tx({ de: 'Transparente Preise für jeden Creator. Starte kostenlos mit 5 Captions täglich. Pro-Plan ab €9.99 für unbegrenzte AI-Captions & Content-Planer.', en: 'Transparent pricing for every creator. Start for free with 5 captions daily. Pro plan from €9.99 for unlimited AI captions & content planner.', es: 'Precios transparentes para cada creador. Empieza gratis con 5 subtítulos diarios. Plan Pro desde 9,99 € para subtítulos de IA ilimitados y planificador de contenido.' }),
    ogImage: '/og-pricing.jpg',
    priority: 0.9,
    changefreq: 'monthly' as const,
    keywords: [tx({ de: 'AdTool AI Preise', en: 'AdTool AI pricing', es: 'Precios de AdTool AI' }), tx({ de: 'Social Media Tools Kosten', en: 'Social media tools costs', es: 'Costos de herramientas de redes sociales' }), tx({ de: 'Caption Generator Preis', en: 'Caption generator price', es: 'Precio del generador de subtítulos' })],
  },
  faq: {
    path: '/faq',
    title: tx({ de: 'Häufig gestellte Fragen - AdTool AI Support', en: 'Frequently asked questions - AdTool AI Support', es: 'Preguntas frecuentes - Soporte de AdTool AI' }),
    description: tx({ de: 'Antworten auf die häufigsten Fragen zu AdTool AI. Funktionen, Preise, Integration, Datenschutz und mehr. Schnelle Hilfe für Creator.', en: 'Answers to the most common questions about AdTool AI. Features, pricing, integration, data protection and more. Quick help for creators.', es: 'Respuestas a las preguntas más frecuentes sobre AdTool AI. Funciones, precios, integración, protección de datos y más. Ayuda rápida para creadores.' }),
    ogImage: '/og-faq.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
    keywords: [tx({ de: 'AdTool AI FAQ', en: 'AdTool AI FAQ', es: 'Preguntas frecuentes de AdTool AI' }), tx({ de: 'Social Media Tool Hilfe', en: 'Social media tool help', es: 'Ayuda de herramientas de redes sociales' }), tx({ de: 'Caption Generator Fragen', en: 'Caption generator questions', es: 'Preguntas sobre el generador de subtítulos' })],
  },
  features: {
    path: '/features',
    title: tx({ de: 'Features - KI-Captions, Planer & Analytics | AdTool AI', en: 'Features - AI captions, planner & analytics | AdTool AI', es: 'Funciones: subtítulos de IA, planificador y análisis | AdTool AI' }),
    description: tx({ de: 'Entdecke alle Features: KI-Caption-Generator, Content-Planer, Hashtag-Generator, Brand Voice, Analytics & mehr. Alles für deinen Social Media Erfolg.', en: 'Discover all features: AI caption generator, content planner, hashtag generator, brand voice, analytics & more. Everything for your social media success.', es: 'Descubre todas las funciones: generador de subtítulos de IA, planificador de contenido, generador de hashtags, voz de marca, análisis y más. Todo para tu éxito en redes sociales.' }),
    ogImage: '/og-features.jpg',
    priority: 0.8,
    changefreq: 'monthly' as const,
    keywords: [tx({ de: 'Social Media Features', en: 'Social media features', es: 'Funciones de redes sociales' }), tx({ de: 'KI Content Tools', en: 'AI content tools', es: 'Herramientas de contenido de IA' }), tx({ de: 'Caption Generator Features', en: 'Caption generator features', es: 'Funciones del generador de subtítulos' })],
  },
  legal: {
    path: '/legal',
    title: tx({ de: 'Impressum & Rechtliches - AdTool AI', en: 'Imprint & legal - AdTool AI', es: 'Pie de imprenta y avisos legales - AdTool AI' }),
    description: tx({ de: 'Impressum, Datenschutzerklärung und AGB von AdTool AI. Transparente Informationen zu Datenschutz und rechtlichen Aspekten.', en: 'Imprint, data protection declaration and general terms and conditions of AdTool AI. Transparent information on data protection and legal aspects.', es: 'Pie de imprenta, declaración de protección de datos y términos y condiciones generales de AdTool AI. Información transparente sobre protección de datos y aspectos legales.' }),
    ogImage: '/og-image.jpg',
    priority: 0.3,
    changefreq: 'yearly' as const,
    noindex: true,
  },
} as const;

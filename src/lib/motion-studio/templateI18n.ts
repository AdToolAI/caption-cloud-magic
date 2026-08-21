import { tx } from '@/lib/i18nText';

/**
 * Motion-Studio-Templates liegen mit deutschen Beschreibungen in der Datenbank.
 * Für die EN/ES-UI werden sie hier anhand des Template-Namens übersetzt.
 */
const DESCRIPTIONS: Record<string, { de: string; en: string; es: string }> = {
  'Product Launch Hero': {
    de: 'Cineastische Produkt-Einführung mit Hook, Demo und starkem CTA. Perfekt für neue Produkt-Releases.',
    en: 'Cinematic product launch with hook, demo and a strong CTA. Perfect for new product releases.',
    es: 'Lanzamiento de producto cinematográfico con gancho, demo y un CTA potente. Ideal para nuevos productos.',
  },
  'Testimonial Reel': {
    de: 'Kurzes Kunden-Testimonial im Reel-Format mit Social Proof.',
    en: 'Short customer testimonial in reel format with social proof.',
    es: 'Testimonio breve de cliente en formato reel con prueba social.',
  },
  'Feature Spotlight': {
    de: 'Hyper-fokussierte 15-Sekunden-Werbung für ein einzelnes Feature.',
    en: 'Hyper-focused 15-second ad for a single feature.',
    es: 'Anuncio hiperenfocado de 15 segundos para una sola función.',
  },
  'Tutorial Short': {
    de: 'Schnelles How-to-Video mit klaren Schritten und Pay-off. Ideal für Knowledge Sharing.',
    en: 'Fast how-to video with clear steps and a pay-off. Ideal for knowledge sharing.',
    es: 'Vídeo tutorial rápido con pasos claros y recompensa. Ideal para compartir conocimiento.',
  },
  'Before / After Reveal': {
    de: 'Klassisches Transformations-Video mit starkem visuellen Kontrast.',
    en: 'Classic transformation video with strong visual contrast.',
    es: 'Vídeo de transformación clásico con fuerte contraste visual.',
  },
  'Behind The Scenes': {
    de: 'Authentisches BTS-Video, das Vertrauen und Persönlichkeit aufbaut.',
    en: 'Authentic behind-the-scenes video that builds trust and personality.',
    es: 'Vídeo auténtico entre bastidores que genera confianza y personalidad.',
  },
  'Quick Tip Card': {
    de: 'Mini-Tipp im Karten-Format für Instagram Feed und LinkedIn.',
    en: 'Mini tip in card format for the Instagram feed and LinkedIn.',
    es: 'Minitruco en formato tarjeta para el feed de Instagram y LinkedIn.',
  },
  'Corporate Pitch': {
    de: 'Professionelle Unternehmensvorstellung im Landscape-Format für YouTube und Web.',
    en: 'Professional company introduction in landscape format for YouTube and web.',
    es: 'Presentación corporativa profesional en formato horizontal para YouTube y web.',
  },
  'Lifestyle Mood': {
    de: 'Atmosphärisches Lifestyle-Video für Mode, Wellness und Premium-Brands.',
    en: 'Atmospheric lifestyle video for fashion, wellness and premium brands.',
    es: 'Vídeo de estilo de vida atmosférico para moda, bienestar y marcas premium.',
  },
  'Brand Story': {
    de: 'Emotionale Markengeschichte, die Werte und Mission transportiert.',
    en: 'Emotional brand story that carries values and mission.',
    es: 'Historia de marca emotiva que transmite valores y misión.',
  },
};

/** Liefert die lokalisierte Beschreibung, sonst den Datenbank-Text. */
export function localizeTemplateDescription(name: string, fallback: string | null | undefined): string {
  const entry = DESCRIPTIONS[name];
  return entry ? tx(entry) : (fallback ?? '');
}

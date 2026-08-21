import { tx } from "@/lib/i18nText";
/**
 * Overlay-Bibliothek des Director's Cut (v407).
 * Fertige, markenfähige Bausteine: Lower Thirds, Banner, Störer,
 * Schilder, CTA, Ticker, Logo-Bug, Callout, Zitat, Fortschritt.
 */
import type { OverlayKind, TextOverlay } from '@/types/directors-cut';
import { DEFAULT_OVERLAY_BOX } from './overlayModel';

export interface OverlayPreset {
  id: string;
  name: string;
  category: 'Lower Third' | 'Banner' | 'Störer' | 'Schild' | 'CTA' | 'Ticker' | 'Marke' | 'Callout' | 'Zitat' | 'Info' | 'Text';
  description: string;
  kind: OverlayKind;
  build: () => Omit<TextOverlay, 'id' | 'startTime' | 'endTime'>;
}

const GOLD = '#F5C76A';
const INK = '#0A0A0F';

function base(
  kind: OverlayKind,
  text: string,
  style: Partial<TextOverlay['style']> = {},
  extra: Partial<TextOverlay> = {},
): Omit<TextOverlay, 'id' | 'startTime' | 'endTime'> {
  return {
    text,
    kind,
    animation: extra.animation ?? 'fadeIn',
    enter: extra.enter ?? extra.animation ?? 'fadeIn',
    exit: extra.exit ?? 'fadeIn',
    position: 'custom',
    box: extra.box ?? { ...DEFAULT_OVERLAY_BOX[kind] },
    slots: extra.slots,
    style: {
      fontSize: 'md',
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      shadow: true,
      fontFamily: 'Inter, sans-serif',
      fontSizeRel: 0.038,
      fontWeight: 700,
      align: 'center',
      radius: 0.014,
      padding: 0.018,
      opacity: 1,
      accentColor: GOLD,
      ...style,
    },
  };
}

export const OVERLAY_PRESETS: OverlayPreset[] = [
  // ---- Lower Thirds ----
  {
    id: 'lt-bar',
    name: tx({ de: 'Lower Third — Balken', en: 'Lower third — bar', es: 'Rótulo inferior — barra' }),
    category: 'Lower Third',
    description: tx({ de: 'Name und Rolle mit Akzentkante', en: 'Name and role with accent border', es: 'Nombre y rol con borde de acento' }),
    kind: 'lowerThird',
    build: () =>
      base(
        'lowerThird',
        'Max Mustermann',
        { fill: 'rgba(10,10,15,0.82)', fontSizeRel: 0.036, align: 'left' },
        { animation: 'slideRight', slots: { title: 'Max Mustermann', subtitle: tx({ de: "Gründer & CEO", en: "Founder & CEO", es: "Fundador y CEO" }) } },
      ),
  },
  {
    id: 'lt-line',
    name: tx({ de: 'Lower Third — Linie', en: 'Lower third — line', es: 'Rótulo inferior — línea' }),
    category: 'Lower Third',
    description: tx({ de: 'Reduziert, ohne Fläche', en: 'Reduced, without space', es: 'Reducido, sin espacio' }),
    kind: 'lowerThird',
    build: () =>
      base(
        'lowerThird',
        'Sarah Klein',
        { fill: 'transparent', shadow: true, fontSizeRel: 0.038, align: 'left' },
        { animation: 'wipe', slots: { title: 'Sarah Klein', subtitle: 'Head of Content' } },
      ),
  },
  {
    id: 'lt-glass',
    name: tx({ de: 'Lower Third — Glas', en: 'Lower third — glass', es: 'Rótulo inferior — cristal' }),
    category: 'Lower Third',
    description: tx({ de: 'Glasoptik mit weichem Rand', en: 'Glass look with soft edge', es: 'Aspecto de cristal con borde suave.' }),
    kind: 'lowerThird',
    build: () =>
      base(
        'lowerThird',
        'Studio Talk',
        { fill: 'rgba(255,255,255,0.12)', borderWidth: 0.0012, borderColor: 'rgba(255,255,255,0.35)', align: 'left' },
        { animation: 'blurIn', slots: { title: 'Studio Talk', subtitle: 'Folge 12' } },
      ),
  },

  // ---- Banner ----
  {
    id: 'banner-bottom',
    name: tx({ de: 'Banner unten', en: 'Banner bottom', es: 'Banner inferior' }),
    category: 'Banner',
    description: tx({ de: 'Vollbreiter Balken mit Aussage', en: 'Full-width bar with a statement', es: 'Barra de ancho completo con una declaración.' }),
    kind: 'banner',
    build: () => base('banner', tx({ de: 'NUR HEUTE: 30 % RABATT', en: 'TODAY ONLY: 30% OFF', es: 'SOLO HOY: 30 % DE DESCUENTO' }), { fill: 'rgba(10,10,15,0.85)', uppercase: true, radius: 0 }, { animation: 'slideUp' }),
  },
  {
    id: 'banner-top-gold',
    name: tx({ de: 'Banner oben — Gold', en: 'Banner top — gold', es: 'Banner superior — oro' }),
    category: 'Banner',
    description: tx({ de: 'Goldverlauf für Ankündigungen', en: 'Gold gradient for announcements', es: 'Degradado dorado para anuncios.' }),
    kind: 'banner',
    build: () =>
      base(
        'banner',
        tx({ de: 'NEUE KOLLEKTION', en: 'NEW COLLECTION', es: 'NUEVA COLECCIÓN' }),
        { gradient: [GOLD, '#C79B3F'], color: INK, uppercase: true, radius: 0 },
        { animation: 'slideDown', box: { x: 0, y: 0.04, w: 1, h: 0.11 } },
      ),
  },
  {
    id: 'banner-half',
    name: tx({ de: 'Banner halb', en: 'Banner half', es: 'Banner medio' }),
    category: 'Banner',
    description: tx({ de: 'Halbbreiter Balken mit Unterzeile', en: 'Half-width bar with subline', es: 'Barra de medio ancho con sublínea' }),
    kind: 'banner',
    build: () =>
      base(
        'banner',
        tx({ de: 'Jetzt testen', en: 'Try now', es: 'Pruébalo ahora' }),
        { fill: 'rgba(10,10,15,0.85)' },
        { animation: 'slideRight', box: { x: 0.04, y: 0.78, w: 0.52, h: 0.13 }, slots: { subtitle: tx({ de: '14 Tage kostenlos', en: '14 days for free', es: '14 días gratis' }) } },
      ),
  },

  // ---- Störer / Badges ----
  {
    id: 'badge-discount',
    name: tx({ de: 'Störer — Rabatt', en: 'Badge — Discount', es: 'Insignia — Descuento' }),
    category: 'Störer',
    description: tx({ de: "Runder Preis-Störer", en: "Round Price Overlay", es: "Superposición de precio redonda" }),
    kind: 'badge',
    build: () => base('badge', '-30%', { fill: GOLD, color: INK, fontSizeRel: 0.06, uppercase: true }, { animation: 'pop' }),
  },
  {
    id: 'badge-new',
    name: tx({ de: 'Störer — NEU', en: 'Badge — NEW', es: 'Insignia — NUEVO' }),
    category: 'Störer',
    description: tx({ de: 'Pill-Badge für Neuheiten', en: 'Pill badge for new products', es: 'Insignia de píldora para nuevos productos.' }),
    kind: 'badge',
    build: () =>
      base(
        'badge',
        'NEW',
        { fill: '#E5484D', color: '#FFFFFF', fontSizeRel: 0.032, uppercase: true },
        { animation: 'pop', box: { x: 0.06, y: 0.08, w: 0.14, h: 0.08 } },
      ),
  },
  {
    id: 'badge-limited',
    name: tx({ de: 'Störer — Limitiert', en: 'Badge — Limited', es: 'Insignia — Limitado' }),
    category: 'Störer',
    description: tx({ de: "Dringlichkeit erzeugen", en: "Create urgency", es: "Crear urgencia" }),
    kind: 'badge',
    build: () =>
      base(
        'badge',
        tx({ de: "NUR 1000 PLÄTZE", en: "ONLY 1000 SPOTS", es: "SOLO 1000 PLAZAS" }),
        { fill: 'rgba(10,10,15,0.85)', color: GOLD, fontSizeRel: 0.026, uppercase: true },
        { animation: 'fadeIn', box: { x: 0.62, y: 0.07, w: 0.32, h: 0.08 } },
      ),
  },

  // ---- Schilder / Karten ----
  {
    id: 'card-info',
    name: tx({ de: 'Schild — Info', en: 'Card — Info', es: 'Tarjeta — Información' }),
    category: 'Schild',
    description: tx({ de: 'Karte mit Titel und Unterzeile', en: 'Card with title and subtitle', es: 'Tarjeta con título y subtítulo' }),
    kind: 'card',
    build: () =>
      base(
        'card',
        tx({ de: 'Öffnungszeiten', en: 'Opening hours', es: 'Horario' }),
        { fill: 'rgba(10,10,15,0.8)', align: 'left', fontSizeRel: 0.036 },
        { animation: 'slideRight', slots: { title: tx({ de: 'Öffnungszeiten', en: 'Opening hours', es: 'Horario' }), subtitle: tx({ de: 'Mo–Fr 9–18 Uhr', en: 'Mon–Fri 9am–6pm', es: 'Lun–Vie 9am–6pm' }) } },
      ),
  },
  {
    id: 'card-feature',
    name: tx({ de: 'Schild — Feature', en: 'Card — Feature', es: 'Tarjeta — Característica' }),
    category: 'Schild',
    description: tx({ de: 'Produktvorteil mit Bildplatz', en: 'Product advantage with image space', es: 'Ventaja del producto con espacio de imagen' }),
    kind: 'card',
    build: () =>
      base(
        'card',
        tx({ de: 'In 60 Sekunden fertig', en: 'Ready in 60 seconds', es: 'Listo en 60 segundos' }),
        { fill: 'rgba(255,255,255,0.12)', borderWidth: 0.0012, borderColor: 'rgba(255,255,255,0.3)', align: 'left', fontSizeRel: 0.034 },
        { animation: 'blurIn', slots: { title: tx({ de: 'In 60 Sekunden fertig', en: 'Ready in 60 seconds', es: 'Listo en 60 segundos' }), subtitle: tx({ de: 'Vom Briefing zum Clip', en: 'From briefing to clip', es: 'De la sesión informativa al clip' }) } },
      ),
  },
  {
    id: 'card-price',
    name: tx({ de: 'Schild — Preis', en: 'Card — Price', es: 'Tarjeta — Precio' }),
    category: 'Schild',
    description: 'Preisangabe hervorheben',
    kind: 'card',
    build: () =>
      base(
        'card',
        tx({ de: '14,99 € / Monat', en: '$14.99 / month', es: '14,99 € / mes' }),
        { fill: 'rgba(10,10,15,0.85)', color: GOLD, align: 'left', fontSizeRel: 0.042 },
        { animation: 'pop', box: { x: 0.08, y: 0.62, w: 0.4, h: 0.18 }, slots: { title: tx({ de: '14,99 € / Monat', en: '$14.99 / month', es: '14,99 € / mes' }), subtitle: tx({ de: 'jederzeit kündbar', en: 'cancel at any time', es: 'cancelable en cualquier momento' }) } },
      ),
  },

  // ---- CTA ----
  {
    id: 'cta-gold',
    name: tx({ de: 'CTA — Gold', en: 'CTA — Gold', es: 'CTA — Oro' }),
    category: 'CTA',
    description: tx({ de: 'Button-Optik mit Pfeil', en: 'Button look with arrow', es: 'Botón con flecha' }),
    kind: 'cta',
    build: () => base('cta', tx({ de: 'Jetzt starten', en: 'Start now', es: 'Empezar ahora' }), { fill: GOLD, color: INK, uppercase: true, fontSizeRel: 0.036 }, { animation: 'pop' }),
  },
  {
    id: 'cta-outline',
    name: tx({ de: 'CTA — Outline', en: 'CTA — Outline', es: 'CTA — Contorno' }),
    category: 'CTA',
    description: tx({ de: 'Dezenter Rahmen-Button', en: 'Subtle border button', es: 'Botón de borde sutil' }),
    kind: 'cta',
    build: () =>
      base(
        'cta',
        tx({ de: 'Mehr erfahren', en: 'Learn more', es: 'Saber más' }),
        { fill: 'transparent', color: '#FFFFFF', borderWidth: 0.002, borderColor: '#FFFFFF', fontSizeRel: 0.034 },
        { animation: 'fadeIn' },
      ),
  },

  // ---- Ticker ----
  {
    id: 'ticker-news',
    name: tx({ de: 'Ticker', en: 'Ticker', es: 'Teletipo' }),
    category: 'Ticker',
    description: tx({ de: 'Durchlaufendes Band unten', en: 'Scrolling band at the bottom', es: 'Banda de desplazamiento en la parte inferior' }),
    kind: 'ticker',
    build: () =>
      base(
        'ticker',
        tx({ de: 'Neue Funktionen  •  Jetzt verfügbar  •  Ein Creator. Ein ganzes Studio.', en: 'New Features • Now Available • One Creator. One Whole Studio.', es: 'Nuevas Funciones • Ya Disponible • Un Creador. Un Estudio Completo.' }),
        { fill: 'rgba(10,10,15,0.88)', fontSizeRel: 0.026, fontWeight: 600, align: 'left', radius: 0 },
        { animation: 'tickerLoop', enter: 'tickerLoop' },
      ),
  },

  // ---- Marke ----
  {
    id: 'logo-bug',
    name: tx({ de: 'Logo-Bug', en: 'Logo Bug', es: 'Logo Bug' }),
    category: 'Marke',
    description: tx({ de: 'Logo oben rechts, dauerhaft', en: 'Logo top right, permanent', es: 'Logotipo arriba a la derecha, permanente' }),
    kind: 'logo',
    build: () => base('logo', '@deinbrand', { fontSizeRel: 0.024, fontWeight: 600 }, { animation: 'fadeIn', slots: { imageUrl: null } }),
  },
  {
    id: 'watermark',
    name: tx({ de: 'Wasserzeichen', en: 'Watermark', es: 'Marca de agua' }),
    category: 'Marke',
    description: tx({ de: 'Dezentes Handle unten rechts', en: 'Subtle handle bottom right', es: 'Mango sutil abajo a la derecha' }),
    kind: 'logo',
    build: () =>
      base(
        'logo',
        '@deinbrand',
        { fontSizeRel: 0.022, fontWeight: 500, opacity: 0.7 },
        { animation: 'fadeIn', box: { x: 0.76, y: 0.88, w: 0.2, h: 0.06 } },
      ),
  },

  // ---- Callout ----
  {
    id: 'callout-arrow',
    name: tx({ de: 'Callout', en: 'Callout', es: 'Llamada' }),
    category: 'Callout',
    description: tx({ de: 'Linie plus Label, markiert Details', en: 'Line plus label, marks details', es: 'Línea más etiqueta, detalles de marcas.' }),
    kind: 'callout',
    build: () => base('callout', tx({ de: 'Hier ansetzen', en: 'Start here', es: 'Empezar aquí' }), { fill: 'rgba(10,10,15,0.85)', fontSizeRel: 0.03, align: 'left' }, { animation: 'wipe' }),
  },

  // ---- Zitat ----
  {
    id: 'quote-classic',
    name: tx({ de: 'Zitat', en: 'Quote', es: 'Cita' }),
    category: 'Zitat',
    description: tx({ de: 'Aussage mit Quellenzeile', en: 'Statement with source line', es: 'Declaración con línea fuente' }),
    kind: 'quote',
    build: () =>
      base(
        'quote',
        tx({ de: 'Das spart uns jede Woche einen ganzen Drehtag.', en: 'This saves us a whole day of shooting every week.', es: 'Esto nos ahorra un día entero de rodaje cada semana.' }),
        { fontSizeRel: 0.05, fontWeight: 600, align: 'center' },
        { animation: 'stagger', slots: { subtitle: tx({ de: 'Lena, Agenturinhaberin', en: 'Lena, Agency Owner', es: 'Lena, Propietaria de Agencia' }) } },
      ),
  },

  // ---- Info ----
  {
    id: 'progress-bar',
    name: tx({ de: 'Fortschritt', en: 'Progress', es: 'Progreso' }),
    category: 'Info',
    description: tx({ de: 'Mitlaufender Balken am unteren Rand', en: 'Scrolling bar at the bottom', es: 'Barra de desplazamiento en el borde inferior' }),
    kind: 'progress',
    build: () => base('progress', '', { fill: 'rgba(255,255,255,0.18)', radius: 0 }, { animation: 'none', enter: 'none' }),
  },

  // ---- Text ----
  {
    id: 'text-headline',
    name: tx({ de: 'Headline', en: 'Headline', es: 'Encabezado' }),
    category: 'Text',
    description: tx({ de: 'Große freie Aussage', en: 'Big free statement', es: 'Gran declaración libre' }),
    kind: 'text',
    build: () => base('text', tx({ de: 'Deine Aussage', en: 'Your statement', es: 'Tu declaración' }), { fontSizeRel: 0.07, fontWeight: 800, backgroundColor: 'transparent' }, { animation: 'stagger' }),
  },
  {
    id: 'text-kicker',
    name: tx({ de: 'Kicker', en: 'Kicker', es: 'Kicker' }),
    category: 'Text',
    description: tx({ de: 'Kleine Zeile über der Headline', en: 'Small line above the headline', es: 'Pequeña línea encima del título' }),
    kind: 'text',
    build: () =>
      base(
        'text',
        tx({ de: 'EIN CREATOR. EIN GANZES STUDIO.', en: 'ONE CREATOR. ONE WHOLE STUDIO.', es: 'UN CREADOR. UN ESTUDIO COMPLETO.' }),
        { fontSizeRel: 0.026, fontWeight: 600, uppercase: true, letterSpacing: 0.12, color: GOLD },
        { animation: 'fadeIn', box: { x: 0.1, y: 0.32, w: 0.8, h: 0.08 } },
      ),
  },
];

export const OVERLAY_CATEGORIES = Array.from(new Set(OVERLAY_PRESETS.map((p) => p.category)));

/**
 * Display labels for the semantic (German-valued) category union above.
 * The raw category values stay untouched — they are used as filter/enum values.
 */
export const OVERLAY_CATEGORY_LABELS: Record<string, { de: string; en: string; es: string }> = {
  'Lower Third': { de: 'Lower Third', en: 'Lower Third', es: 'Rótulo inferior' },
  Banner: { de: 'Banner', en: 'Banner', es: 'Banner' },
  'Störer': { de: 'Störer', en: 'Flash Badge', es: 'Distintivo' },
  Schild: { de: 'Schild', en: 'Sign', es: 'Letrero' },
  CTA: { de: 'CTA', en: 'CTA', es: 'CTA' },
  Ticker: { de: 'Ticker', en: 'Ticker', es: 'Ticker' },
  Marke: { de: 'Marke', en: 'Brand', es: 'Marca' },
  Callout: { de: 'Callout', en: 'Callout', es: 'Llamada' },
  Zitat: { de: 'Zitat', en: 'Quote', es: 'Cita' },
  Info: { de: 'Info', en: 'Info', es: 'Info' },
  Text: { de: 'Text', en: 'Text', es: 'Texto' },
};


/** Preset zu einem einsatzbereiten Overlay machen. */
export function instantiatePreset(preset: OverlayPreset, startTime: number, endTime: number | null): TextOverlay {
  return {
    id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime,
    endTime,
    ...preset.build(),
  };
}

export interface OverlayBrandKitLike {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  logo_url?: string | null;
}

/** Markenfarben und Logo auf alle Overlays anwenden. */
export function applyBrandToOverlays(overlays: TextOverlay[], kit: OverlayBrandKitLike | null | undefined): TextOverlay[] {
  if (!kit) return overlays;
  const accent = kit.primary_color || kit.accent_color || GOLD;
  const surface = kit.secondary_color || 'rgba(10,10,15,0.85)';
  return overlays.map((o) => {
    const isSolid = o.kind === 'badge' || o.kind === 'cta';
    return {
      ...o,
      slots: o.kind === 'logo' && kit.logo_url ? { ...o.slots, imageUrl: kit.logo_url } : o.slots,
      style: {
        ...o.style,
        accentColor: accent,
        fill: isSolid ? accent : o.style.fill && o.style.fill !== 'transparent' ? surface : o.style.fill,
        color: isSolid ? INK : o.style.color,
      },
    };
  });
}

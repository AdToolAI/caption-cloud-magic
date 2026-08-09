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
    name: 'Lower Third — Balken',
    category: 'Lower Third',
    description: tx({ de: 'Name und Rolle mit Akzentkante', en: 'Name and role with accent border', es: 'Nombre y rol con borde de acento' }),
    kind: 'lowerThird',
    build: () =>
      base(
        'lowerThird',
        'Max Mustermann',
        { fill: 'rgba(10,10,15,0.82)', fontSizeRel: 0.036, align: 'left' },
        { animation: 'slideRight', slots: { title: 'Max Mustermann', subtitle: 'Gründer & CEO' } },
      ),
  },
  {
    id: 'lt-line',
    name: 'Lower Third — Linie',
    category: 'Lower Third',
    description: 'Reduziert, ohne Fläche',
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
    name: 'Lower Third — Glas',
    category: 'Lower Third',
    description: 'Glasoptik mit weichem Rand',
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
    name: 'Banner unten',
    category: 'Banner',
    description: 'Vollbreiter Balken mit Aussage',
    kind: 'banner',
    build: () => base('banner', 'NUR HEUTE: 30 % RABATT', { fill: 'rgba(10,10,15,0.85)', uppercase: true, radius: 0 }, { animation: 'slideUp' }),
  },
  {
    id: 'banner-top-gold',
    name: 'Banner oben — Gold',
    category: 'Banner',
    description: 'Goldverlauf für Ankündigungen',
    kind: 'banner',
    build: () =>
      base(
        'banner',
        'NEUE KOLLEKTION',
        { gradient: [GOLD, '#C79B3F'], color: INK, uppercase: true, radius: 0 },
        { animation: 'slideDown', box: { x: 0, y: 0.04, w: 1, h: 0.11 } },
      ),
  },
  {
    id: 'banner-half',
    name: 'Banner halb',
    category: 'Banner',
    description: 'Halbbreiter Balken mit Unterzeile',
    kind: 'banner',
    build: () =>
      base(
        'banner',
        'Jetzt testen',
        { fill: 'rgba(10,10,15,0.85)' },
        { animation: 'slideRight', box: { x: 0.04, y: 0.78, w: 0.52, h: 0.13 }, slots: { subtitle: '14 Tage kostenlos' } },
      ),
  },

  // ---- Störer / Badges ----
  {
    id: 'badge-discount',
    name: 'Störer — Rabatt',
    category: 'Störer',
    description: 'Runder Preis-Störer',
    kind: 'badge',
    build: () => base('badge', '-30%', { fill: GOLD, color: INK, fontSizeRel: 0.06, uppercase: true }, { animation: 'pop' }),
  },
  {
    id: 'badge-new',
    name: 'Störer — NEU',
    category: 'Störer',
    description: 'Pill-Badge für Neuheiten',
    kind: 'badge',
    build: () =>
      base(
        'badge',
        'NEU',
        { fill: '#E5484D', color: '#FFFFFF', fontSizeRel: 0.032, uppercase: true },
        { animation: 'pop', box: { x: 0.06, y: 0.08, w: 0.14, h: 0.08 } },
      ),
  },
  {
    id: 'badge-limited',
    name: 'Störer — Limitiert',
    category: 'Störer',
    description: 'Dringlichkeit erzeugen',
    kind: 'badge',
    build: () =>
      base(
        'badge',
        'NUR 1000 PLÄTZE',
        { fill: 'rgba(10,10,15,0.85)', color: GOLD, fontSizeRel: 0.026, uppercase: true },
        { animation: 'fadeIn', box: { x: 0.62, y: 0.07, w: 0.32, h: 0.08 } },
      ),
  },

  // ---- Schilder / Karten ----
  {
    id: 'card-info',
    name: 'Schild — Info',
    category: 'Schild',
    description: tx({ de: 'Karte mit Titel und Unterzeile', en: 'Card with title and subtitle', es: 'Tarjeta con título y subtítulo' }),
    kind: 'card',
    build: () =>
      base(
        'card',
        'Öffnungszeiten',
        { fill: 'rgba(10,10,15,0.8)', align: 'left', fontSizeRel: 0.036 },
        { animation: 'slideRight', slots: { title: 'Öffnungszeiten', subtitle: 'Mo–Fr 9–18 Uhr' } },
      ),
  },
  {
    id: 'card-feature',
    name: 'Schild — Feature',
    category: 'Schild',
    description: 'Produktvorteil mit Bildplatz',
    kind: 'card',
    build: () =>
      base(
        'card',
        'In 60 Sekunden fertig',
        { fill: 'rgba(255,255,255,0.12)', borderWidth: 0.0012, borderColor: 'rgba(255,255,255,0.3)', align: 'left', fontSizeRel: 0.034 },
        { animation: 'blurIn', slots: { title: 'In 60 Sekunden fertig', subtitle: 'Vom Briefing zum Clip' } },
      ),
  },
  {
    id: 'card-price',
    name: 'Schild — Preis',
    category: 'Schild',
    description: 'Preisangabe hervorheben',
    kind: 'card',
    build: () =>
      base(
        'card',
        '14,99 € / Monat',
        { fill: 'rgba(10,10,15,0.85)', color: GOLD, align: 'left', fontSizeRel: 0.042 },
        { animation: 'pop', box: { x: 0.08, y: 0.62, w: 0.4, h: 0.18 }, slots: { title: '14,99 € / Monat', subtitle: 'jederzeit kündbar' } },
      ),
  },

  // ---- CTA ----
  {
    id: 'cta-gold',
    name: 'CTA — Gold',
    category: 'CTA',
    description: 'Button-Optik mit Pfeil',
    kind: 'cta',
    build: () => base('cta', 'Jetzt starten', { fill: GOLD, color: INK, uppercase: true, fontSizeRel: 0.036 }, { animation: 'pop' }),
  },
  {
    id: 'cta-outline',
    name: 'CTA — Outline',
    category: 'CTA',
    description: 'Dezenter Rahmen-Button',
    kind: 'cta',
    build: () =>
      base(
        'cta',
        'Mehr erfahren',
        { fill: 'transparent', color: '#FFFFFF', borderWidth: 0.002, borderColor: '#FFFFFF', fontSizeRel: 0.034 },
        { animation: 'fadeIn' },
      ),
  },

  // ---- Ticker ----
  {
    id: 'ticker-news',
    name: 'Ticker',
    category: 'Ticker',
    description: 'Durchlaufendes Band unten',
    kind: 'ticker',
    build: () =>
      base(
        'ticker',
        'Neue Funktionen  •  Jetzt verfügbar  •  Ein Creator. Ein ganzes Studio.',
        { fill: 'rgba(10,10,15,0.88)', fontSizeRel: 0.026, fontWeight: 600, align: 'left', radius: 0 },
        { animation: 'tickerLoop', enter: 'tickerLoop' },
      ),
  },

  // ---- Marke ----
  {
    id: 'logo-bug',
    name: 'Logo-Bug',
    category: 'Marke',
    description: 'Logo oben rechts, dauerhaft',
    kind: 'logo',
    build: () => base('logo', '@deinbrand', { fontSizeRel: 0.024, fontWeight: 600 }, { animation: 'fadeIn', slots: { imageUrl: null } }),
  },
  {
    id: 'watermark',
    name: 'Wasserzeichen',
    category: 'Marke',
    description: 'Dezentes Handle unten rechts',
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
    name: 'Callout',
    category: 'Callout',
    description: 'Linie plus Label, markiert Details',
    kind: 'callout',
    build: () => base('callout', 'Hier ansetzen', { fill: 'rgba(10,10,15,0.85)', fontSizeRel: 0.03, align: 'left' }, { animation: 'wipe' }),
  },

  // ---- Zitat ----
  {
    id: 'quote-classic',
    name: 'Zitat',
    category: 'Zitat',
    description: 'Aussage mit Quellenzeile',
    kind: 'quote',
    build: () =>
      base(
        'quote',
        tx({ de: 'Das spart uns jede Woche einen ganzen Drehtag.', en: 'This saves us a whole day of shooting every week.', es: 'Esto nos ahorra un día entero de rodaje cada semana.' }),
        { fontSizeRel: 0.05, fontWeight: 600, align: 'center' },
        { animation: 'stagger', slots: { subtitle: 'Lena, Agenturinhaberin' } },
      ),
  },

  // ---- Info ----
  {
    id: 'progress-bar',
    name: 'Fortschritt',
    category: 'Info',
    description: 'Mitlaufender Balken am unteren Rand',
    kind: 'progress',
    build: () => base('progress', '', { fill: 'rgba(255,255,255,0.18)', radius: 0 }, { animation: 'none', enter: 'none' }),
  },

  // ---- Text ----
  {
    id: 'text-headline',
    name: 'Headline',
    category: 'Text',
    description: 'Große freie Aussage',
    kind: 'text',
    build: () => base('text', 'Deine Aussage', { fontSizeRel: 0.07, fontWeight: 800, backgroundColor: 'transparent' }, { animation: 'stagger' }),
  },
  {
    id: 'text-kicker',
    name: 'Kicker',
    category: 'Text',
    description: 'Kleine Zeile über der Headline',
    kind: 'text',
    build: () =>
      base(
        'text',
        'EIN CREATOR. EIN GANZES STUDIO.',
        { fontSizeRel: 0.026, fontWeight: 600, uppercase: true, letterSpacing: 0.12, color: GOLD },
        { animation: 'fadeIn', box: { x: 0.1, y: 0.32, w: 0.8, h: 0.08 } },
      ),
  },
];

export const OVERLAY_CATEGORIES = Array.from(new Set(OVERLAY_PRESETS.map((p) => p.category)));

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

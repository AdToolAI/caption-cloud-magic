import { tx } from "@/lib/i18nText";
import type { PostDesign, PostSlide } from "./schema";
import { DEFAULT_FONTS, DEFAULT_PALETTE, uid } from "./schema";
import { INTENT_FAMILY_BIAS, type PostIntent } from "./intent";


export interface DesignTemplate {
  id: string;
  name: string;
  category: string;
  build: (ctx: { image?: string | null }) => PostDesign;
}

const P = DEFAULT_PALETTE;

function base(slides: PostSlide[], variantName: string, title: string): PostDesign {
  return {
    title,
    format: "square",
    variantName,
    palette: { ...P },
    fonts: { ...DEFAULT_FONTS },
    slides,
  };
}

function img(src: string | null | undefined, scrim = 0.4, direction: "bottom" | "top" | "full" | "left" = "bottom") {
  return {
    id: uid("l"),
    type: "image" as const,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    src: src || "",
    zoom: 1,
    scrim,
    scrimDirection: direction,
  };
}

function text(
  t: string,
  o: Partial<{
    x: number; y: number; w: number; h: number; size: number; weight: number;
    font: "display" | "body" | "mono"; color: string; align: "left" | "center" | "right";
    uppercase: boolean; letterSpacing: number; lineHeight: number; shadow: boolean;
  }> = {},
) {
  return {
    id: uid("l"),
    type: "text" as const,
    x: o.x ?? 0.08,
    y: o.y ?? 0.6,
    w: o.w ?? 0.84,
    h: o.h ?? 0.22,
    text: t,
    size: o.size ?? 0.085,
    weight: o.weight ?? 700,
    font: o.font ?? "display",
    color: o.color ?? P.text,
    align: o.align ?? "left",
    uppercase: o.uppercase ?? false,
    letterSpacing: o.letterSpacing ?? 0,
    lineHeight: o.lineHeight ?? 1.1,
    shadow: o.shadow ?? true,
  };
}

function badge(t: string, o: Partial<{ x: number; y: number; w: number; h: number; bg: string; color: string; size: number }> = {}) {
  return {
    id: uid("l"),
    type: "badge" as const,
    x: o.x ?? 0.08,
    y: o.y ?? 0.08,
    w: o.w ?? 0.34,
    h: o.h ?? 0.07,
    text: t,
    bg: o.bg ?? P.accent,
    color: o.color ?? P.accentText,
    size: o.size ?? 0.026,
    radius: 999,
    uppercase: true,
  };
}

function shape(o: Partial<{ x: number; y: number; w: number; h: number; color: string; shape: "rect" | "pill" | "circle" | "line"; radius: number; opacity: number }> = {}) {
  return {
    id: uid("l"),
    type: "shape" as const,
    x: o.x ?? 0,
    y: o.y ?? 0.55,
    w: o.w ?? 1,
    h: o.h ?? 0.45,
    shape: o.shape ?? "rect",
    color: o.color ?? P.surface,
    radius: o.radius ?? 0,
    opacity: o.opacity ?? 1,
  };
}

function logo(o: Partial<{ x: number; y: number; w: number; h: number }> = {}) {
  return {
    id: uid("l"),
    type: "logo" as const,
    x: o.x ?? 0.08,
    y: o.y ?? 0.86,
    w: o.w ?? 0.18,
    h: o.h ?? 0.06,
    src: null,
    fallbackText: "MARKE",
    color: P.text,
  };
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "bold-statement",
    name: "Bold Statement",
    category: "Aussage",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.55, "bottom"),
            badge("Neu"),
            text("Deine stärkste\nAussage hier.", { y: 0.56, size: 0.105, weight: 800 }),
            text("Kurze Erklärung in einem Satz.", { y: 0.79, size: 0.032, weight: 400, font: "body", h: 0.08 }),
            logo(),
          ],
        }],
        "Bold Statement", "Bold Statement",
      ),
  },
  {
    id: "editorial",
    name: "Editorial",
    category: "Magazin",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.25, "full"),
            shape({ x: 0.06, y: 0.06, w: 0.88, h: 0.88, color: "transparent" }),
            text("EDITORIAL", { y: 0.1, size: 0.024, weight: 600, font: "mono", uppercase: true, letterSpacing: 0.28, align: "center", x: 0.1, w: 0.8, h: 0.05 }),
            text("Die Geschichte\nhinter der Marke", { y: 0.42, size: 0.09, weight: 500, align: "center", x: 0.1, w: 0.8 }),
            text("Mehr erfahren", { y: 0.86, size: 0.028, weight: 500, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
          ],
        }],
        "Editorial", "Editorial",
      ),
  },
  {
    id: "split",
    name: "Split Layout",
    category: "Produkt",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            { ...img(image, 0, "bottom"), y: 0, h: 0.52 },
            shape({ y: 0.52, h: 0.48, color: P.surface }),
            badge("Angebot", { y: 0.57 }),
            text("Produktname", { y: 0.66, size: 0.075, weight: 700 }),
            text(tx({ de: "Der Nutzen in einem klaren Satz — ohne Floskeln.", en: "The benefit in a clear sentence — no platitudes.", es: "El beneficio en una frase clara, sin rodeos." }), { y: 0.77, size: 0.03, weight: 400, font: "body", h: 0.1, lineHeight: 1.35 }),
            logo({ y: 0.9 }),
          ],
        }],
        "Split Layout", "Split Layout",
      ),
  },
  {
    id: "minimal-overlay",
    name: "Minimal Overlay",
    category: "Minimal",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.3, "bottom"),
            text("Weniger sagen.\nMehr wirken.", { y: 0.68, size: 0.078, weight: 600, x: 0.08, w: 0.7 }),
            shape({ x: 0.08, y: 0.63, w: 0.12, h: 0.006, color: P.accent, shape: "line" }),
            logo({ y: 0.88 }),
          ],
        }],
        "Minimal Overlay", "Minimal Overlay",
      ),
  },
  {
    id: "quote",
    name: "Zitat",
    category: "Zitat",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.62, "full"),
            text("\u201C", { y: 0.16, size: 0.2, weight: 700, align: "center", x: 0.1, w: 0.8, h: 0.16, color: P.accent }),
            text("Ein Satz, den man sich merkt.", { y: 0.36, size: 0.07, weight: 500, align: "center", x: 0.12, w: 0.76, h: 0.3 }),
            text("— Name, Rolle", { y: 0.74, size: 0.028, weight: 500, font: "body", align: "center", x: 0.12, w: 0.76, h: 0.05, color: P.accent }),
          ],
        }],
        "Zitat", "Zitat",
      ),
  },
  {
    id: "offer",
    name: "Angebot",
    category: "Angebot",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.5, "bottom"),
            badge(tx({ de: "Nur diese Woche", en: "Only this week", es: "Solo esta semana" })),
            text("-20%", { y: 0.42, size: 0.19, weight: 800, x: 0.08, w: 0.84, h: 0.22, color: P.accent }),
            text("auf alle Pakete", { y: 0.66, size: 0.05, weight: 600 , h: 0.09 }),
            { ...badge("Jetzt sichern", { y: 0.82, w: 0.46, size: 0.032 }), h: 0.09 },
          ],
        }],
        "Angebot", "Angebot",
      ),
  },
  {
    id: "tips",
    name: "Tipp-Liste",
    category: "Wissen",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.72, "full"),
            badge("3 Tipps"),
            text("So gelingt es dir", { y: 0.2, size: 0.07, weight: 700, h: 0.1 }),
            text("01  Klar starten\n02  Konsequent bleiben\n03  Ergebnis zeigen", { y: 0.4, size: 0.042, weight: 500, font: "body", h: 0.32, lineHeight: 1.9 }),
            logo({ y: 0.88 }),
          ],
        }],
        "Tipp-Liste", "Tipp-Liste",
      ),
  },
  {
    id: "before-after",
    name: "Vorher / Nachher",
    category: "Beweis",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            { ...img(image, 0.2, "bottom"), w: 0.5 },
            shape({ x: 0.5, y: 0, w: 0.5, h: 1, color: P.surface }),
            text("VORHER", { x: 0.06, y: 0.06, w: 0.38, h: 0.05, size: 0.026, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.2 }),
            text("NACHHER", { x: 0.56, y: 0.06, w: 0.38, h: 0.05, size: 0.026, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.2, color: P.accent }),
            text("Der Unterschied,\nden man sieht.", { x: 0.56, y: 0.42, w: 0.38, h: 0.24, size: 0.055, weight: 700 }),
          ],
        }],
        "Vorher / Nachher", "Vorher / Nachher",
      ),
  },
  {
    id: "launch",
    name: "Produkt-Launch",
    category: "Launch",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.45, "bottom"),
            text("JETZT LIVE", { y: 0.1, size: 0.028, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.34, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text("Das neue Kapitel", { y: 0.6, size: 0.088, weight: 700, align: "center", x: 0.08, w: 0.84 }),
            text(tx({ de: "Ab heute verfügbar", en: "Available from today", es: "Disponible desde hoy" }), { y: 0.76, size: 0.032, weight: 400, font: "body", align: "center", x: 0.08, w: 0.84, h: 0.06 }),
            logo({ x: 0.41, y: 0.88, w: 0.18 }),
          ],
        }],
        "Produkt-Launch", "Produkt-Launch",
      ),
  },
  {
    id: "testimonial",
    name: "Testimonial",
    category: "Beweis",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.55, "bottom"),
            shape({ x: 0.08, y: 0.5, w: 0.84, h: 0.4, color: P.surface, radius: 32, opacity: 0.92 }),
            text("„Endlich sieht unser Content aus wie von einer Agentur.\"", { x: 0.13, y: 0.56, w: 0.74, h: 0.2, size: 0.042, weight: 500, font: "body", lineHeight: 1.35 }),
            text("Sarah K. · Gründerin", { x: 0.13, y: 0.79, w: 0.74, h: 0.05, size: 0.026, weight: 600, font: "body", color: P.accent }),
          ],
        }],
        "Testimonial", "Testimonial",
      ),
  },
  {
    id: "event",
    name: "Event",
    category: "Event",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.6, "full"),
            text("12.09.", { y: 0.24, size: 0.13, weight: 800, align: "center", x: 0.1, w: 0.8, h: 0.16, color: P.accent }),
            text("Live Session", { y: 0.44, size: 0.07, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.1 }),
            text("20:00 Uhr · Online · kostenlos", { y: 0.58, size: 0.03, weight: 400, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05 }),
            { ...badge("Platz sichern", { y: 0.76, x: 0.3, w: 0.4, size: 0.03 }), h: 0.08 },
          ],
        }],
        "Event", "Event",
      ),
  },
  {
    id: "stat",
    name: "Zahl im Fokus",
    category: "Wissen",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.75, "full"),
            text("87%", { y: 0.3, size: 0.22, weight: 800, align: "center", x: 0.06, w: 0.88, h: 0.26, color: P.accent }),
            text("der Creator posten zu selten,\nweil Produktion zu lange dauert.", { y: 0.6, size: 0.038, weight: 400, font: "body", align: "center", x: 0.12, w: 0.76, h: 0.16, lineHeight: 1.4 }),
            logo({ x: 0.41, y: 0.87, w: 0.18 }),
          ],
        }],
        "Zahl im Fokus", "Zahl im Fokus",
      ),
  },
  {
    id: "framed",
    name: "Rahmen",
    category: "Minimal",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0, "bottom"), x: 0.07, y: 0.07, w: 0.86, h: 0.68, radius: 24 },
            text("Ein Bild. Ein Satz.", { y: 0.79, size: 0.055, weight: 600, align: "center", x: 0.08, w: 0.84, h: 0.09, shadow: false }),
            text("Mehr braucht es nicht.", { y: 0.885, size: 0.026, weight: 400, font: "body", align: "center", x: 0.08, w: 0.84, h: 0.05, shadow: false, color: P.accent }),
          ],
        }],
        "Rahmen", "Rahmen",
      ),
  },
  {
    id: "question",
    name: "Frage",
    category: "Engagement",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.68, "full"),
            text("Frage an dich:", { y: 0.3, size: 0.032, weight: 500, font: "mono", uppercase: true, letterSpacing: 0.2, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text("Wie viele Stunden kostet\ndich ein Post gerade?", { y: 0.4, size: 0.062, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.22 }),
            text("Antwort in die Kommentare \u2193", { y: 0.72, size: 0.028, weight: 400, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05 }),
          ],
        }],
        "Frage", "Frage",
      ),
  },
  {
    id: "checklist",
    name: "Checkliste",
    category: "Wissen",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.78, "full"),
            text("Checkliste", { y: 0.12, size: 0.055, weight: 700, h: 0.08 }),
            text("\u2713  Briefing steht\n\u2713  Bild gewählt\n\u2713  Text sitzt\n\u2713  Post geplant", { y: 0.3, size: 0.04, weight: 500, font: "body", h: 0.4, lineHeight: 2 }),
            logo({ y: 0.87 }),
          ],
        }],
        "Checkliste", "Checkliste",
      ),
  },
  {
    id: "duotone",
    name: "Duoton",
    category: "Aussage",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.4, "full"),
            shape({ x: 0, y: 0, w: 1, h: 1, color: P.accent, opacity: 0.14 }),
            text("Marke\nmit Haltung", { y: 0.36, size: 0.1, weight: 800, x: 0.08, w: 0.84, h: 0.28 }),
            { ...badge("Mehr erfahren", { y: 0.74, w: 0.44, size: 0.03 }), h: 0.08 },
          ],
        }],
        "Duoton", "Duoton",
      ),
  },
  {
    id: "steps",
    name: "3 Schritte",
    category: "Wissen",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0.1, "bottom"), y: 0, h: 0.4 },
            text("In 3 Schritten zum Post", { y: 0.46, size: 0.05, weight: 700, h: 0.08 }),
            text("1  Briefing eingeben", { y: 0.58, size: 0.034, weight: 500, font: "body", h: 0.06 }),
            text("2  Design wählen", { y: 0.66, size: 0.034, weight: 500, font: "body", h: 0.06 }),
            text("3  Exportieren", { y: 0.74, size: 0.034, weight: 500, font: "body", h: 0.06 }),
            logo({ y: 0.87 }),
          ],
        }],
        "3 Schritte", "3 Schritte",
      ),
  },
  {
    id: "cover-carousel",
    name: "Karussell-Cover",
    category: "Karussell",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.6, "full"),
            badge("Swipe \u2192", { x: 0.62, y: 0.85, w: 0.3 }),
            text("5 Fehler,\ndie dich Reichweite kosten", { y: 0.35, size: 0.072, weight: 700, x: 0.08, w: 0.84, h: 0.3 }),
            logo({ y: 0.86 }),
          ],
        }],
        "Karussell-Cover", "Karussell-Cover",
      ),
  },
  {
    id: "poster",
    name: "Poster",
    category: "Aussage",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.35, "top"),
            text("STUDIO", { y: 0.06, size: 0.036, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.5, align: "center", x: 0.1, w: 0.8, h: 0.06 }),
            shape({ x: 0.08, y: 0.72, w: 0.84, h: 0.004, color: P.accent, shape: "line" }),
            text("Ein Creator.\nEin ganzes Studio.", { y: 0.76, size: 0.062, weight: 600, x: 0.08, w: 0.84, h: 0.18 }),
          ],
        }],
        "Poster", "Poster",
      ),
  },
  {
    id: "spotlight",
    name: "Spotlight",
    category: "Produkt",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            shape({ x: 0, y: 0, w: 1, h: 1, color: P.background }),
            { ...img(image, 0, "bottom"), x: 0.16, y: 0.12, w: 0.68, h: 0.52, radius: 999 },
            text("Im Fokus", { y: 0.7, size: 0.03, weight: 600, font: "mono", uppercase: true, letterSpacing: 0.3, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text("Dein Produkt, perfekt inszeniert", { y: 0.77, size: 0.05, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.14 }),
          ],
        }],
        "Spotlight", "Spotlight",
      ),
  },
  {
    id: "announcement",
    name: "Ankündigung",
    category: "Launch",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.5, "bottom"),
            badge("Ankündigung", { x: 0.28, y: 0.4, w: 0.44 }),
            text("Wir haben\netwas gebaut.", { y: 0.5, size: 0.085, weight: 700, align: "center", x: 0.1, w: 0.8, h: 0.24 }),
            text("adtool.ai", { y: 0.88, size: 0.028, weight: 500, font: "mono", align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
          ],
        }],
        "Ankündigung", "Ankündigung",
      ),
  },
  {
    id: "grid-type",
    name: "Typo-Raster",
    category: "Minimal",
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0.15, "bottom"), x: 0.5, y: 0, w: 0.5, h: 1 },
            text("01", { x: 0.07, y: 0.1, w: 0.3, h: 0.08, size: 0.05, weight: 700, font: "mono", color: P.accent }),
            text("Klarheit\nschlägt\nLautstärke", { x: 0.07, y: 0.34, w: 0.38, h: 0.34, size: 0.058, weight: 600, shadow: false }),
            text("adtool.ai", { x: 0.07, y: 0.86, w: 0.3, h: 0.05, size: 0.024, weight: 500, font: "mono", shadow: false }),
          ],
        }],
        "Typo-Raster", "Typo-Raster",
      ),
  },
];

export const TEMPLATE_CATEGORIES = Array.from(new Set(DESIGN_TEMPLATES.map((t) => t.category)));

/** Design-Familien für die Varianten-Auswahl. */
const FAMILY_ORDER: Record<string, string[]> = {
  bold: ["bold-statement", "poster", "announcement", "launch"],
  editorial: ["editorial", "quote", "testimonial", "grid-type"],
  split: ["split", "before-after", "duotone", "framed"],
  minimal: ["minimal-overlay", "spotlight", "stat", "question"],
  utility: ["offer", "tips", "checklist", "steps", "event", "cover-carousel"],
};

const PLATFORM_BIAS: Record<string, string[]> = {
  instagram: ["bold", "minimal", "split", "editorial", "utility"],
  linkedin: ["editorial", "utility", "minimal", "bold", "split"],
  facebook: ["utility", "bold", "split", "editorial", "minimal"],
  tiktok: ["bold", "split", "minimal", "utility", "editorial"],
};

function byId(id: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.id === id);
}

/**
 * Wählt `count` Vorlagen, gemischt über die Design-Familien und gewichtet
 * nach Intent, Plattform und Textlänge. `offset` blättert weiter
 * ("Mehr Richtungen"), `seed` sorgt für briefing-abhängige Vielfalt.
 */
export function pickVariants(
  platform: string,
  tone: string,
  count = 8,
  offset = 0,
  options: { intent?: PostIntent; seed?: number; headlineLength?: number } = {},
): DesignTemplate[] {
  const platformFamilies = PLATFORM_BIAS[platform] ?? PLATFORM_BIAS.instagram;
  const intentFamilies = options.intent ? INTENT_FAMILY_BIAS[options.intent] : [];

  // Intent führt, Plattform ergänzt.
  const ordered: string[] = [];
  for (const f of [...intentFamilies, ...platformFamilies]) {
    if (!ordered.includes(f)) ordered.push(f);
  }

  const quiet = /ruhig|minimal|elegant|serios|seriös/i.test(tone);
  if (quiet) ordered.sort((a, b) => (a === "minimal" ? -1 : b === "minimal" ? 1 : 0));

  // Lange Headlines vertragen keine engen Poster-Layouts.
  const longHeadline = (options.headlineLength ?? 0) > 42;
  if (longHeadline) ordered.sort((a, b) => (a === "editorial" ? -1 : b === "editorial" ? 1 : 0));

  const seed = options.seed ?? 0;
  const picked: DesignTemplate[] = [];
  let round = 0;
  while (picked.length < count + offset && round < 8) {
    for (let i = 0; i < ordered.length; i += 1) {
      const family = ordered[(i + (seed % ordered.length)) % ordered.length];
      const ids = FAMILY_ORDER[family] ?? [];
      const id = ids[(round + seed) % Math.max(1, ids.length)];
      const tpl = id ? byId(id) : undefined;
      if (tpl && !picked.includes(tpl)) picked.push(tpl);
      if (picked.length >= count + offset) break;
    }
    round += 1;
  }
  const rest = DESIGN_TEMPLATES.filter((t) => !picked.includes(t));
  return [...picked, ...rest].slice(offset, offset + count);
}


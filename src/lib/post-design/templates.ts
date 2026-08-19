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
    category: tx({ de: "Aussage", en: "Statement", es: "Declaración" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.55, "bottom"),
            badge(tx({ de: "Neu", en: "New", es: "Nuevo" })),
            text(tx({ de: "Deine stärkste\nAussage hier.", en: "Your strongest\nstatement here.", es: "Tu mensaje más\npotente aquí." }), { y: 0.56, size: 0.105, weight: 800 }),
            text(tx({ de: "Kurze Erklärung in einem Satz.", en: "A short explanation in one sentence.", es: "Una explicación breve en una frase." }), { y: 0.79, size: 0.032, weight: 400, font: "body", h: 0.08 }),
            logo(),
          ],
        }],
        "Bold Statement", "Bold Statement",
      ),
  },
  {
    id: "editorial",
    name: "Editorial",
    category: tx({ de: "Magazin", en: "Magazine", es: "Revista" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.25, "full"),
            shape({ x: 0.06, y: 0.06, w: 0.88, h: 0.88, color: "transparent" }),
            text("EDITORIAL", { y: 0.1, size: 0.024, weight: 600, font: "mono", uppercase: true, letterSpacing: 0.28, align: "center", x: 0.1, w: 0.8, h: 0.05 }),
            text(tx({ de: "Die Geschichte\nhinter der Marke", en: "The story\nbehind the brand", es: "La historia\ndetrás de la marca" }), { y: 0.42, size: 0.09, weight: 500, align: "center", x: 0.1, w: 0.8 }),
            text(tx({ de: "Mehr erfahren", en: "Learn more", es: "Más información" }), { y: 0.86, size: 0.028, weight: 500, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
          ],
        }],
        "Editorial", "Editorial",
      ),
  },
  {
    id: "split",
    name: "Split Layout",
    category: tx({ de: "Produkt", en: "Product", es: "Producto" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            { ...img(image, 0, "bottom"), y: 0, h: 0.52 },
            shape({ y: 0.52, h: 0.48, color: P.surface }),
            badge(tx({ de: "Angebot", en: "Offer", es: "Oferta" }), { y: 0.57 }),
            text(tx({ de: "Produktname", en: "Product name", es: "Nombre del producto" }), { y: 0.66, size: 0.075, weight: 700 }),
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
    category: tx({ de: "Minimal", en: "Minimal", es: "Mínimo" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.3, "bottom"),
            text(tx({ de: "Weniger sagen.\nMehr wirken.", en: "Say less.\nLand harder.", es: "Di menos.\nImpacta más." }), { y: 0.68, size: 0.078, weight: 600, x: 0.08, w: 0.7 }),
            shape({ x: 0.08, y: 0.63, w: 0.12, h: 0.006, color: P.accent, shape: "line" }),
            logo({ y: 0.88 }),
          ],
        }],
        "Minimal Overlay", "Minimal Overlay",
      ),
  },
  {
    id: "quote",
    name: tx({ de: "Zitat", en: "Quote", es: "Cita" }),
    category: tx({ de: "Zitat", en: "Quote", es: "Cita" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.62, "full"),
            text("\u201C", { y: 0.16, size: 0.2, weight: 700, align: "center", x: 0.1, w: 0.8, h: 0.16, color: P.accent }),
            text(tx({ de: "Ein Satz, den man sich merkt.", en: "One line people remember.", es: "Una frase que se recuerda." }), { y: 0.36, size: 0.07, weight: 500, align: "center", x: 0.12, w: 0.76, h: 0.3 }),
            text(tx({ de: "— Name, Rolle", en: "— Name, role", es: "— Nombre, rol" }), { y: 0.74, size: 0.028, weight: 500, font: "body", align: "center", x: 0.12, w: 0.76, h: 0.05, color: P.accent }),
          ],
        }],
        "Zitat", "Zitat",
      ),
  },
  {
    id: "offer",
    name: tx({ de: "Angebot", en: "Offer", es: "Oferta" }),
    category: tx({ de: "Angebot", en: "Offer", es: "Oferta" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.5, "bottom"),
            badge(tx({ de: "Nur diese Woche", en: "Only this week", es: "Solo esta semana" })),
            text("-20%", { y: 0.42, size: 0.19, weight: 800, x: 0.08, w: 0.84, h: 0.22, color: P.accent }),
            text(tx({ de: "auf alle Pakete", en: "on all packages", es: "en todos los paquetes" }), { y: 0.66, size: 0.05, weight: 600 , h: 0.09 }),
            { ...badge(tx({ de: "Jetzt sichern", en: "Get it now", es: "Consíguelo ya" }), { y: 0.82, w: 0.46, size: 0.032 }), h: 0.09 },
          ],
        }],
        "Angebot", "Angebot",
      ),
  },
  {
    id: "tips",
    name: "Tipp-Liste",
    category: tx({ de: "Wissen", en: "Knowledge", es: "Conocimiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.72, "full"),
            badge(tx({ de: "3 Tipps", en: "3 tips", es: "3 consejos" })),
            text(tx({ de: "So gelingt es dir", en: "This is how you succeed", es: "Así es como triunfas" }), { y: 0.2, size: 0.07, weight: 700, h: 0.1 }),
            text(tx({ de: "01  Klar starten\n02  Konsequent bleiben\n03  Ergebnis zeigen", en: "01  Start clearly\n02  Stay consistent\n03  Show the result", es: "01  Empieza claro\n02  Sé constante\n03  Muestra el resultado" }), { y: 0.4, size: 0.042, weight: 500, font: "body", h: 0.32, lineHeight: 1.9 }),
            logo({ y: 0.88 }),
          ],
        }],
        "Tipp-Liste", "Tipp-Liste",
      ),
  },
  {
    id: "before-after",
    name: "Vorher / Nachher",
    category: tx({ de: "Beweis", en: "Proof", es: "Prueba" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            { ...img(image, 0.2, "bottom"), w: 0.5 },
            shape({ x: 0.5, y: 0, w: 0.5, h: 1, color: P.surface }),
            text(tx({ de: "VORHER", en: "BEFORE", es: "ANTES" }), { x: 0.06, y: 0.06, w: 0.38, h: 0.05, size: 0.026, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.2 }),
            text(tx({ de: "NACHHER", en: "AFTER", es: "DESPUÉS" }), { x: 0.56, y: 0.06, w: 0.38, h: 0.05, size: 0.026, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.2, color: P.accent }),
            text(tx({ de: "Der Unterschied,\nden man sieht.", en: "The difference\nyou can see.", es: "La diferencia\nque se nota." }), { x: 0.56, y: 0.42, w: 0.38, h: 0.24, size: 0.055, weight: 700 }),
          ],
        }],
        "Vorher / Nachher", "Vorher / Nachher",
      ),
  },
  {
    id: "launch",
    name: "Produkt-Launch",
    category: tx({ de: "Launch", en: "Launch", es: "Lanzamiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.45, "bottom"),
            text(tx({ de: "JETZT LIVE", en: "LIVE NOW", es: "EN VIVO" }), { y: 0.1, size: 0.028, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.34, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text(tx({ de: "Das neue Kapitel", en: "The new chapter", es: "El nuevo capitulo" }), { y: 0.6, size: 0.088, weight: 700, align: "center", x: 0.08, w: 0.84 }),
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
    category: tx({ de: "Beweis", en: "Proof", es: "Prueba" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.55, "bottom"),
            shape({ x: 0.08, y: 0.5, w: 0.84, h: 0.4, color: P.surface, radius: 32, opacity: 0.92 }),
            text(tx({ de: "„Endlich sieht unser Content aus wie von einer Agentur.\"", en: "\u201COur content finally looks like an agency made it.\u201D", es: "\u00abPor fin nuestro contenido parece de agencia.\u00bb" }), { x: 0.13, y: 0.56, w: 0.74, h: 0.2, size: 0.042, weight: 500, font: "body", lineHeight: 1.35 }),
            text(tx({ de: "Sarah K. · Gründerin", en: "Sarah K. · Founder", es: "Sarah K. · Fundadora" }), { x: 0.13, y: 0.79, w: 0.74, h: 0.05, size: 0.026, weight: 600, font: "body", color: P.accent }),
          ],
        }],
        "Testimonial", "Testimonial",
      ),
  },
  {
    id: "event",
    name: "Event",
    category: tx({ de: "Event", en: "Event", es: "Evento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.6, "full"),
            text("12.09.", { y: 0.24, size: 0.13, weight: 800, align: "center", x: 0.1, w: 0.8, h: 0.16, color: P.accent }),
            text(tx({ de: "Live Session", en: "Live session", es: "Sesión en vivo" }), { y: 0.44, size: 0.07, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.1 }),
            text(tx({ de: "20:00 Uhr · Online · kostenlos", en: "8:00 PM · Online · free", es: "20:00 · En línea · gratis" }), { y: 0.58, size: 0.03, weight: 400, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05 }),
            { ...badge(tx({ de: "Platz sichern", en: "Save your spot", es: "Reserva tu plaza" }), { y: 0.76, x: 0.3, w: 0.4, size: 0.03 }), h: 0.08 },
          ],
        }],
        "Event", "Event",
      ),
  },
  {
    id: "stat",
    name: "Zahl im Fokus",
    category: tx({ de: "Wissen", en: "Knowledge", es: "Conocimiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.75, "full"),
            text("87%", { y: 0.3, size: 0.22, weight: 800, align: "center", x: 0.06, w: 0.88, h: 0.26, color: P.accent }),
            text(tx({ de: "der Creator posten zu selten,\nweil Produktion zu lange dauert.", en: "of creators post too rarely\nbecause production takes too long.", es: "de los creadores publica poco\nporque producir lleva demasiado." }), { y: 0.6, size: 0.038, weight: 400, font: "body", align: "center", x: 0.12, w: 0.76, h: 0.16, lineHeight: 1.4 }),
            logo({ x: 0.41, y: 0.87, w: 0.18 }),
          ],
        }],
        "Zahl im Fokus", "Zahl im Fokus",
      ),
  },
  {
    id: "framed",
    name: "Rahmen",
    category: tx({ de: "Minimal", en: "Minimal", es: "Mínimo" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0, "bottom"), x: 0.07, y: 0.07, w: 0.86, h: 0.68, radius: 24 },
            text(tx({ de: "Ein Bild. Ein Satz.", en: "A picture. Mission.", es: "Una foto. Misión." }), { y: 0.79, size: 0.055, weight: 600, align: "center", x: 0.08, w: 0.84, h: 0.09, shadow: false }),
            text(tx({ de: "Mehr braucht es nicht.", en: "Nothing more is needed.", es: "No se necesita nada más." }), { y: 0.885, size: 0.026, weight: 400, font: "body", align: "center", x: 0.08, w: 0.84, h: 0.05, shadow: false, color: P.accent }),
          ],
        }],
        "Rahmen", "Rahmen",
      ),
  },
  {
    id: "question",
    name: "Frage",
    category: tx({ de: "Engagement", en: "Engagement", es: "Compromiso" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.68, "full"),
            text(tx({ de: "Frage an dich:", en: "Question for you:", es: "Pregunta para ti:" }), { y: 0.3, size: 0.032, weight: 500, font: "mono", uppercase: true, letterSpacing: 0.2, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text(tx({ de: "Wie viele Stunden kostet\ndich ein Post gerade?", en: "How many hours does\none post cost you today?", es: "¿Cuántas horas te cuesta\nhoy una publicación?" }), { y: 0.4, size: 0.062, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.22 }),
            text(tx({ de: "Antwort in die Kommentare \u2193", en: "Answer in the comments \u2193", es: "Responde en los comentarios \u2193" }), { y: 0.72, size: 0.028, weight: 400, font: "body", align: "center", x: 0.1, w: 0.8, h: 0.05 }),
          ],
        }],
        "Frage", "Frage",
      ),
  },
  {
    id: "checklist",
    name: "Checkliste",
    category: tx({ de: "Wissen", en: "Knowledge", es: "Conocimiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.78, "full"),
            text(tx({ de: "Checkliste", en: "Checklist", es: "Lista de control" }), { y: 0.12, size: 0.055, weight: 700, h: 0.08 }),
            text(tx({ de: "\u2713  Briefing steht\n\u2713  Bild gewählt\n\u2713  Text sitzt\n\u2713  Post geplant", en: "\u2713  Briefing ready\n\u2713  Image picked\n\u2713  Copy nailed\n\u2713  Post scheduled", es: "\u2713  Briefing listo\n\u2713  Imagen elegida\n\u2713  Texto pulido\n\u2713  Publicación programada" }), { y: 0.3, size: 0.04, weight: 500, font: "body", h: 0.4, lineHeight: 2 }),
            logo({ y: 0.87 }),
          ],
        }],
        "Checkliste", "Checkliste",
      ),
  },
  {
    id: "duotone",
    name: "Duoton",
    category: tx({ de: "Aussage", en: "Statement", es: "Declaración" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.4, "full"),
            shape({ x: 0, y: 0, w: 1, h: 1, color: P.accent, opacity: 0.14 }),
            text(tx({ de: "Marke\nmit Haltung", en: "A brand\nwith attitude", es: "Una marca\ncon actitud" }), { y: 0.36, size: 0.1, weight: 800, x: 0.08, w: 0.84, h: 0.28 }),
            { ...badge(tx({ de: "Mehr erfahren", en: "Learn more", es: "Más información" }), { y: 0.74, w: 0.44, size: 0.03 }), h: 0.08 },
          ],
        }],
        "Duoton", "Duoton",
      ),
  },
  {
    id: "steps",
    name: "3 Schritte",
    category: tx({ de: "Wissen", en: "Knowledge", es: "Conocimiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0.1, "bottom"), y: 0, h: 0.4 },
            text(tx({ de: "In 3 Schritten zum Post", en: "Get your post in 3 steps", es: "Obtén tu publicación en 3 pasos" }), { y: 0.46, size: 0.05, weight: 700, h: 0.08 }),
            text(tx({ de: "1  Briefing eingeben", en: "1  Enter briefing", es: "1  Introduce el briefing" }), { y: 0.58, size: 0.034, weight: 500, font: "body", h: 0.06 }),
            text(tx({ de: "2  Design wählen", en: "2  Pick a design", es: "2  Elige un diseño" }), { y: 0.66, size: 0.034, weight: 500, font: "body", h: 0.06 }),
            text(tx({ de: "3  Exportieren", en: "3  Export", es: "3  Exporta" }), { y: 0.74, size: 0.034, weight: 500, font: "body", h: 0.06 }),
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
            text(tx({ de: "5 Fehler,\ndie dich Reichweite kosten", en: "5 mistakes\nthat cost you reach", es: "5 errores\nque te cuestan alcance" }), { y: 0.35, size: 0.072, weight: 700, x: 0.08, w: 0.84, h: 0.3 }),
            logo({ y: 0.86 }),
          ],
        }],
        "Karussell-Cover", "Karussell-Cover",
      ),
  },
  {
    id: "poster",
    name: "Poster",
    category: tx({ de: "Aussage", en: "Statement", es: "Declaración" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.35, "top"),
            text("STUDIO", { y: 0.06, size: 0.036, weight: 700, font: "mono", uppercase: true, letterSpacing: 0.5, align: "center", x: 0.1, w: 0.8, h: 0.06 }),
            shape({ x: 0.08, y: 0.72, w: 0.84, h: 0.004, color: P.accent, shape: "line" }),
            text(tx({ de: "Ein Creator.\nEin ganzes Studio.", en: "One creator.\nA whole studio.", es: "Un creador.\nUn estudio entero." }), { y: 0.76, size: 0.062, weight: 600, x: 0.08, w: 0.84, h: 0.18 }),
          ],
        }],
        "Poster", "Poster",
      ),
  },
  {
    id: "spotlight",
    name: "Spotlight",
    category: tx({ de: "Produkt", en: "Product", es: "Producto" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            shape({ x: 0, y: 0, w: 1, h: 1, color: P.background }),
            { ...img(image, 0, "bottom"), x: 0.16, y: 0.12, w: 0.68, h: 0.52, radius: 999 },
            text(tx({ de: "Im Fokus", en: "In focus", es: "En foco" }), { y: 0.7, size: 0.03, weight: 600, font: "mono", uppercase: true, letterSpacing: 0.3, align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
            text(tx({ de: "Dein Produkt, perfekt inszeniert", en: "Your product, perfectly staged", es: "Tu producto, perfectamente presentado" }), { y: 0.77, size: 0.05, weight: 600, align: "center", x: 0.1, w: 0.8, h: 0.14 }),
          ],
        }],
        "Spotlight", "Spotlight",
      ),
  },
  {
    id: "announcement",
    name: tx({ de: "Ankündigung", en: "Announcement", es: "Anuncio" }),
    category: tx({ de: "Launch", en: "Launch", es: "Lanzamiento" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.background,
          layers: [
            img(image, 0.5, "bottom"),
            badge(tx({ de: "Ankündigung", en: "Announcement", es: "Anuncio" }), { x: 0.28, y: 0.4, w: 0.44 }),
            text(tx({ de: "Wir haben\netwas gebaut.", en: "We built\nsomething.", es: "Hemos creado\nalgo." }), { y: 0.5, size: 0.085, weight: 700, align: "center", x: 0.1, w: 0.8, h: 0.24 }),
            text("adtool.ai", { y: 0.88, size: 0.028, weight: 500, font: "mono", align: "center", x: 0.1, w: 0.8, h: 0.05, color: P.accent }),
          ],
        }],
        tx({ de: "Ankündigung", en: "Announcement", es: "Anuncio" }), "Ankündigung",
      ),
  },
  {
    id: "grid-type",
    name: "Typo-Raster",
    category: tx({ de: "Minimal", en: "Minimal", es: "Mínimo" }),
    build: ({ image }) =>
      base(
        [{
          id: uid("s"), background: P.surface,
          layers: [
            { ...img(image, 0.15, "bottom"), x: 0.5, y: 0, w: 0.5, h: 1 },
            text("01", { x: 0.07, y: 0.1, w: 0.3, h: 0.08, size: 0.05, weight: 700, font: "mono", color: P.accent }),
            text(tx({ de: "Klarheit\nschlägt\nLautstärke", en: "Clarity\nbeats\nvolume", es: "La claridad\nsupera\nal ruido" }), { x: 0.07, y: 0.34, w: 0.38, h: 0.34, size: 0.058, weight: 600, shadow: false }),
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


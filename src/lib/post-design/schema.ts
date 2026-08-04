/**
 * Post Designer — zentrales Design-Schema.
 * Alle Koordinaten sind relativ (0..1) zur Canvas-Kante, damit derselbe
 * Renderer Vorschau (klein) und Export (1080px) identisch zeichnet.
 */

export const CANVAS_SIZE = 1080;

export type PostFormat = "square" | "carousel";

export type LayerType = "image" | "text" | "shape" | "logo" | "badge";

export interface BaseLayer {
  id: string;
  type: LayerType;
  /** relative Box 0..1 */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  src: string;
  /** Zoom des Bildausschnitts, 1 = passgenau */
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  /** Abdunkeln für Textlesbarkeit 0..1 */
  scrim?: number;
  scrimDirection?: "bottom" | "top" | "full" | "left";
  radius?: number;
}

export type FontRole = "display" | "body" | "mono";

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  /** Schriftgrad relativ zur Canvas-Breite (0..1) */
  size: number;
  weight: number;
  font: FontRole;
  color: string;
  align: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  shadow?: boolean;
  highlight?: string | null;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "pill" | "circle" | "line" | "gradient";
  color: string;
  color2?: string;
  radius?: number;
}

export interface LogoLayer extends BaseLayer {
  type: "logo";
  src: string | null;
  fallbackText?: string;
  color?: string;
}

export interface BadgeLayer extends BaseLayer {
  type: "badge";
  text: string;
  bg: string;
  color: string;
  size: number;
  radius?: number;
  uppercase?: boolean;
}

export type Layer = ImageLayer | TextLayer | ShapeLayer | LogoLayer | BadgeLayer;

export interface PostSlide {
  id: string;
  background: string;
  backgroundGradient?: [string, string] | null;
  layers: Layer[];
}

export interface PostDesign {
  id?: string;
  title: string;
  format: PostFormat;
  /** Name der Layout-Idee, z.B. "Bold Statement" */
  variantName?: string;
  palette: {
    background: string;
    surface: string;
    text: string;
    accent: string;
    accentText: string;
  };
  fonts: { display: string; body: string };
  slides: PostSlide[];
}

export const DEFAULT_PALETTE: PostDesign["palette"] = {
  background: "#0A0A0F",
  surface: "#15151F",
  text: "#FAFAF7",
  accent: "#F5C76A",
  accentText: "#0A0A0F",
};

export const DEFAULT_FONTS: PostDesign["fonts"] = {
  display: "'Playfair Display', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
};

export const FONT_STACKS: Record<FontRole, (fonts: PostDesign["fonts"]) => string> = {
  display: (f) => f.display,
  body: (f) => f.body,
  mono: () => "'JetBrains Mono', ui-monospace, monospace",
};

export function uid(prefix = "l"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptySlide(palette = DEFAULT_PALETTE): PostSlide {
  return { id: uid("s"), background: palette.background, layers: [] };
}

export function emptyDesign(title = "Neuer Post"): PostDesign {
  return {
    title,
    format: "square",
    palette: { ...DEFAULT_PALETTE },
    fonts: { ...DEFAULT_FONTS },
    slides: [emptySlide()],
  };
}

/** Tiefe Kopie mit frischen IDs (für Duplizieren / Vorlagen anwenden). */
export function cloneDesign(design: PostDesign): PostDesign {
  return {
    ...design,
    id: undefined,
    slides: design.slides.map((s) => ({
      ...s,
      id: uid("s"),
      layers: s.layers.map((l) => ({ ...l, id: uid("l") })),
    })),
  };
}

export function cloneSlide(slide: PostSlide): PostSlide {
  return { ...slide, id: uid("s"), layers: slide.layers.map((l) => ({ ...l, id: uid("l") })) };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Sicherheitszone für Plattform-UI (relativ). */
export const SAFE_MARGIN = 0.06;

export function isTextLike(layer: Layer): layer is TextLayer | BadgeLayer {
  return layer.type === "text" || layer.type === "badge";
}

export function layerLabel(layer: Layer): string {
  switch (layer.type) {
    case "text":
      return (layer as TextLayer).text.slice(0, 24) || "Text";
    case "badge":
      return (layer as BadgeLayer).text.slice(0, 24) || "Badge";
    case "image":
      return "Bild";
    case "logo":
      return "Logo";
    default:
      return "Form";
  }
}

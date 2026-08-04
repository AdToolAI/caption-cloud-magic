import type { PostDesign, PostSlide, Layer, TextLayer, BadgeLayer, LogoLayer, ImageLayer } from "./schema";
import { DEFAULT_FONTS, DEFAULT_PALETTE } from "./schema";

export interface BrandKitLike {
  id?: string;
  name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  logo_url?: string | null;
  heading_font?: string | null;
  body_font?: string | null;
  [key: string]: unknown;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

function fontStack(name: unknown, fallback: string): string {
  if (typeof name !== "string" || !name.trim()) return fallback;
  return `'${name.trim()}', ${fallback}`;
}

/** Farbpalette + Schriften eines Brand Kits auf ein Design anwenden. */
export function applyBrandKit(design: PostDesign, kit: BrandKitLike | null | undefined): PostDesign {
  if (!kit) return design;

  const accent = hex(kit.primary_color ?? kit.accent_color, DEFAULT_PALETTE.accent);
  const background = hex(kit.background_color, DEFAULT_PALETTE.background);
  const text = hex(kit.text_color, DEFAULT_PALETTE.text);
  const surface = hex(kit.secondary_color, DEFAULT_PALETTE.surface);

  const oldPalette = design.palette;
  const palette = { ...oldPalette, accent, background, text, surface };

  const remap = (color: string): string => {
    if (color === oldPalette.accent) return accent;
    if (color === oldPalette.text) return text;
    if (color === oldPalette.background) return background;
    if (color === oldPalette.surface) return surface;
    return color;
  };

  const slides: PostSlide[] = design.slides.map((slide) => ({
    ...slide,
    background: slide.background === oldPalette.background ? background : remap(slide.background),
    layers: slide.layers.map((layer): Layer => {
      if (layer.type === "text") {
        const t = layer as TextLayer;
        return { ...t, color: remap(t.color), highlight: t.highlight ? remap(t.highlight) : t.highlight };
      }
      if (layer.type === "badge") {
        const b = layer as BadgeLayer;
        return { ...b, bg: remap(b.bg), color: remap(b.color) };
      }
      if (layer.type === "shape") {
        return { ...layer, color: remap(layer.color), color2: layer.color2 ? remap(layer.color2) : undefined };
      }
      if (layer.type === "logo") {
        const l = layer as LogoLayer;
        return { ...l, src: kit.logo_url || l.src, fallbackText: l.fallbackText || (kit.name as string) || undefined };
      }
      return layer;
    }),
  }));

  return {
    ...design,
    palette,
    fonts: {
      display: fontStack(kit.heading_font, DEFAULT_FONTS.display),
      body: fontStack(kit.body_font, DEFAULT_FONTS.body),
    },
    slides,
  };
}

/** Erstes Bild-Layer eines Slides mit einer neuen Quelle belegen (oder anlegen). */
export function setSlideImage(slide: PostSlide, src: string): PostSlide {
  const idx = slide.layers.findIndex((l) => l.type === "image");
  if (idx === -1) {
    const layer: ImageLayer = {
      id: `l_${Math.random().toString(36).slice(2, 9)}`,
      type: "image",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      src,
      zoom: 1,
      scrim: 0.35,
      scrimDirection: "bottom",
    };
    return { ...slide, layers: [layer, ...slide.layers] };
  }
  const layers = [...slide.layers];
  layers[idx] = { ...(layers[idx] as ImageLayer), src };
  return { ...slide, layers };
}

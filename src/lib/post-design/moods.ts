/**
 * Farbwelten für den Post Designer.
 * Ein Umschalter über der Varianten-Galerie wechselt alle Varianten gleichzeitig.
 */
import type { PostDesign } from "./schema";
import { DEFAULT_PALETTE } from "./schema";

export type MoodId = "brand" | "dark-gold" | "light" | "contrast";

export interface Mood {
  id: MoodId;
  label: string;
  swatch: string[];
  palette: PostDesign["palette"] | null;
}

export const MOODS: Mood[] = [
  { id: "brand", label: "Brand Kit", swatch: ["#F5C76A", "#0A0A0F", "#FAFAF7"], palette: null },
  {
    id: "dark-gold",
    label: "Dunkel-Gold",
    swatch: ["#0A0A0F", "#15151F", "#F5C76A"],
    palette: { ...DEFAULT_PALETTE },
  },
  {
    id: "light",
    label: "Hell",
    swatch: ["#FAF7F2", "#EDE7DD", "#B4884A"],
    palette: {
      background: "#FAF7F2",
      surface: "#EDE7DD",
      text: "#141414",
      accent: "#B4884A",
      accentText: "#FFFFFF",
    },
  },
  {
    id: "contrast",
    label: "Kontrast",
    swatch: ["#000000", "#1A1A1A", "#00E0B8"],
    palette: {
      background: "#000000",
      surface: "#1A1A1A",
      text: "#FFFFFF",
      accent: "#00E0B8",
      accentText: "#000000",
    },
  },
];

/** Tauscht alle Palettenfarben eines Designs gegen die einer Farbwelt. */
export function applyMood(design: PostDesign, mood: Mood): PostDesign {
  if (!mood.palette) return design;
  const oldP = design.palette;
  const p = mood.palette;

  const remap = (color: string): string => {
    if (color === oldP.accent) return p.accent;
    if (color === oldP.accentText) return p.accentText;
    if (color === oldP.text) return p.text;
    if (color === oldP.background) return p.background;
    if (color === oldP.surface) return p.surface;
    return color;
  };

  return {
    ...design,
    palette: { ...p },
    slides: design.slides.map((slide) => ({
      ...slide,
      background: remap(slide.background),
      layers: slide.layers.map((layer) => {
        if (layer.type === "text") {
          return { ...layer, color: remap(layer.color), highlight: layer.highlight ? remap(layer.highlight) : layer.highlight };
        }
        if (layer.type === "badge") return { ...layer, bg: remap(layer.bg), color: remap(layer.color) };
        if (layer.type === "shape") {
          return { ...layer, color: remap(layer.color), color2: layer.color2 ? remap(layer.color2) : undefined };
        }
        if (layer.type === "logo") return { ...layer, color: layer.color ? remap(layer.color) : layer.color };
        return layer;
      }),
    })),
  };
}

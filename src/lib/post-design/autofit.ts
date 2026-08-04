/**
 * Auto-Fit für Text-Ebenen.
 *
 * Misst den Text im 1080er-Canvas-Raum und verkleinert die Schriftgröße so
 * lange, bis er in die Ebene passt. Die Messung ist deterministisch und
 * identisch für Vorschau, Galerie und Export (WYSIWYG).
 */
import { CANVAS_SIZE, type TextLayer } from "./schema";

let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d");
  return ctx;
}

function wrapLines(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): { lines: string[]; widest: number } {
  const lines: string[] = [];
  let widest = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (c.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        widest = Math.max(widest, c.measureText(current).width);
        current = words[i];
      }
    }
    lines.push(current);
    widest = Math.max(widest, c.measureText(current).width);
  }
  return { lines, widest };
}

const MIN_FACTOR = 0.55;

/**
 * Liefert die effektive Schriftgröße (in px, 1080er-Raum) für eine Textebene.
 * Fällt bei fehlendem Canvas auf die Originalgröße zurück.
 */
export function fitTextSize(layer: TextLayer, fontFamily: string): number {
  const target = layer.size * CANVAS_SIZE;
  const c = getCtx();
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  if (!c || !text.trim()) return target;

  const maxWidth = Math.max(1, layer.w * CANVAS_SIZE);
  const maxHeight = Math.max(1, layer.h * CANVAS_SIZE);
  const lineHeight = layer.lineHeight ?? 1.15;
  const min = target * MIN_FACTOR;

  let size = target;
  for (let step = 0; step < 24; step += 1) {
    c.font = `${layer.weight} ${size}px ${fontFamily}`;
    const { lines, widest } = wrapLines(c, text, maxWidth);
    const height = lines.length * size * lineHeight;
    if ((height <= maxHeight && widest <= maxWidth) || size <= min) break;
    size = Math.max(min, size * 0.94);
  }
  return size;
}

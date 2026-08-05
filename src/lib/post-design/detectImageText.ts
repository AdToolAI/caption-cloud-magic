/**
 * Heuristische Texterkennung in generierten Motiven — ohne zusätzlichen KI-Call.
 *
 * Schrift erzeugt in kleinen Kacheln eine sehr hohe Dichte kurzer,
 * hochkontrastiger Kanten bei gleichzeitig geringer Farbvarianz.
 * Fotografische Details (Haut, Stoff, Pflanzen) erzeugen zwar Kanten,
 * aber deutlich weniger scharfe Schwarz/Weiß-Sprünge pro Fläche.
 */

const SIZE = 256;
const TILE = 32;

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

/** true = im Bild ist mit hoher Wahrscheinlichkeit Schrift zu sehen. */
export async function detectImageText(url: string): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    // Graustufen
    const gray = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    const tiles = SIZE / TILE;
    let suspicious = 0;
    for (let ty = 0; ty < tiles; ty += 1) {
      for (let tx = 0; tx < tiles; tx += 1) {
        let strong = 0;
        let count = 0;
        let sum = 0;
        let sumSq = 0;
        for (let y = ty * TILE; y < (ty + 1) * TILE - 1; y += 1) {
          for (let x = tx * TILE; x < (tx + 1) * TILE - 1; x += 1) {
            const i = y * SIZE + x;
            const gx = Math.abs(gray[i] - gray[i + 1]);
            const gy = Math.abs(gray[i] - gray[i + SIZE]);
            const g = Math.max(gx, gy);
            if (g > 70) strong += 1;
            count += 1;
            sum += gray[i];
            sumSq += gray[i] * gray[i];
          }
        }
        if (!count) continue;
        const density = strong / count;
        const mean = sum / count;
        const variance = Math.max(0, sumSq / count - mean * mean);
        // Viele harte Kanten auf kleiner Fläche + moderate Gesamtvarianz => Schrift
        if (density > 0.18 && variance > 200) suspicious += 1;
      }
    }
    return suspicious >= 3;
  } catch {
    return false;
  }
}

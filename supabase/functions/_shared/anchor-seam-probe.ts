import { Image } from "npm:imagescript@1.3.0";

export interface AnchorSeamVerdict {
  isPanel: boolean;
  score: number;
  reason: string | null;
}

type RgbaImage = { width: number; height: number; bitmap: Uint8Array };

const luminance = (pixels: Uint8Array, offset: number): number =>
  0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];

/** Pure pixel probe used by tests and by the URL wrapper below. */
export function classifyAnchorSeams(image: RgbaImage): AnchorSeamVerdict {
  const { width: w, height: h, bitmap } = image;
  if (w < 24 || h < 24 || bitmap.length < w * h * 4) {
    return { isPanel: false, score: 0, reason: null };
  }

  const candidates = [
    { axis: "vertical", position: Math.round(w / 2), span: h, cross: w },
    { axis: "horizontal", position: Math.round(h / 2), span: w, cross: h },
    { axis: "vertical", position: Math.round(w / 3), span: h, cross: w },
    { axis: "vertical", position: Math.round((2 * w) / 3), span: h, cross: w },
  ] as const;
  let best = 0;
  let bestAxis = "";

  for (const candidate of candidates) {
    const dark: number[] = [];
    const contrast: number[] = [];
    for (let i = 2; i < candidate.span - 2; i += 2) {
      const x = candidate.axis === "vertical" ? candidate.position : i;
      const y = candidate.axis === "horizontal" ? candidate.position : i;
      const crossOffset = Math.max(3, Math.round(candidate.cross * 0.012));
      const center = (y * w + x) * 4;
      const before = candidate.axis === "vertical"
        ? (y * w + Math.max(0, x - crossOffset)) * 4
        : (Math.max(0, y - crossOffset) * w + x) * 4;
      const after = candidate.axis === "vertical"
        ? (y * w + Math.min(w - 1, x + crossOffset)) * 4
        : (Math.min(h - 1, y + crossOffset) * w + x) * 4;
      const lc = luminance(bitmap, center);
      const ln = (luminance(bitmap, before) + luminance(bitmap, after)) / 2;
      dark.push(Math.max(0, (ln - lc) / 255));
      contrast.push(Math.abs(luminance(bitmap, before) - luminance(bitmap, after)) / 255);
    }
    const darkCoverage = dark.filter((v) => v >= 0.18).length / Math.max(1, dark.length);
    const edgeCoverage = contrast.filter((v) => v >= 0.2).length / Math.max(1, contrast.length);
    const score = Math.min(darkCoverage, edgeCoverage);
    if (score > best) {
      best = score;
      bestAxis = `${candidate.axis}@${candidate.position}`;
    }
  }

  const isPanel = best >= 0.42;
  return {
    isPanel,
    score: best,
    reason: isPanel ? `split_screen_seam(${bestAxis}, score=${best.toFixed(3)})` : null,
  };
}

export async function probeAnchorSeams(url: string): Promise<AnchorSeamVerdict> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { isPanel: false, score: 0, reason: null };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const image = await Image.decode(bytes) as unknown as RgbaImage;
    return classifyAnchorSeams(image);
  } catch {
    return { isPanel: false, score: 0, reason: null };
  }
}
/**
 * videoImageRequirements — single source of truth for the input-image limits
 * the video providers enforce on first/last frames and reference images.
 *
 * Written as plain TypeScript (no Deno APIs) so the client mirrors it via
 * `src/lib/ai-video/imageRequirements.ts` instead of keeping a second,
 * drifting rule set.
 *
 * Evidence for the current numbers (production failures, 30.08.2026):
 *  - ModelArk / Seedance 2.5: "expected the width to be at least 300px,
 *    but received a 152x515px image instead" (400 InvalidParameter).
 *  - Kling Omni (Replicate): "Image aspect ratio (0.30) is outside the
 *    allowed range [0.40 (1:2.5), 2.50 (2.5:1)]".
 */

export interface ImageRequirements {
  /** Minimum width in pixels. */
  minWidth: number;
  /** Minimum height in pixels. */
  minHeight: number;
  /** Minimum width / height ratio. */
  minAspect: number;
  /** Maximum width / height ratio. */
  maxAspect: number;
  /** Maximum file size in bytes (0 = no documented limit). */
  maxBytes: number;
}

const DEFAULT_REQUIREMENTS: ImageRequirements = {
  minWidth: 300,
  minHeight: 300,
  minAspect: 0.4,
  maxAspect: 2.5,
  maxBytes: 10 * 1024 * 1024,
};

/** Keyed by model family (see `aiVideoModelRegistry`), fallback = default. */
const FAMILY_REQUIREMENTS: Record<string, ImageRequirements> = {
  // ByteDance ModelArk (Seedance 2.5) and Replicate Seedance.
  seedance: { minWidth: 300, minHeight: 300, minAspect: 0.4, maxAspect: 2.5, maxBytes: 10 * 1024 * 1024 },
  kling: { minWidth: 300, minHeight: 300, minAspect: 0.4, maxAspect: 2.5, maxBytes: 10 * 1024 * 1024 },
  hailuo: { minWidth: 300, minHeight: 300, minAspect: 0.4, maxAspect: 2.5, maxBytes: 20 * 1024 * 1024 },
  veo: { minWidth: 256, minHeight: 256, minAspect: 0.25, maxAspect: 4, maxBytes: 20 * 1024 * 1024 },
  luma: { minWidth: 256, minHeight: 256, minAspect: 0.25, maxAspect: 4, maxBytes: 20 * 1024 * 1024 },
  wan: { minWidth: 300, minHeight: 300, minAspect: 0.4, maxAspect: 2.5, maxBytes: 10 * 1024 * 1024 },
  vidu: { minWidth: 300, minHeight: 300, minAspect: 0.4, maxAspect: 2.5, maxBytes: 10 * 1024 * 1024 },
  happyhorse: { minWidth: 256, minHeight: 256, minAspect: 0.25, maxAspect: 4, maxBytes: 20 * 1024 * 1024 },
};

/** Model ids that need their own numbers regardless of family. */
const MODEL_REQUIREMENTS: Record<string, ImageRequirements> = {
  'seedance-2-5': FAMILY_REQUIREMENTS.seedance,
  'kling-omni': FAMILY_REQUIREMENTS.kling,
};

export function imageRequirementsFor(
  modelId: string | undefined,
  family?: string,
): ImageRequirements {
  if (modelId && MODEL_REQUIREMENTS[modelId]) return MODEL_REQUIREMENTS[modelId];
  if (family && FAMILY_REQUIREMENTS[family]) return FAMILY_REQUIREMENTS[family];
  if (modelId) {
    const guessed = Object.keys(FAMILY_REQUIREMENTS).find((f) => modelId.startsWith(f));
    if (guessed) return FAMILY_REQUIREMENTS[guessed];
  }
  return DEFAULT_REQUIREMENTS;
}

export interface ImageDimensions {
  width: number;
  height: number;
  bytes?: number;
}

export type ImageViolation =
  | 'too_small'
  | 'aspect_out_of_range'
  | 'too_large';

export interface ImageCheckResult {
  ok: boolean;
  violation?: ImageViolation;
  requirements: ImageRequirements;
  dimensions: ImageDimensions;
}

export function checkImageDimensions(
  dimensions: ImageDimensions,
  requirements: ImageRequirements,
): ImageCheckResult {
  const { width, height, bytes } = dimensions;
  const base = { requirements, dimensions };

  if (!width || !height) {
    return { ok: false, violation: 'too_small', ...base };
  }
  if (width < requirements.minWidth || height < requirements.minHeight) {
    return { ok: false, violation: 'too_small', ...base };
  }
  const aspect = width / height;
  if (aspect < requirements.minAspect || aspect > requirements.maxAspect) {
    return { ok: false, violation: 'aspect_out_of_range', ...base };
  }
  if (requirements.maxBytes && bytes && bytes > requirements.maxBytes) {
    return { ok: false, violation: 'too_large', ...base };
  }
  return { ok: true, ...base };
}

export type ImageLocale = 'de' | 'en' | 'es';

/** Human-readable, localized explanation — never raw provider JSON. */
export function describeImageViolation(
  result: ImageCheckResult,
  locale: ImageLocale = 'en',
  modelLabel = 'this model',
): string {
  const { dimensions: d, requirements: r } = result;
  const size = `${d.width}×${d.height} px`;
  const ratio = `1:${(1 / r.minAspect).toFixed(1)} – ${r.maxAspect.toFixed(1)}:1`;
  const mb = Math.round(r.maxBytes / (1024 * 1024));

  switch (result.violation) {
    case 'too_small':
      return locale === 'de'
        ? `Dieses Bild ist ${size}. ${modelLabel} braucht mindestens ${r.minWidth}×${r.minHeight} px.`
        : locale === 'es'
          ? `Esta imagen es de ${size}. ${modelLabel} necesita al menos ${r.minWidth}×${r.minHeight} px.`
          : `This image is ${size}. ${modelLabel} needs at least ${r.minWidth}×${r.minHeight} px.`;
    case 'aspect_out_of_range':
      return locale === 'de'
        ? `Dieses Bild ist ${size}. ${modelLabel} akzeptiert nur Seitenverhältnisse zwischen ${ratio}.`
        : locale === 'es'
          ? `Esta imagen es de ${size}. ${modelLabel} solo acepta proporciones entre ${ratio}.`
          : `This image is ${size}. ${modelLabel} only accepts aspect ratios between ${ratio}.`;
    case 'too_large':
      return locale === 'de'
        ? `Dieses Bild ist zu groß (max. ${mb} MB).`
        : locale === 'es'
          ? `Esta imagen es demasiado grande (máx. ${mb} MB).`
          : `This image is too large (max ${mb} MB).`;
    default:
      return '';
  }
}

/**
 * Reads width/height of a remote image without decoding the full file:
 * PNG (IHDR), JPEG (SOFn), WebP (VP8/VP8L/VP8X) headers are enough. Returns
 * null when the format is unknown — the caller then skips the pre-check and
 * lets the provider decide.
 */
export async function probeRemoteImageSize(
  url: string,
): Promise<ImageDimensions | null> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return parseImageSize(buf);
  } catch {
    return null;
  }
}

export function parseImageSize(buf: Uint8Array): ImageDimensions | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // PNG
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // WebP
  if (
    buf.length > 30 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const fourcc = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (fourcc === 'VP8 ') {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { width: w + 1, height: h + 1 };
    }
    return null;
  }

  // JPEG
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = view.getUint16(i + 2);
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }

  return null;
}

/**
 * Maps a raw ModelArk / provider error into a short, localized sentence.
 * Raw JSON and request ids stay in the logs.
 */
export function describeProviderImageError(
  raw: string,
  locale: ImageLocale = 'en',
): string {
  const t = (raw || '').toLowerCase();

  if (t.includes('width') || t.includes('aspect ratio') || t.includes('downloading image') || t.includes('image_url')) {
    return locale === 'de'
      ? 'Das hochgeladene Bild erfüllt nicht die Anforderungen des Modells (Mindestgröße bzw. Seitenverhältnis). Bitte ein größeres, weniger extremes Bild verwenden.'
      : locale === 'es'
        ? 'La imagen subida no cumple los requisitos del modelo (tamaño mínimo o proporción). Usa una imagen más grande y menos extrema.'
        : 'The uploaded image does not meet the model requirements (minimum size or aspect ratio). Please use a larger, less extreme image.';
  }
  if (t.includes('copyright') || t.includes('sensitive') || t.includes('policy') || t.includes('moderation')) {
    return locale === 'de'
      ? 'Der Anbieter hat den Auftrag aus Inhalts- bzw. Urheberrechtsgründen abgelehnt. Bitte Prompt oder Bild anpassen.'
      : locale === 'es'
        ? 'El proveedor rechazó la solicitud por motivos de contenido o derechos de autor. Ajusta el prompt o la imagen.'
        : 'The provider rejected this request for content or copyright reasons. Please adjust the prompt or image.';
  }
  if (t.includes('rate limit') || t.includes('429') || t.includes('too many')) {
    return locale === 'de'
      ? 'Der Anbieter ist gerade ausgelastet. Bitte in einer Minute erneut versuchen.'
      : locale === 'es'
        ? 'El proveedor está saturado. Vuelve a intentarlo en un minuto.'
        : 'The provider is busy right now. Please try again in a minute.';
  }
  return locale === 'de'
    ? 'Die Videogenerierung ist beim Anbieter fehlgeschlagen. Die Credits wurden zurückerstattet.'
    : locale === 'es'
      ? 'La generación de vídeo falló en el proveedor. Los créditos han sido reembolsados.'
      : 'Video generation failed at the provider. Your credits have been refunded.';
}

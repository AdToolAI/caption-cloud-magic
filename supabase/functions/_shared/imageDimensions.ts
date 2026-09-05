/**
 * Server-side truth for image dimensions.
 *
 * The browser may report the natural size of a reference image, but that value
 * is never trusted for a paid provider call. We read the real size out of the
 * stored asset's own header bytes (PNG / JPEG / WebP / GIF) — a range request,
 * so we never download the whole picture.
 */

export interface PixelSize {
  width: number;
  height: number;
}

const HEADER_BYTES = 65_536;

function parsePng(b: Uint8Array): PixelSize | null {
  if (b.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, i) => b[i] === v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

function parseGif(b: Uint8Array): PixelSize | null {
  if (b.length < 10) return null;
  if (!(b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)) return null;
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
}

function parseWebp(b: Uint8Array): PixelSize | null {
  if (b.length < 30) return null;
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (tag !== 'RIFF' || webp !== 'WEBP') return null;
  const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fmt === 'VP8 ') {
    return { width: ((b[26] | (b[27] << 8)) & 0x3fff), height: ((b[28] | (b[29] << 8)) & 0x3fff) };
  }
  if (fmt === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return null;
}

function parseJpeg(b: Uint8Array): PixelSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // Standalone markers without a payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
    }
    if (len <= 0) return null;
    i += 2 + len;
  }
  return null;
}

/** Parse an image header buffer. Returns null for unknown formats. */
export function parseImageDimensions(bytes: Uint8Array): PixelSize | null {
  return parsePng(bytes) ?? parseJpeg(bytes) ?? parseWebp(bytes) ?? parseGif(bytes);
}

/**
 * Authoritative size of a stored asset. Returns null when the asset cannot be
 * read or its format is unknown — callers must then fall back to a preset,
 * never to a client-supplied value.
 */
export async function readImageDimensions(url: string): Promise<PixelSize | null> {
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const size = parseImageDimensions(buf);
    return size && size.width > 0 && size.height > 0 ? size : null;
  } catch (err) {
    console.warn('[imageDimensions] could not read', err);
    return null;
  }
}

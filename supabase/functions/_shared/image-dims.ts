/**
 * Tiny dependency-free image dimension probe for PNG and JPEG.
 * Used by Sync.so coordinate normalization: Gemini returns normalized 0..1
 * face centers; we multiply by the REAL anchor pixel dimensions (Hailuo
 * uses the anchor as first frame, so video dims == anchor dims) so the
 * coordinates land on the actual face inside the rendered video.
 *
 * Returns null on any parse failure — caller must fall back gracefully.
 */
export async function probeImageDims(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    // PNG: \x89PNG\r\n\x1a\n + IHDR chunk @ offset 16..23
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      if (w > 0 && h > 0) return { width: w, height: h };
      return null;
    }
    // JPEG: walk SOF markers
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        i += 2;
        if (marker === 0xd8 || marker === 0xd9) continue;
        if (marker === 0xda) return null;
        const segLen = (buf[i] << 8) | buf[i + 1];
        // SOF0..SOF15 (excluding DHT 0xc4, DAC 0xcc, DNL 0xdc)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (buf[i + 3] << 8) | buf[i + 4];
          const w = (buf[i + 5] << 8) | buf[i + 6];
          if (w > 0 && h > 0) return { width: w, height: h };
          return null;
        }
        i += segLen;
      }
    }
    // WebP (RIFF....WEBPVP8 ): basic VP8X path
    if (buf.length >= 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      // VP8X chunk at offset 12
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58) {
        const w = 1 + ((buf[24]) | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + ((buf[27]) | (buf[28] << 8) | (buf[29] << 16));
        if (w > 0 && h > 0) return { width: w, height: h };
      }
    }
    return null;
  } catch {
    return null;
  }
}

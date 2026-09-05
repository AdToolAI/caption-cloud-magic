/**
 * Minimal MP4/MOV probe.
 *
 * Video Enhance must never take duration, resolution or frame rate from the
 * client payload: price, capability check and provider request all depend on
 * them. When the asset row does not carry verified values we measure them at
 * the source file itself, using ranged reads instead of downloading the whole
 * video.
 *
 * Only the boxes we actually need are parsed:
 *   moov > mvhd            duration / timescale
 *   moov > trak > tkhd     track dimensions
 *   moov > trak > mdia > mdhd + minf > stbl > stts   frame rate
 */

export interface ProbedVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container: string;
  sizeBytes: number;
}

interface Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

const td = new TextDecoder();

function readBox(view: DataView, offset: number): Box | null {
  if (offset + 8 > view.byteLength) return null;
  let size = view.getUint32(offset);
  const type = td.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4));
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > view.byteLength) return null;
    const hi = view.getUint32(offset + 8);
    const lo = view.getUint32(offset + 12);
    size = hi * 2 ** 32 + lo;
    headerSize = 16;
  } else if (size === 0) {
    size = view.byteLength - offset;
  }
  if (size < headerSize) return null;
  return { type, start: offset, headerSize, size };
}

function* children(view: DataView, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset < end) {
    const box = readBox(view, offset);
    if (!box) return;
    yield box;
    if (box.size <= 0) return;
    offset += box.size;
  }
}

function findBox(view: DataView, start: number, end: number, type: string): Box | null {
  for (const box of children(view, start, end)) {
    if (box.type === type) return box;
  }
  return null;
}

function parseMvhd(view: DataView, box: Box): { timescale: number; duration: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  if (version === 1) {
    const timescale = view.getUint32(p + 20);
    const hi = view.getUint32(p + 24);
    const lo = view.getUint32(p + 28);
    return { timescale, duration: hi * 2 ** 32 + lo };
  }
  return { timescale: view.getUint32(p + 12), duration: view.getUint32(p + 16) };
}

function parseTkhd(view: DataView, box: Box): { width: number; height: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  const base = version === 1 ? p + 20 + 12 + 60 : p + 12 + 12 + 60;
  // 16.16 fixed point
  const width = view.getUint32(base) / 65536;
  const height = view.getUint32(base + 4) / 65536;
  return { width: Math.round(width), height: Math.round(height) };
}

function parseMdhd(view: DataView, box: Box): { timescale: number; duration: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  if (version === 1) {
    const timescale = view.getUint32(p + 20);
    const hi = view.getUint32(p + 24);
    const lo = view.getUint32(p + 28);
    return { timescale, duration: hi * 2 ** 32 + lo };
  }
  return { timescale: view.getUint32(p + 12), duration: view.getUint32(p + 16) };
}

function parseStts(view: DataView, box: Box): { samples: number; totalDelta: number } {
  const p = box.start + box.headerSize;
  const count = view.getUint32(p + 4);
  let samples = 0;
  let totalDelta = 0;
  for (let i = 0; i < count; i++) {
    const entry = p + 8 + i * 8;
    if (entry + 8 > box.start + box.size) break;
    const sampleCount = view.getUint32(entry);
    const sampleDelta = view.getUint32(entry + 4);
    samples += sampleCount;
    totalDelta += sampleCount * sampleDelta;
  }
  return { samples, totalDelta };
}

/** Parses a complete `moov` box. Returns `null` when it holds no video track. */
export function parseMoov(moov: Uint8Array, sizeBytes = 0, container = 'mp4'): ProbedVideoMetadata | null {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const root = readBox(view, 0);
  if (!root || root.type !== 'moov') return null;
  const bodyStart = root.headerSize;
  const bodyEnd = Math.min(root.size, moov.byteLength);

  const mvhd = findBox(view, bodyStart, bodyEnd, 'mvhd');
  if (!mvhd) return null;
  const movie = parseMvhd(view, mvhd);
  const movieDuration = movie.timescale > 0 ? movie.duration / movie.timescale : 0;

  let best: ProbedVideoMetadata | null = null;
  for (const trak of children(view, bodyStart, bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const trakStart = trak.start + trak.headerSize;
    const trakEnd = trak.start + trak.size;
    const tkhd = findBox(view, trakStart, trakEnd, 'tkhd');
    if (!tkhd) continue;
    const { width, height } = parseTkhd(view, tkhd);
    // Audio tracks report 0x0 — only video tracks carry dimensions.
    if (width <= 0 || height <= 0) continue;

    const mdia = findBox(view, trakStart, trakEnd, 'mdia');
    let fps = 0;
    let trackDuration = movieDuration;
    if (mdia) {
      const mdiaStart = mdia.start + mdia.headerSize;
      const mdiaEnd = mdia.start + mdia.size;
      const mdhd = findBox(view, mdiaStart, mdiaEnd, 'mdhd');
      const media = mdhd ? parseMdhd(view, mdhd) : null;
      if (media && media.timescale > 0) trackDuration = media.duration / media.timescale;

      const minf = findBox(view, mdiaStart, mdiaEnd, 'minf');
      const stbl = minf
        ? findBox(view, minf.start + minf.headerSize, minf.start + minf.size, 'stbl')
        : null;
      const stts = stbl
        ? findBox(view, stbl.start + stbl.headerSize, stbl.start + stbl.size, 'stts')
        : null;
      if (stts && media && media.timescale > 0) {
        const { samples, totalDelta } = parseStts(view, stts);
        if (samples > 0 && totalDelta > 0) fps = samples / (totalDelta / media.timescale);
      }
    }
    if (!fps && trackDuration > 0) fps = 0;

    const candidate: ProbedVideoMetadata = {
      durationSeconds: Number((trackDuration || movieDuration).toFixed(3)),
      width,
      height,
      fps: Number(fps.toFixed(3)),
      container,
      sizeBytes,
    };
    if (!best || candidate.width * candidate.height > best.width * best.height) best = candidate;
  }
  return best;
}

async function rangeFetch(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) throw new Error(`range read failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Measures a remote MP4/MOV. Scans the top-level box list to locate `moov`
 * (which can sit at the end of the file) and reads only that box.
 */
export async function probeRemoteVideo(url: string): Promise<ProbedVideoMetadata> {
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`source not reachable: ${head.status}`);
  const sizeBytes = Number(head.headers.get('content-length') ?? 0);
  const contentType = head.headers.get('content-type') ?? '';
  const container = contentType.includes('quicktime') ? 'mov' : 'mp4';
  if (!sizeBytes) throw new Error('source has no content-length');

  let offset = 0;
  for (let guard = 0; guard < 64 && offset < sizeBytes; guard++) {
    const header = await rangeFetch(url, offset, Math.min(offset + 15, sizeBytes - 1));
    if (header.byteLength < 8) break;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const box = readBox(view, 0);
    if (!box) break;
    if (box.type === 'moov') {
      const moov = await rangeFetch(url, offset, Math.min(offset + box.size - 1, sizeBytes - 1));
      const parsed = parseMoov(moov, sizeBytes, container);
      if (!parsed) throw new Error('no video track found');
      return parsed;
    }
    offset += box.size;
  }

  // moov is often at the end of the file; scan backwards from the end.
  const tailStart = Math.max(0, sizeBytes - 1024 * 1024);
  const tail = await rangeFetch(url, tailStart, sizeBytes - 1);
  for (let guard = 0, tailOffset = tail.byteLength - 1; guard < 64 && tailOffset >= 8; guard++) {
    // Search backwards for the 'moov' type signature.
    let idx = -1;
    for (let i = tailOffset - 4; i >= 0; i--) {
      if (tail[i] === 0x6d && tail[i + 1] === 0x6f && tail[i + 2] === 0x6f && tail[i + 3] === 0x76) {
        idx = i;
        break;
      }
    }
    if (idx < 0) break;
    const boxOffsetInTail = idx - 4;
    if (boxOffsetInTail < 0) break;
    const sizeView = new DataView(tail.buffer, tail.byteOffset + boxOffsetInTail, 4);
    const boxSize = sizeView.getUint32(0);
    if (boxSize < 8 || boxOffsetInTail + boxSize > tail.byteLength) {
      tailOffset = boxOffsetInTail;
      continue;
    }
    const moov = tail.subarray(boxOffsetInTail, boxOffsetInTail + boxSize);
    const parsed = parseMoov(moov, sizeBytes, container);
    if (parsed) return parsed;
    tailOffset = boxOffsetInTail;
  }

  throw new Error('moov box not found');
}

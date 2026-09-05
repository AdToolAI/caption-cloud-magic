/**
 * One canonical video asset representation for the Video Enhance source picker.
 *
 * Two tables back the same conceptual "video": `ai_video_generations` (raw
 * model output) and `video_creations` (persisted asset, including uploads and
 * enhanced masters). The picker must never show the same underlying file
 * twice, and the identity it hands to the engine is ALWAYS
 * `{ assetId, assetType }` — never a URL.
 *
 * Dimensions / fps / duration carried here are DISPLAY values. They may come
 * from the browser and are therefore marked `metadataVerified: false` until
 * `video-enhance` has measured the file server-side. Pricing, capability
 * validation and the provider request use the server-measured values only.
 */

export type CanonicalAssetType = 'generation' | 'creation';

export type CanonicalOrigin = 'generated' | 'uploaded' | 'enhanced';

export interface CanonicalVideoAsset {
  /** `${assetType}:${assetId}` — stable React key. */
  key: string;
  assetId: string;
  assetType: CanonicalAssetType;
  origin: CanonicalOrigin;
  url: string;
  thumbnailUrl: string | null;
  title: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  durationSeconds: number | null;
  metadataVerified: boolean;
  sourceModel: string | null;
  workflowType: string | null;
  storageKey: string | null;
  generationId: string | null;
  parentVideoId: string | null;
  createdAt: string;
}

// deno-lint-ignore-file
type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Storage object path without bucket host, query string or signature. */
export function canonicalStorageKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const marker = '/storage/v1/object/';
    const idx = path.indexOf(marker);
    const tail = idx >= 0 ? path.slice(idx + marker.length) : path;
    return tail.replace(/^(public|sign|authenticated)\//, '') || null;
  } catch {
    return url.split('?')[0] || null;
  }
}

export function normalizedUrl(url: string | null): string | null {
  if (!url) return null;
  return url.split('?')[0];
}

function resolutionToSize(resolution: unknown): { width: number | null; height: number | null } {
  const value = str(resolution)?.toLowerCase() ?? '';
  const explicit = value.match(/^(\d{3,4})\s*[x×]\s*(\d{3,4})$/);
  if (explicit) return { width: Number(explicit[1]), height: Number(explicit[2]) };
  if (value.includes('4k') || value.includes('2160')) return { width: 3840, height: 2160 };
  if (value.includes('1440') || value === '2k') return { width: 2560, height: 1440 };
  if (value.includes('1080')) return { width: 1920, height: 1080 };
  if (value.includes('720')) return { width: 1280, height: 720 };
  return { width: null, height: null };
}

export function fromGenerationRow(row: Row): CanonicalVideoAsset | null {
  const url = str(row.video_url);
  const id = str(row.id);
  if (!url || !id) return null;
  const size = resolutionToSize(row.resolution);
  const prompt = str(row.prompt);
  return {
    key: `generation:${id}`,
    assetId: id,
    assetType: 'generation',
    origin: 'generated',
    url,
    thumbnailUrl: str(row.thumbnail_url),
    title: prompt ? prompt.slice(0, 70) : 'Video',
    width: size.width,
    height: size.height,
    fps: null,
    durationSeconds: num(row.duration_seconds),
    metadataVerified: false,
    sourceModel: str(row.model),
    workflowType: 'generation',
    storageKey: canonicalStorageKey(url),
    generationId: id,
    parentVideoId: null,
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

export function fromCreationRow(row: Row): CanonicalVideoAsset | null {
  const url = str(row.output_url);
  const id = str(row.id);
  if (!url || !id) return null;
  const meta = (row.metadata ?? {}) as Row;
  const source = str(meta.source) ?? '';
  const isUpload = source === 'upload' || str(meta.source_type) === 'upload';
  const isEnhanced = source.includes('enhance');
  const model = str(meta.model) ?? str(meta.source_model);
  const size = (() => {
    const w = num(meta.width);
    const h = num(meta.height);
    if (w && h) return { width: w, height: h };
    return resolutionToSize(meta.resolution ?? row.quality);
  })();

  return {
    key: `creation:${id}`,
    assetId: id,
    assetType: 'creation',
    origin: isEnhanced ? 'enhanced' : isUpload ? 'uploaded' : 'generated',
    url,
    thumbnailUrl: str(row.thumbnail_url),
    title:
      str(meta.title) ??
      str(meta.original_filename) ??
      (str(meta.prompt)?.slice(0, 70) ?? 'Video'),
    width: size.width,
    height: size.height,
    fps: num(row.framerate) ?? num(meta.fps),
    durationSeconds: num(meta.duration) ?? num(meta.duration_seconds),
    metadataVerified: meta.metadata_verified === true,
    sourceModel: model,
    workflowType: source || (isUpload ? 'upload' : null),
    storageKey: str(meta.storage_key) ?? canonicalStorageKey(url),
    generationId: str(meta.generation_id) ?? str(meta.ai_video_generation_id),
    parentVideoId: str(row.parent_video_id),
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
  };
}

/**
 * Deduplicate by STABLE identity first: generation id, lineage, storage key.
 * URL equality is the last resort because signed/CDN URLs change over time.
 * A persisted `creation` always wins over the raw `generation`.
 */
export function dedupeCanonicalAssets(assets: CanonicalVideoAsset[]): CanonicalVideoAsset[] {
  const byIdentity = new Map<string, CanonicalVideoAsset>();
  const order: string[] = [];

  const identitiesOf = (a: CanonicalVideoAsset): string[] => {
    const ids: string[] = [];
    if (a.generationId) ids.push(`gen:${a.generationId}`);
    if (a.parentVideoId) ids.push(`lineage:${a.parentVideoId}`);
    if (a.storageKey) ids.push(`key:${a.storageKey}`);
    const u = normalizedUrl(a.url);
    if (u) ids.push(`url:${u}`);
    return ids.length ? ids : [a.key];
  };

  for (const asset of assets) {
    const ids = identitiesOf(asset);
    const existingId = ids.find((id) => byIdentity.has(id));
    if (!existingId) {
      for (const id of ids) byIdentity.set(id, asset);
      order.push(asset.key);
      continue;
    }
    const existing = byIdentity.get(existingId)!;
    // Enhanced outputs are their own asset — never fold them into the source.
    if (existing.origin === 'enhanced' || asset.origin === 'enhanced') {
      if (existing.key !== asset.key && existing.origin !== asset.origin) {
        for (const id of ids) if (!byIdentity.has(id)) byIdentity.set(id, asset);
        order.push(asset.key);
        continue;
      }
    }
    const winner = existing.assetType === 'creation' ? existing : asset;
    for (const id of ids) byIdentity.set(id, winner);
    if (winner !== existing) {
      const pos = order.indexOf(existing.key);
      if (pos >= 0) order[pos] = winner.key;
    }
  }

  const unique = new Map<string, CanonicalVideoAsset>();
  for (const asset of byIdentity.values()) unique.set(asset.key, asset);
  return order
    .map((key) => unique.get(key))
    .filter((a): a is CanonicalVideoAsset => !!a);
}

/** Newest first, with the asset key as a stable tiebreaker. */
export function sortByRecency(assets: CanonicalVideoAsset[]): CanonicalVideoAsset[] {
  return [...assets].sort((a, b) => {
    const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (diff !== 0) return diff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

export function mergeCanonicalAssets(...groups: CanonicalVideoAsset[][]): CanonicalVideoAsset[] {
  return dedupeCanonicalAssets(sortByRecency(groups.flat()));
}

export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

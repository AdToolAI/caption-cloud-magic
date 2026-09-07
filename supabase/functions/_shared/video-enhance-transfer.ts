/**
 * Memory-bounded, restart-safe transfer of a finished provider video into our
 * own Storage.
 *
 * The old path (`fetch -> arrayBuffer -> upload`) held the complete file in
 * the Edge Function's RAM and killed every reconcile cycle with
 * "Memory limit exceeded" on 4K outputs. This module never materialises more
 * than ONE chunk at a time and never depends on finishing inside a single
 * invocation:
 *
 *   - the destination object key is deterministic per run (no random object
 *     per retry, no silent overwrite),
 *   - the upload is a TUS/resumable session whose URL and byte offset live in
 *     the database, so a worker that dies mid-transfer is resumed by the next
 *     cycle instead of restarting at 0,
 *   - each invocation works under a wall-clock budget and yields; the run
 *     stays claimable and continues on the next cycle.
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Supabase resumable uploads require chunks that are multiples of 6 MB. */
export const CHUNK_SIZE = 6 * 1024 * 1024;
/** Wall-clock budget for one invocation — never race the function timeout. */
export const TRANSFER_BUDGET_MS = 60_000;
/** Persistence retry schedule in minutes (attempt 1 runs immediately). */
export const PERSIST_BACKOFF_MINUTES = [0, 2, 5, 15, 30];
/** After this many failed persistence attempts a run goes to manual review. */
export const MAX_PERSIST_ATTEMPTS = PERSIST_BACKOFF_MINUTES.length;

export function persistBackoffMinutes(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 0), PERSIST_BACKOFF_MINUTES.length - 1);
  return PERSIST_BACKOFF_MINUTES[idx];
}

export function nextPersistAt(attempt: number, now = Date.now()): string {
  return new Date(now + persistBackoffMinutes(attempt) * 60_000).toISOString();
}

/** Deterministic destination object for a run — identical on every retry. */
export function destinationObjectPath(userId: string, runId: string): string {
  return `${userId}/video-enhance/${runId}.mp4`;
}

export interface ProviderOutputHead {
  ok: boolean;
  status: number;
  contentLength?: number;
  contentType?: string;
  acceptsRanges: boolean;
  /** true when the provider link is gone for good (404 / 410 / expired). */
  gone: boolean;
}

export async function headProviderOutput(url: string): Promise<ProviderOutputHead> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch {
    return { ok: false, status: 0, acceptsRanges: false, gone: false };
  }
  const len = Number(res.headers.get('content-length') ?? '');
  return {
    ok: res.ok,
    status: res.status,
    contentLength: Number.isFinite(len) && len > 0 ? len : undefined,
    contentType: res.headers.get('content-type') ?? undefined,
    acceptsRanges: (res.headers.get('accept-ranges') ?? '').includes('bytes'),
    gone: res.status === 404 || res.status === 410 || res.status === 403,
  };
}

/** Size of an already stored object, or null when it does not exist. */
export async function storedObjectSize(
  admin: Admin,
  bucket: string,
  key: string,
): Promise<number | null> {
  const slash = key.lastIndexOf('/');
  const dir = slash > 0 ? key.slice(0, slash) : '';
  const name = slash > 0 ? key.slice(slash + 1) : key;
  const { data, error } = await admin.storage.from(bucket).list(dir, { search: name, limit: 100 });
  if (error || !data) return null;
  // deno-lint-ignore no-explicit-any
  const hit = (data as any[]).find((f) => f.name === name);
  if (!hit) return null;
  const size = Number(hit?.metadata?.size ?? 0);
  return Number.isFinite(size) ? size : 0;
}

function b64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function tusHeaders(serviceKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'tus-resumable': '1.0.0',
  };
}

export interface UploadSession {
  uploadUrl: string;
  offset: number;
}

/** Creates a resumable upload session for the deterministic destination. */
export async function createUploadSession(params: {
  supabaseUrl: string;
  serviceKey: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  size: number;
}): Promise<{ ok: boolean; uploadUrl?: string; error?: string }> {
  const res = await fetch(`${params.supabaseUrl}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      ...tusHeaders(params.serviceKey),
      'upload-length': String(params.size),
      'upload-metadata': [
        `bucketName ${b64(params.bucket)}`,
        `objectName ${b64(params.objectKey)}`,
        `contentType ${b64(params.contentType)}`,
        `cacheControl ${b64('3600')}`,
      ].join(','),
    },
  });
  if (res.status !== 201) {
    return { ok: false, error: `tus create failed ${res.status}: ${await res.text()}` };
  }
  const location = res.headers.get('location');
  if (!location) return { ok: false, error: 'tus create returned no location' };
  return { ok: true, uploadUrl: location };
}

/** Authoritative offset of an existing session; null when it is gone. */
export async function sessionOffset(
  uploadUrl: string,
  serviceKey: string,
): Promise<number | null> {
  const res = await fetch(uploadUrl, { method: 'HEAD', headers: tusHeaders(serviceKey) });
  if (!res.ok) return null;
  const offset = Number(res.headers.get('upload-offset') ?? '');
  return Number.isFinite(offset) ? offset : null;
}

/**
 * Reads exactly one chunk from the provider.
 *
 * Range requests are the normal path. A provider that ignores ranges answers
 * 200 with the whole body; we then read and DISCARD bytes up to the offset and
 * keep only the chunk — still bounded memory, just more traffic.
 */
async function readChunk(
  url: string,
  offset: number,
  size: number,
): Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }> {
  const res = await fetch(url, { headers: { range: `bytes=${offset}-${offset + size - 1}` } });
  if (!res.ok || !res.body) return { ok: false, error: `provider read ${res.status}` };

  const reader = res.body.getReader();
  const out = new Uint8Array(size);
  let filled = 0;
  let skipped = 0;
  const skipTarget = res.status === 206 ? 0 : offset;

  while (filled < size) {
    const { done, value } = await reader.read();
    if (done) break;
    let part = value;
    if (skipped < skipTarget) {
      const skip = Math.min(skipTarget - skipped, part.byteLength);
      skipped += skip;
      if (skip === part.byteLength) continue;
      part = part.subarray(skip);
    }
    const take = Math.min(size - filled, part.byteLength);
    out.set(part.subarray(0, take), filled);
    filled += take;
  }
  await reader.cancel().catch(() => undefined);
  return { ok: true, bytes: out.subarray(0, filled) };
}

/** ISO base media files carry an `ftyp` box in the first 12 bytes. */
export function looksLikeVideoHead(head: Uint8Array): boolean {
  if (head.byteLength < 12) return false;
  return String.fromCharCode(head[4], head[5], head[6], head[7]) === 'ftyp';
}

export interface TransferProgress {
  done: boolean;
  offset: number;
  uploadUrl: string;
  error?: string;
  /** true when the provider link itself is gone — nothing left to recover. */
  providerGone?: boolean;
}

/**
 * Moves bytes provider -> Storage until the file is complete or the invocation
 * budget is spent. Persists the offset after every chunk, so the next cycle
 * resumes exactly here.
 */
export async function transferChunks(params: {
  admin: Admin;
  runId: string;
  providerUrl: string;
  uploadUrl: string;
  serviceKey: string;
  size: number;
  startOffset: number;
  budgetMs?: number;
  onProgress?: (offset: number) => Promise<void>;
}): Promise<TransferProgress> {
  const deadline = Date.now() + (params.budgetMs ?? TRANSFER_BUDGET_MS);
  let offset = params.startOffset;

  while (offset < params.size) {
    if (Date.now() > deadline) {
      return { done: false, offset, uploadUrl: params.uploadUrl };
    }
    const want = Math.min(CHUNK_SIZE, params.size - offset);
    const chunk = await readChunk(params.providerUrl, offset, want);
    if (!chunk.ok) {
      const head = await headProviderOutput(params.providerUrl);
      return { done: false, offset, uploadUrl: params.uploadUrl, error: chunk.error, providerGone: head.gone };
    }
    if (!chunk.bytes || chunk.bytes.byteLength === 0) {
      return { done: false, offset, uploadUrl: params.uploadUrl, error: 'provider returned no bytes' };
    }
    if (offset === 0 && !looksLikeVideoHead(chunk.bytes)) {
      return { done: false, offset, uploadUrl: params.uploadUrl, error: 'not_a_video_container' };
    }

    const patch = await fetch(params.uploadUrl, {
      method: 'PATCH',
      headers: {
        ...tusHeaders(params.serviceKey),
        'content-type': 'application/offset+octet-stream',
        'upload-offset': String(offset),
      },
      // `as BodyInit`: a byte view is a valid fetch body at runtime; the DOM
      // typings used for the app build do not model it.
      body: chunk.bytes as unknown as BodyInit,
    });
    if (patch.status !== 204) {
      return {
        done: false,
        offset,
        uploadUrl: params.uploadUrl,
        error: `tus patch ${patch.status}: ${(await patch.text()).slice(0, 200)}`,
      };
    }
    const reported = Number(patch.headers.get('upload-offset') ?? '');
    offset = Number.isFinite(reported) ? reported : offset + chunk.bytes.byteLength;
    await params.onProgress?.(offset);
  }

  return { done: true, offset, uploadUrl: params.uploadUrl };
}

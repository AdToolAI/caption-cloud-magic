/**
 * Direct Topaz Labs API client (video + image).
 *
 * AdTool talks to Topaz DIRECTLY — not through Replicate. That is what gives
 * us the full model catalogue, explicit output geometry (real portrait 4K),
 * encoder control and the provider's own cost estimate per request.
 *
 * Base URL: https://api.topazlabs.com
 * Auth:     X-API-Key: <TOPAZ_API_KEY>
 *
 * Video (express flow, one call):
 *   POST /video/express            -> { requestId, estimates? }
 *   GET  /video/{id}/status        -> { status, progress, estimates, download }
 *   PATCH /video/{id}/cancel
 * The express endpoint fetches the source itself when `source.external` is
 * given, so nothing has to be uploaded: our storage URLs are public https URLs
 * and Topaz verifies read access while creating the request (a failure is a
 * 400 at create time, before any credit is reserved).
 *
 * Image (async flow):
 *   POST /image/v1/{intent}/async  -> { process_id }   (multipart form)
 *   GET  /image/v1/status/{id}     -> { status }
 *   GET  /image/v1/download/{id}   -> { url }
 *
 * Pricing note: Topaz bills in CREDITS. The USD value of one credit is an
 * account/contract number, not an API field, so it lives in the
 * `TOPAZ_CREDIT_USD` environment variable (documented default below) and every
 * cost we record is `credits * TOPAZ_CREDIT_USD`.
 */

export const TOPAZ_BASE_URL = 'https://api.topazlabs.com';
export const TOPAZ_IMAGE_BASE_URL = `${TOPAZ_BASE_URL}/image/v1`;

/** Documented default until the account's real credit price is configured. */
export const TOPAZ_CREDIT_USD_DEFAULT = 0.1;

export function topazCreditUsd(env: (key: string) => string | undefined): number {
  const raw = env('TOPAZ_CREDIT_USD');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TOPAZ_CREDIT_USD_DEFAULT;
}

function headers(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-API-Key': apiKey, ...extra };
}

export class TopazApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'TopazApiError';
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function errorMessage(payload: Record<string, unknown>, fallback: string): string {
  for (const key of ['message', 'detail', 'error', 'raw']) {
    const value = payload[key];
    if (typeof value === 'string' && value) return value;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/** Container enum of the express endpoint, matched case-insensitively. */
export const TOPAZ_CONTAINERS = [
  '3gp', 'avi', 'dv', 'flv', 'm1v', 'm2t', 'm2ts', 'm2v', 'm4v', 'mkv', 'mov', 'mp4',
  'mpeg', 'mpg', 'mts', 'mxf', 'ser', 'ts', 'vob', 'webm', 'wmv',
] as const;

export function topazContainer(container?: string | null): string {
  const value = (container ?? '').toLowerCase().replace(/^\./, '');
  return (TOPAZ_CONTAINERS as readonly string[]).includes(value) ? value : 'mp4';
}

export interface TopazVideoRequestBody {
  source: { container: string; external?: { provider: 's3'; presignedUrl: string } };
  filters: Record<string, unknown>[];
  output: Record<string, unknown>;
  notifications?: { webhookUrl: string };
}

export interface TopazVideoCreated {
  requestId: string;
  /** Present only when Topaz expects us to upload the source ourselves. */
  uploadUrls?: string[];
  estimates?: { cost?: number[]; time?: number[] };
}

/**
 * Creates an express video request. Preferred path: Topaz pulls the source
 * from our storage URL. When the account (or the URL) does not allow the pull,
 * the caller gets `uploadUrls` back and must PUT the bytes itself.
 */
export async function createTopazVideoRequest(
  apiKey: string,
  body: TopazVideoRequestBody,
): Promise<TopazVideoCreated> {
  const res = await fetch(`${TOPAZ_BASE_URL}/video/express`, {
    method: 'POST',
    headers: headers(apiKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new TopazApiError(res.status, errorMessage(payload, `topaz ${res.status}`), payload);
  }
  const requestId = payload.requestId ?? payload.request_id;
  if (typeof requestId !== 'string' || !requestId) {
    throw new TopazApiError(502, 'topaz returned no requestId', payload);
  }
  return {
    requestId,
    uploadUrls: Array.isArray(payload.uploadUrls) ? (payload.uploadUrls as string[]) : undefined,
    estimates: (payload.estimates as TopazVideoCreated['estimates']) ?? undefined,
  };
}

/** Single-URL upload used when Topaz could not fetch the source itself. */
export async function uploadTopazVideo(uploadUrl: string, bytes: ArrayBuffer, contentType = 'video/mp4') {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  if (!res.ok) {
    throw new TopazApiError(res.status, `topaz upload failed (${res.status})`);
  }
}

export interface TopazVideoStatus {
  status: string;
  message?: string;
  errorCode?: string;
  progress?: number;
  estimates?: { cost?: number[]; time?: number[] };
  outputSize?: string | number;
  download?: { url?: string; expiresAt?: string };
  raw: Record<string, unknown>;
}

export async function getTopazVideoStatus(apiKey: string, requestId: string): Promise<TopazVideoStatus> {
  const res = await fetch(`${TOPAZ_BASE_URL}/video/${requestId}/status`, {
    headers: headers(apiKey),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new TopazApiError(res.status, errorMessage(payload, `topaz ${res.status}`), payload);
  }
  return {
    status: String(payload.status ?? 'unknown'),
    message: typeof payload.message === 'string' ? payload.message : undefined,
    errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
    progress: typeof payload.progress === 'number' ? payload.progress : undefined,
    estimates: (payload.estimates as TopazVideoStatus['estimates']) ?? undefined,
    outputSize: (payload.outputSize as string | number | undefined) ?? undefined,
    download: (payload.download as TopazVideoStatus['download']) ?? undefined,
    raw: payload,
  };
}

export async function cancelTopazVideoRequest(apiKey: string, requestId: string): Promise<void> {
  await fetch(`${TOPAZ_BASE_URL}/video/${requestId}/cancel`, {
    method: 'PATCH',
    headers: headers(apiKey),
  });
}

/** Signed output URL of a finished request, if Topaz already issued one. */
export function topazDownloadUrl(status: TopazVideoStatus): string | null {
  const direct = status.download?.url;
  if (typeof direct === 'string' && direct) return direct;
  const raw = status.raw as Record<string, unknown>;
  const flat = raw.downloadUrl ?? raw.url;
  return typeof flat === 'string' && flat ? flat : null;
}

export type TopazTerminalState = 'complete' | 'failed' | 'canceled' | 'pending';

/** Maps every documented request status onto the three outcomes we act on. */
export function topazVideoOutcome(status: string): TopazTerminalState {
  const value = status.toLowerCase();
  if (value === 'complete' || value === 'completed') return 'complete';
  if (value === 'failed') return 'failed';
  if (value === 'canceled' || value === 'cancelled') return 'canceled';
  return 'pending';
}

/**
 * Billed credits of a request. Topaz reports `estimates.cost` as
 * [lower, upper]; the LOWER bound is what is billed.
 */
export function topazBilledCredits(estimates?: { cost?: number[] }): number | undefined {
  const cost = estimates?.cost;
  if (!Array.isArray(cost) || cost.length === 0) return undefined;
  const lower = Number(cost[0]);
  return Number.isFinite(lower) && lower >= 0 ? lower : undefined;
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

/** Intent endpoints of the image API we use today. */
export type TopazImageIntent = 'enhance' | 'restore-gen' | 'lighting' | 'denoise' | 'sharpen';

export async function submitTopazImage(params: {
  apiKey: string;
  intent: TopazImageIntent;
  fields: Record<string, string>;
  bytes: ArrayBuffer;
  filename: string;
  contentType: string;
}): Promise<string> {
  const form = new FormData();
  for (const [key, value] of Object.entries(params.fields)) form.append(key, value);
  form.append('image', new Blob([params.bytes], { type: params.contentType }), params.filename);

  const res = await fetch(`${TOPAZ_IMAGE_BASE_URL}/${params.intent}/async`, {
    method: 'POST',
    headers: headers(params.apiKey),
    body: form,
  });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new TopazApiError(res.status, errorMessage(payload, `topaz ${res.status}`), payload);
  }
  const processId = payload.process_id ?? payload.processId;
  if (typeof processId !== 'string' || !processId) {
    throw new TopazApiError(502, 'topaz returned no process_id', payload);
  }
  return processId;
}

export async function getTopazImageStatus(apiKey: string, processId: string): Promise<string> {
  const res = await fetch(`${TOPAZ_IMAGE_BASE_URL}/status/${processId}`, { headers: headers(apiKey) });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new TopazApiError(res.status, errorMessage(payload, `topaz ${res.status}`), payload);
  }
  return String(payload.status ?? 'Unknown');
}

export async function getTopazImageDownloadUrl(apiKey: string, processId: string): Promise<string> {
  const res = await fetch(`${TOPAZ_IMAGE_BASE_URL}/download/${processId}`, { headers: headers(apiKey) });
  const payload = await readJson(res);
  if (!res.ok) {
    throw new TopazApiError(res.status, errorMessage(payload, `topaz ${res.status}`), payload);
  }
  const url = payload.url ?? payload.download_url;
  if (typeof url !== 'string' || !url) throw new TopazApiError(502, 'topaz returned no download url', payload);
  return url;
}

/** Polls one image job to a terminal state. Returns the signed output URL. */
export async function awaitTopazImage(params: {
  apiKey: string;
  processId: string;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  const timeoutMs = params.timeoutMs ?? 240_000;
  const intervalMs = params.intervalMs ?? 2_000;
  const sleep = params.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getTopazImageStatus(params.apiKey, params.processId);
    const value = status.toLowerCase();
    if (value === 'completed' || value === 'complete') {
      return await getTopazImageDownloadUrl(params.apiKey, params.processId);
    }
    if (value === 'failed' || value === 'cancelled' || value === 'canceled') {
      throw new TopazApiError(502, `topaz image job ${status}`);
    }
    await sleep(intervalMs);
  }
  throw new TopazApiError(504, 'topaz image job timed out');
}

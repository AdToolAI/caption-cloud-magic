/**
 * Pure state machine for TikTok `post/publish/status/fetch/` polling.
 * No runtime dependencies — unit testable from Node/vitest.
 */

export type TikTokPublishState =
  | 'published'
  | 'processing'
  | 'failed'
  | 'rate_limited'
  | 'unknown';

export interface TikTokStatusClassification {
  state: TikTokPublishState;
  /** TikTok's raw status string, for logging only. */
  status?: string;
  /** Reason/fail code from TikTok, when present. */
  reason?: string;
  /** Public post id, once TikTok exposes it. */
  publiclyAvailablePostId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const RATE_LIMIT_CODES = new Set([
  'rate_limit_exceeded',
  'spam_risk_too_many_posts',
  'spam_risk_user_banned_from_posting',
  'reached_active_user_cap',
]);

/**
 * Classify one `status/fetch/` response body (or an HTTP-level rate limit).
 * `httpStatus` lets callers pass 429 without a parsable body.
 */
export function classifyTikTokPublishStatus(
  raw: unknown,
  httpStatus?: number,
): TikTokStatusClassification {
  if (httpStatus === 429) return { state: 'rate_limited' };
  if (!isRecord(raw)) return { state: 'unknown' };

  const error = isRecord(raw.error) ? raw.error : null;
  const errorCode = error && typeof error.code === 'string' ? error.code : '';
  if (errorCode && errorCode.toLowerCase() !== 'ok') {
    if (RATE_LIMIT_CODES.has(errorCode)) return { state: 'rate_limited', reason: errorCode };
    return { state: 'failed', reason: errorCode };
  }

  const data = isRecord(raw.data) ? raw.data : {};
  const status = typeof data.status === 'string' ? data.status : undefined;
  const failReason = typeof data.fail_reason === 'string' ? data.fail_reason : undefined;
  const postId = Array.isArray(data.publicaly_available_post_id)
    ? String(data.publicaly_available_post_id[0])
    : Array.isArray((data as Record<string, unknown>).publicly_available_post_id)
      ? String(((data as Record<string, unknown>).publicly_available_post_id as unknown[])[0])
      : undefined;

  switch (status) {
    case 'PUBLISH_COMPLETE':
    case 'SEND_TO_USER_INBOX':
      return { state: 'published', status, publiclyAvailablePostId: postId };
    case 'FAILED':
      return { state: 'failed', status, reason: failReason };
    case 'PROCESSING_UPLOAD':
    case 'PROCESSING_DOWNLOAD':
    case 'PUBLISH_PROCESSING':
    case 'PROCESSING':
    case 'DOWNLOAD_IN_PROGRESS':
      return { state: 'processing', status };
    default:
      return status ? { state: 'processing', status } : { state: 'unknown' };
  }
}

/** Bounded exponential backoff with a hard ceiling (ms). */
export function tiktokPollDelayMs(attempt: number, rateLimited = false): number {
  const base = rateLimited ? 15000 : 3000;
  const ceiling = rateLimited ? 60000 : 20000;
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(ceiling, base * Math.pow(2, Math.min(safeAttempt, 5)));
}

export const TIKTOK_POLL_MAX_MS = 5 * 60 * 1000;

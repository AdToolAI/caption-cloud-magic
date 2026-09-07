/**
 * One shared shape for everything the customer sees in the video history.
 *
 * A generated video and an upscaled ("enhanced") video are produced by two
 * different pipelines, but for the customer they are the same thing: a video
 * they ordered, that is either running, finished or not finished. This module
 * turns both source rows into one item type so the history can never show one
 * kind and silently swallow the other.
 *
 * Pure mapping only — no fetching, no formatting decisions beyond the status
 * vocabulary the surfaces already use.
 */

export type VideoHistoryStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type VideoHistoryKind = 'generation' | 'enhancement';

export interface VideoHistoryItem {
  id: string;
  kind: VideoHistoryKind;
  /** Prompt for a generation; a short description of the job for an upscale. */
  title: string;
  /** Engine that produced (or is producing) the video. */
  model: string;
  status: VideoHistoryStatus;
  /** Detailed engine status, used for a precise "what is happening" line. */
  rawStatus: string;
  videoUrl: string | null;
  errorMessage: string | null;
  durationSeconds: number;
  costEuros: number;
  createdAt: string;
  /** Only for enhancements: where a failure happened. */
  failureStage?: 'provider' | 'persist' | null;
}

/** Row shape of `ai_video_generations` as the history reads it. */
export interface GenerationRow {
  id: string;
  prompt: string;
  model: string;
  status: string;
  video_url: string | null;
  error_message: string | null;
  duration_seconds: number | null;
  total_cost_euros: number | null;
  created_at: string;
}

/** Row shape of `video_enhance_runs` as the history reads it. */
export interface EnhanceRunRowLike {
  id: string;
  model_id: string;
  status: string;
  output_url: string | null;
  error_message: string | null;
  source_duration_seconds?: number | null;
  user_price_eur?: number | string | null;
  created_at: string;
  failure_stage?: string | null;
}

/**
 * Enhance statuses mapped onto the four states the history speaks.
 *
 * Everything between "ordered" and "delivered" is `processing` — including the
 * saving phase. A run whose file is still being stored is NOT finished and
 * must never be presented as failed.
 */
const ENHANCE_STATUS: Record<string, VideoHistoryStatus> = {
  created: 'pending',
  credits_reserved: 'pending',
  provider_submitting: 'processing',
  provider_submitted: 'processing',
  provider_processing: 'processing',
  provider_output_ready: 'processing',
  asset_staging: 'processing',
  asset_persisting: 'processing',
  asset_persist_failed: 'processing',
  local_poll_timeout: 'processing',
  cancel_requested: 'processing',
  manual_review: 'processing',
  completed: 'completed',
  provider_failed: 'failed',
  provider_cancelled_confirmed: 'failed',
};

export function generationToHistoryItem(row: GenerationRow): VideoHistoryItem {
  const status: VideoHistoryStatus =
    row.status === 'completed' || row.status === 'failed' || row.status === 'pending'
      ? row.status
      : 'processing';
  return {
    id: row.id,
    kind: 'generation',
    title: row.prompt,
    model: row.model,
    status,
    rawStatus: row.status,
    videoUrl: row.video_url,
    errorMessage: row.error_message,
    durationSeconds: row.duration_seconds ?? 0,
    costEuros: Number(row.total_cost_euros ?? 0),
    createdAt: row.created_at,
  };
}

export function enhanceRunToHistoryItem(
  row: EnhanceRunRowLike,
  title: string,
): VideoHistoryItem {
  return {
    id: row.id,
    kind: 'enhancement',
    title,
    model: row.model_id,
    status: ENHANCE_STATUS[row.status] ?? 'processing',
    rawStatus: row.status,
    videoUrl: row.output_url,
    errorMessage: row.error_message,
    durationSeconds: Math.round(Number(row.source_duration_seconds ?? 0)),
    costEuros: Number(row.user_price_eur ?? 0),
    createdAt: row.created_at,
    failureStage: (row.failure_stage as 'provider' | 'persist' | null) ?? null,
  };
}

/** Newest first, across both pipelines. */
export function mergeHistory(items: VideoHistoryItem[]): VideoHistoryItem[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

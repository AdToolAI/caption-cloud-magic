/**
 * Unified run lifecycle for every Picture Studio run.
 *
 *  created -> credits_reserved -> submitted -> processing
 *          -> provider_output_ready -> asset_persisting -> completed
 *
 *  provider_failed      -> credits_refunded
 *  asset_persist_failed -> retry persistence; refund only when the output is
 *                          definitively unrecoverable.
 */

export type PictureRunState =
  | 'created'
  | 'credits_reserved'
  | 'submitted'
  | 'processing'
  | 'provider_output_ready'
  | 'asset_persisting'
  | 'completed'
  | 'provider_failed'
  | 'asset_persist_failed'
  | 'credits_refunded';

export const PICTURE_RUN_FLOW: PictureRunState[] = [
  'created',
  'credits_reserved',
  'submitted',
  'processing',
  'provider_output_ready',
  'asset_persisting',
  'completed',
];

export const MAX_PERSIST_ATTEMPTS = 3;

export interface PictureRun {
  id: string;
  modelId: string;
  state: PictureRunState;
  persistAttempts: number;
  refunded: boolean;
  outputUrl?: string;
  errorCode?: string;
}

export function createRun(id: string, modelId: string): PictureRun {
  return { id, modelId, state: 'created', persistAttempts: 0, refunded: false };
}

/** A provider failure always refunds. */
export function markProviderFailed(run: PictureRun, errorCode?: string): PictureRun {
  if (run.refunded) return { ...run, state: 'provider_failed', errorCode };
  return { ...run, state: 'credits_refunded', refunded: true, errorCode };
}

/**
 * A persistence failure does NOT refund while the provider output is still
 * recoverable — we already paid the provider and the image exists.
 */
export function markPersistFailed(run: PictureRun, errorCode?: string): PictureRun {
  const attempts = run.persistAttempts + 1;
  const exhausted = attempts >= MAX_PERSIST_ATTEMPTS;
  if (!exhausted) {
    return { ...run, state: 'asset_persist_failed', persistAttempts: attempts, errorCode };
  }
  if (run.refunded) {
    return { ...run, state: 'asset_persist_failed', persistAttempts: attempts, errorCode };
  }
  return {
    ...run,
    state: 'credits_refunded',
    persistAttempts: attempts,
    refunded: true,
    errorCode,
  };
}

export function canRetryPersistence(run: PictureRun): boolean {
  return run.state === 'asset_persist_failed' && run.persistAttempts < MAX_PERSIST_ATTEMPTS;
}

export function isTerminal(run: PictureRun): boolean {
  return run.state === 'completed' || run.state === 'credits_refunded';
}

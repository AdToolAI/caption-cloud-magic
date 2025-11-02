/**
 * Timeout utilities for Edge Functions
 * Prevents long-running operations from blocking
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    fn,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(errorMessage || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}

/**
 * Execute function with timeout and fallback to queue
 */
export async function withTimeoutOrQueue<T>(
  fn: Promise<T>,
  timeoutMs: number,
  queueFallback: () => Promise<{ queued: true; job_id: string }>
): Promise<T | { queued: true; job_id: string }> {
  try {
    return await withTimeout(fn, timeoutMs);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.log('[Timeout] Operation timed out, falling back to queue');
      return await queueFallback();
    }
    throw error;
  }
}
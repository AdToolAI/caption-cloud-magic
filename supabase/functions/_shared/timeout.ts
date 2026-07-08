// Shared timeout utilities for AI edge functions
//
// Purpose: prevent long-running external calls (Replicate, AI Gateway,
// third-party APIs) from hanging until the Deno runtime kills the
// function without giving us a chance to refund credits or return a
// clean error to the client.
//
// Two helpers:
//   - withTimeout(promise, ms, label) — for SDK calls that return a
//     Promise (e.g. `replicate.predictions.create`). Throws a
//     TimeoutError after `ms` ms.
//   - fetchWithTimeout(url, init, ms) — drop-in `fetch` replacement
//     that aborts the request via AbortController when `ms` elapses.
//
// Both throw `TimeoutError` (subclass of Error) so callers can detect
// the timeout branch and issue a credit refund.

export class TimeoutError extends Error {
  constructor(public label: string, public timeoutMs: number) {
    super(`[timeout] ${label} exceeded ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new TimeoutError(label, timeoutMs));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 60_000,
  label = 'fetch',
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new TimeoutError(label, timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function isTimeoutError(e: unknown): e is TimeoutError {
  return e instanceof TimeoutError || (e as any)?.name === 'TimeoutError';
}

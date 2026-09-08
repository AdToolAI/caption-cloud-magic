/**
 * Classification of RAW provider failure text.
 *
 * The provider speaks in its own vocabulary. Topaz answers a request that its
 * own account cannot pay for with `INSUFFICIENT_CREDITS` — a sentence about
 * OUR provider account that, shown verbatim, reads to the customer as if THEIR
 * wallet were empty. It never is: our wallet check ran before the job was
 * submitted and the reservation is released in full on failure.
 *
 * So: the raw text is classified once, here, and stored as a machine-readable
 * code plus a neutral internal message. Customer wording lives in the frontend
 * (`src/lib/videoEnhance/engineErrors.ts`), keyed by that code.
 */

/** Provider account (ours) is out of funds — never the customer's balance. */
export const PROVIDER_ACCOUNT_CREDITS = 'PROVIDER_ACCOUNT_CREDITS';

export interface ProviderFailureVerdict {
  code: string;
  /** Internal, non-customer-facing message stored on the run. */
  message: string;
  /** True when the whole engine is down for everyone, not just this job. */
  outage: boolean;
}

export function classifyProviderFailure(
  raw: string | null | undefined,
  fallbackCode = 'PROVIDER_FAILED',
): ProviderFailureVerdict {
  const text = String(raw ?? '').trim();
  const lower = text.toLowerCase();
  const noCredits =
    lower.includes('insufficient_credits') ||
    (lower.includes('insufficient') && lower.includes('credit')) ||
    lower.includes('not enough credits') ||
    lower.includes('quota exceeded') ||
    lower.includes('payment required');

  if (noCredits) {
    return {
      code: PROVIDER_ACCOUNT_CREDITS,
      message: `provider account has no credits (raw: ${text.slice(0, 200)})`,
      outage: true,
    };
  }
  return { code: fallbackCode, message: text || 'provider failed', outage: false };
}

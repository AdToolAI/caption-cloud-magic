/**
 * ONE provider read for Video Enhance, normalised to the Replicate prediction
 * shape the rest of the engine understands.
 *
 * Shared on purpose: the reconciler (every 5 minutes) and the customer's own
 * status poll (every few seconds) must reach exactly the same verdict about a
 * run. A provider failure is therefore noticed as soon as somebody looks,
 * instead of waiting for the next scheduled cycle — which is what made a
 * refund arrive nearly two hours late.
 *
 * Topaz runs are marked by a `topaz:` prefix on the stored provider id and are
 * read from the DIRECT Topaz API; their billed credits are mapped onto
 * `metrics.units`.
 */

import {
  getTopazVideoStatus,
  topazBilledCredits,
  topazDownloadUrl,
  topazVideoOutcome,
} from './topaz-client.ts';

export interface ProviderPrediction {
  status: string;
  output: string | null;
  outputExpiresAt: string | null;
  error: string | null;
  // deno-lint-ignore no-explicit-any
  metrics: any;
}

export async function readProviderPrediction(
  providerId: string,
  keys: { replicate?: string; topaz?: string },
  tag = '[video-enhance]',
): Promise<ProviderPrediction | null> {
  if (providerId.startsWith('topaz:')) {
    if (!keys.topaz) return null;
    try {
      const status = await getTopazVideoStatus(keys.topaz, providerId.slice('topaz:'.length));
      const outcome = topazVideoOutcome(status.status);
      const credits = topazBilledCredits(status.estimates);
      return {
        status: outcome === 'complete' ? 'succeeded' : outcome === 'canceled' ? 'canceled' : outcome,
        output: topazDownloadUrl(status),
        outputExpiresAt: status.download?.expiresAt ?? null,
        error: status.errorCode ?? status.message ?? null,
        metrics: credits !== undefined ? { units: credits } : {},
      };
    } catch (error) {
      console.error(`${tag} topaz read failed for ${providerId}:`, error);
      return null;
    }
  }
  if (!keys.replicate) return null;
  const res = await fetch(`https://api.replicate.com/v1/predictions/${providerId}`, {
    headers: { Authorization: `Bearer ${keys.replicate}` },
  });
  if (!res.ok) {
    console.error(`${tag} provider read failed [${res.status}] for ${providerId}`);
    return null;
  }
  const body = await res.json();
  return {
    status: String(body.status ?? ''),
    output:
      typeof body.output === 'string'
        ? body.output
        : Array.isArray(body.output) && typeof body.output[0] === 'string'
          ? body.output[0]
          : typeof body.output?.url === 'string'
            ? body.output.url
            : null,
    outputExpiresAt: null,
    error: body.error ? String(body.error) : null,
    metrics: body.metrics ?? {},
  };
}

/**
 * Fresh download link for a provider result whose stored URL expired.
 * Only Topaz can mint a new one; a Replicate output URL is static, so `null`
 * there correctly means "nothing left to recover".
 */
export async function refreshProviderOutputUrl(
  providerId: string | null | undefined,
  keys: { replicate?: string; topaz?: string },
): Promise<string | null> {
  if (!providerId?.startsWith('topaz:') || !keys.topaz) return null;
  try {
    const status = await getTopazVideoStatus(keys.topaz, providerId.slice('topaz:'.length));
    return topazDownloadUrl(status) ?? null;
  } catch {
    return null;
  }
}

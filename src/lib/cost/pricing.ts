/**
 * Estimated provider pricing in USD.
 * These are public/documented averages — actual costs may vary.
 * Used by the Cost Monitor to project Cloud spend against the $25/mo free tier.
 */

export type ProviderKey =
  | 'replicate'
  | 'gemini'
  | 'elevenlabs'
  | 'openai'
  | 'lovable-ai'
  | 'aws-lambda'
  | 'resend'
  | 'stripe';

export const PROVIDER_PRICING_USD: Record<ProviderKey, { perCall?: number; perMinute?: number; perEmail?: number; note: string }> = {
  replicate:    { perCall: 0.0017,   note: 'Avg per Replicate prediction' },
  gemini:       { perCall: 0.0005,   note: 'Gemini 2.5 Flash avg' },
  elevenlabs:   { perCall: 0.003,    note: 'TTS avg per call' },
  openai:       { perCall: 0.0015,   note: 'GPT-5 mini avg' },
  'lovable-ai': { perCall: 0.001,    note: 'Lovable AI Gateway avg' },
  'aws-lambda': { perMinute: 0.0167, note: 'Lambda 3008 MB' },
  resend:       { perEmail: 0.0004,  note: 'Resend per email' },
  stripe:       { perCall: 0,        note: 'No per-call cost' },
};

export const FREE_TIERS = {
  cloudBalanceUSD: 25,
  aiBalanceUSD: 1,
  lambdaConcurrent: 3,
};

export function estimateProviderCostUSD(provider: string, calls: number): number {
  const cfg = PROVIDER_PRICING_USD[provider as ProviderKey];
  if (!cfg?.perCall) return 0;
  return calls * cfg.perCall;
}

export function estimateLambdaCostUSD(totalSeconds: number): number {
  return (totalSeconds / 60) * (PROVIDER_PRICING_USD['aws-lambda'].perMinute ?? 0);
}

export function estimateEmailCostUSD(emailCount: number): number {
  return emailCount * (PROVIDER_PRICING_USD.resend.perEmail ?? 0);
}

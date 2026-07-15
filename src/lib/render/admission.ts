/**
 * describeRenderAdmissionError — parses a 429 `RENDER_SLOT_BUSY` response from
 * `render-with-remotion` / `render-directors-cut` and returns a user-friendly
 * toast message. Falls back to `null` if the payload is not an admission error,
 * so callers can rethrow.
 *
 * Non-founders hitting the reserve band get a gentler nudge that also mentions
 * the Founders benefit — a natural upgrade prompt.
 */
export interface RenderAdmissionInfo {
  message: string;
  reason: 'slot_budget_exhausted' | 'founder_reserve';
  retryAfterSeconds: number;
  foundersOnly: boolean;
}

export function describeRenderAdmissionError(raw: unknown): RenderAdmissionInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.error !== 'RENDER_SLOT_BUSY') return null;

  const reason = (r.reason as string) === 'founder_reserve' ? 'founder_reserve' : 'slot_budget_exhausted';
  const retry = Number(r.retry_after_seconds ?? 30);
  const foundersOnly = !!r.founders_only;

  const wait = retry >= 60 ? `${Math.round(retry / 60)} min` : `${retry}s`;

  const message =
    reason === 'founder_reserve'
      ? `Render-Slots gerade voll. Bitte ~${wait} warten — Founders erhalten Vorrang.`
      : `Alle Render-Slots sind gerade belegt. Bitte in ~${wait} noch einmal versuchen.`;

  return { message, reason, retryAfterSeconds: retry, foundersOnly };
}

/**
 * Attempt to unwrap a Supabase `FunctionsHttpError` into the parsed admission
 * payload. supabase.functions.invoke throws with `context.body` (a ReadableStream)
 * when status !== 2xx; we read + parse it once.
 */
export async function tryParseAdmissionFromInvokeError(err: unknown): Promise<RenderAdmissionInfo | null> {
  try {
    const ctx: any = (err as any)?.context;
    if (!ctx) return null;
    if (typeof ctx.json === 'function') {
      const body = await ctx.json();
      return describeRenderAdmissionError(body);
    }
    if (typeof ctx.text === 'function') {
      const text = await ctx.text();
      try { return describeRenderAdmissionError(JSON.parse(text)); } catch { return null; }
    }
  } catch { /* ignore */ }
  return null;
}

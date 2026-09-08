/**
 * supabase.functions.invoke() rejects non-2xx responses with a
 * FunctionsHttpError whose `message` is always the useless
 * "Edge Function returned a non-2xx status code" — the real reason sits in
 * the (still unread) Response on `error.context`.
 *
 * `extractEdgeErrorMessage()` reads that body once and returns the provider
 * message, so the UI can classify and translate it instead of showing a raw
 * status-code string.
 */

/**
 * Reads the JSON body of a FunctionsHttpError (if any) so callers can react
 * to structured fields such as `rejectedReferenceIndex`. Returns `null` when
 * the body is missing or not JSON.
 */
export async function extractEdgeErrorPayload(err: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (err as { context?: unknown } | null | undefined)?.context as Response | undefined;
  if (!ctx || typeof (ctx as Response).text !== 'function') return null;
  try {
    const text = await ctx.clone().text();
    if (!text) return null;
    const json = JSON.parse(text);
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function extractEdgeErrorMessage(err: unknown): Promise<string> {
  const anyErr = err as { message?: string; context?: unknown } | null | undefined;
  const fallback = anyErr?.message || '';

  const ctx = anyErr?.context as Response | undefined;
  if (!ctx || typeof (ctx as Response).text !== 'function') return fallback;

  try {
    const text = await ctx.clone().text();
    if (!text) return fallback;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        (typeof json.error === 'string' && json.error) ||
        (typeof json.message === 'string' && json.message) ||
        (json.error &&
          typeof json.error === 'object' &&
          typeof (json.error as { message?: unknown }).message === 'string' &&
          (json.error as { message: string }).message) ||
        '';
      return candidate || text.slice(0, 500) || fallback;
    } catch {
      return text.slice(0, 500) || fallback;
    }
  } catch {
    return fallback;
  }
}

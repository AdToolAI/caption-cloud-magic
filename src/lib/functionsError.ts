/**
 * Extracts the real error message from a supabase.functions.invoke error.
 * supabase-js returns FunctionsHttpError where the actual server-side message
 * is inside `error.context` (a Response object), NOT in `error.message`
 * (which is the generic "Edge Function returned a non-2xx status code").
 */
export interface FunctionsErrorDetails {
  message: string;
  status?: number;
  body?: unknown;
  rawBody?: string;
}

export async function extractFunctionsErrorDetails(err: unknown): Promise<FunctionsErrorDetails> {
  if (!err) return { message: 'Unknown error' };
  const anyErr = err as any;

  // Try to read the response body if present (FunctionsHttpError.context).
  const ctx = anyErr?.context;
  if (ctx && typeof ctx === 'object') {
    try {
      // Clone before reading — body can only be consumed once.
      const cloned = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      const text = await cloned.text?.();
      if (text) {
        try {
          const json = JSON.parse(text);
          const msg =
            json?.error ||
            json?.message ||
            (typeof json?.details === 'string' ? json.details : null);
          if (msg) {
            const stage = json?.stage ? ` [${json.stage}]` : '';
            const code = json?.code && json.code !== msg ? ` (${json.code})` : '';
            return {
              message: `${msg}${code}${stage}`,
              status: ctx.status,
              body: json,
              rawBody: text,
            };
          }
          return {
            message: anyErr?.message ?? 'Edge Function error',
            status: ctx.status,
            body: json,
            rawBody: text,
          };
        } catch {
          // Not JSON — return raw text trimmed.
          if (text.length < 500) return { message: text, status: ctx.status, rawBody: text };
        }
      }
    } catch {
      // ignore — fall through
    }
  }

  if (typeof anyErr?.message === 'string' && anyErr.message) return { message: anyErr.message };
  return { message: String(err) };
}

export async function extractFunctionsError(err: unknown): Promise<string> {
  return (await extractFunctionsErrorDetails(err)).message;
}

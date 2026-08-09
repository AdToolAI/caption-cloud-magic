import { supabase } from '@/integrations/supabase/client';
import { getLang } from '@/lib/i18nText';

/**
 * Sends the active UI language to every edge function as `x-app-lang`, so the
 * backend can answer with localized error messages instead of German-only text.
 * Installed once at app startup.
 */
let installed = false;

export function installFunctionsLangHeader() {
  if (installed) return;
  installed = true;

  const fns = supabase.functions as unknown as {
    invoke: (name: string, options?: Record<string, any>) => Promise<any>;
  };
  const original = fns.invoke.bind(supabase.functions);

  fns.invoke = (name: string, options: Record<string, any> = {}) =>
    original(name, {
      ...options,
      headers: { 'x-app-lang': getLang(), ...(options.headers ?? {}) },
    });
}

/**
 * useAutoTranslateEn — debounced auto-translation to English.
 *
 * Used by the Composer's Scene-Action and per-Character-Action fields so the
 * user can type in their UI language while the provider always sees natural
 * cinematic English. Results are cached server-side per `(text, sourceLang)`
 * so live-typing + render-time reads do not double-bill the gateway.
 *
 * If `sourceLang === 'en'` the hook short-circuits and returns the input
 * verbatim — no network call.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

export type TranslateLang = 'en' | 'de' | 'es';

interface State {
  english: string;
  isLoading: boolean;
  error: string | null;
}

export function useAutoTranslateEn(
  text: string,
  sourceLang: TranslateLang,
  opts: { delayMs?: number; enabled?: boolean } = {},
): State {
  const { delayMs = 500, enabled = true } = opts;
  const debounced = useDebounce(text, delayMs);
  const [state, setState] = useState<State>({
    english: sourceLang === 'en' ? text : '',
    isLoading: false,
    error: null,
  });
  const reqIdRef = useRef(0);

  useEffect(() => {
    const trimmed = (debounced ?? '').trim();
    if (!enabled) return;

    if (!trimmed) {
      setState({ english: '', isLoading: false, error: null });
      return;
    }
    if (sourceLang === 'en') {
      setState({ english: trimmed, isLoading: false, error: null });
      return;
    }

    const myId = ++reqIdRef.current;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('translate-to-english', {
          body: { text: trimmed, sourceLang },
        });
        if (myId !== reqIdRef.current) return; // a newer call superseded
        if (error) throw error;
        const english = String((data as any)?.english ?? trimmed);
        setState({ english, isLoading: false, error: null });
      } catch (e: any) {
        if (myId !== reqIdRef.current) return;
        // Fallback: use the source text so the render pipeline never breaks.
        setState({
          english: trimmed,
          isLoading: false,
          error: e?.message ?? 'translation failed',
        });
      }
    })();
  }, [debounced, sourceLang, enabled]);

  return state;
}

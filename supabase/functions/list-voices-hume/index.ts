// supabase/functions/list-voices-hume/index.ts
// Returns the live Hume Voice Library (provider=HUME_AI) so the UI never
// references stale or non-existent voice names.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface HumeVoice {
  id: string;
  name: string;
  provider: 'HUME_AI' | 'CUSTOM_VOICE';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');
    if (!HUME_API_KEY) throw new Error('HUME_API_KEY not configured');

    const url = new URL(req.url);
    const provider = (url.searchParams.get('provider') || 'HUME_AI') as 'HUME_AI' | 'CUSTOM_VOICE';

    const voices: HumeVoice[] = [];
    let pageToken: string | null = null;
    let pages = 0;

    do {
      const qs = new URLSearchParams({ provider, page_size: '100' });
      if (pageToken) qs.set('page_token', pageToken);

      const res = await fetch(`https://api.hume.ai/v0/tts/voices?${qs.toString()}`, {
        headers: { 'X-Hume-Api-Key': HUME_API_KEY, Accept: 'application/json' },
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[list-voices-hume] Hume error', res.status, err);
        throw new Error(`Hume ${res.status}: ${err.slice(0, 300)}`);
      }

      const json = await res.json();
      const items = (json.voices_page || json.voices || json.data || []) as any[];
      for (const v of items) {
        if (v?.name) voices.push({ id: v.id ?? v.name, name: v.name, provider });
      }
      pageToken = json.page_number !== undefined && items.length === 100
        ? String((json.page_number ?? 0) + 1)
        : (json.next_page_token ?? null);
      pages++;
    } while (pageToken && pages < 20);

    return new Response(JSON.stringify({ voices }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[list-voices-hume] error', err);
    return new Response(JSON.stringify({ error: err?.message || String(err), voices: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

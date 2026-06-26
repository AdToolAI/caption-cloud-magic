// supabase/functions/list-voices-hume/index.ts
// Returns the live Hume Voice Library (provider=HUME_AI by default) so the UI
// never references stale or non-existent voice names.
//
// Hume API: GET /v0/tts/voices?provider=HUME_AI&page_number=N&page_size=100
// Response: { page_number, page_size, total_pages, voices_page: [{id,name,provider}] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
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
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "list-voices-hume" });
  }
  try {
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');
    if (!HUME_API_KEY) throw new Error('HUME_API_KEY not configured');

    const url = new URL(req.url);
    const provider = (url.searchParams.get('provider') || 'HUME_AI') as 'HUME_AI' | 'CUSTOM_VOICE';

    const voices: HumeVoice[] = [];
    let pageNumber = 0;
    let totalPages = 1;

    while (pageNumber < totalPages && pageNumber < 20) {
      const qs = new URLSearchParams({
        provider,
        page_number: String(pageNumber),
        page_size: '100',
      });
      const res = await fetch(`https://api.hume.ai/v0/tts/voices?${qs.toString()}`, {
        headers: { 'X-Hume-Api-Key': HUME_API_KEY, Accept: 'application/json' },
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('[list-voices-hume] Hume error', res.status, err);
        throw new Error(`Hume ${res.status}: ${err.slice(0, 300)}`);
      }
      const json = await res.json();
      const items = (json.voices_page || []) as any[];
      for (const v of items) {
        if (v?.name) voices.push({ id: v.id ?? v.name, name: v.name, provider });
      }
      totalPages = Number(json.total_pages ?? 1);
      pageNumber++;
    }

    console.log(`[list-voices-hume] returning ${voices.length} voices (provider=${provider})`);
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

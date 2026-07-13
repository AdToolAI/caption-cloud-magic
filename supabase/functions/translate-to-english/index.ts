// translate-to-english — tiny Gemini-Flash wrapper with 24h cache.
//
// Used by the Composer's Scene-Action and per-Character-Action fields so the
// user can write in their UI language while the provider always sees clean
// cinematic English. Result is cached per (text, sourceLang) so live typing +
// later render do not pay twice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type Lang = 'en' | 'de' | 'es';

interface Body {
  text: string;
  sourceLang: Lang;
}

async function sha1(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function translateViaGateway(text: string, sourceLang: Lang): Promise<string> {
  const langWord = sourceLang === 'de' ? 'German' : sourceLang === 'es' ? 'Spanish' : 'English';
  const sys =
    `You translate short cinematic scene-action descriptions from ${langWord} to natural cinematic English. ` +
    `Keep proper nouns (character names, places, products) exactly as written. ` +
    `Use present-continuous when the source describes ongoing action. ` +
    `Output ONLY the translated sentence(s), no quotes, no preface, no explanation.`;
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: text },
      ],
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${t.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const out = json?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!out) throw new Error('empty translation');
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "translate-to-english" });


  try {
    // Auth check — keep this user-scoped to prevent anon abuse.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    const text = (body?.text ?? '').trim();
    const sourceLang: Lang = (body?.sourceLang ?? 'en') as Lang;

    if (!text) {
      return new Response(JSON.stringify({ english: '', cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Short-circuit: source already English.
    if (sourceLang === 'en') {
      return new Response(JSON.stringify({ english: text, cached: false, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client for cache read/write.
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const key = await sha1(`v1|${sourceLang}|en|${text}`);
    const { data: cached } = await svc
      .from('translation_cache')
      .select('target')
      .eq('hash', key)
      .maybeSingle();
    if (cached?.target) {
      return new Response(JSON.stringify({ english: cached.target, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let english: string;
    try {
      english = await translateViaGateway(text, sourceLang);
    } catch (e: any) {
      if (e.status === 429 || e.status === 402) {
        return new Response(
          JSON.stringify({
            error: e.status === 402 ? 'AI credits exhausted' : 'Rate limited',
            english: text, // safe fallback so the UI keeps working
          }),
          {
            status: e.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
      throw e;
    }

    await svc
      .from('translation_cache')
      .upsert({ hash: key, source_lang: sourceLang, target_lang: 'en', source: text, target: english });

    return new Response(JSON.stringify({ english, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[translate-to-english]', e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

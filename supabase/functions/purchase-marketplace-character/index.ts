import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const CURRENT_BUYER_LICENSE_VERSION = 'buyer-v1-2026-04-29';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { characterId, licenseAccepted } = await req.json();
    if (!characterId || licenseAccepted !== true) {
      return new Response(JSON.stringify({ ok: false, error: 'LICENSE_NOT_ACCEPTED' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const ipHash = ip
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + CURRENT_BUYER_LICENSE_VERSION))))
          .map((b) => b.toString(16).padStart(2, '0')).join('')
      : null;

    const { data, error } = await supabase.rpc('purchase_character', {
      _character_id: characterId,
      _license_version: CURRENT_BUYER_LICENSE_VERSION,
      _license_ip_hash: ipHash,
    });

    if (error) throw error;

    return new Response(JSON.stringify(data ?? { ok: false, error: 'NO_RESULT' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('purchase-marketplace-character', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

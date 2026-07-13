// Public certificate verification — no auth required.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "verify-license-certificate" });


  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return json({ valid: false, error: 'Missing token' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await admin.rpc('verify_license_certificate', { _token: token });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return json({ valid: false });
    }

    return json({
      valid: !row.revoked_at,
      revoked: !!row.revoked_at,
      certificate: row,
    });
  } catch (err) {
    console.error('[verify-license-certificate]', err);
    return json({ valid: false, error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

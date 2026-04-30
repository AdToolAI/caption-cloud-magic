import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Warmup ping early-return
  if (req.method === 'POST') {
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.warmup) {
        return new Response(JSON.stringify({ warmed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } catch (_) { /* ignore */ }
  }

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');
  const env = Deno.env.get('TIKTOK_ENV') || 'production';

  return new Response(
    JSON.stringify({
      hasClientKey: !!clientKey,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      clientKeyPreview: clientKey ? `${clientKey.substring(0, 4)}***${clientKey.substring(clientKey.length - 4)}` : null,
      redirect_uri: redirectUri || null,
      environment: env,
      configured: !!clientKey && !!clientSecret && !!redirectUri,
      note: 'Compare redirect_uri value byte-for-byte with the URI registered in the TikTok Developer Portal (Login Kit). They must match exactly.'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

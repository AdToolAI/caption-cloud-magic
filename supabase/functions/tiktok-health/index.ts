import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');

  return new Response(
    JSON.stringify({
      hasClientKey: !!clientKey,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      clientKeyPreview: clientKey ? `${clientKey.substring(0, 4)}***${clientKey.substring(clientKey.length - 4)}` : null,
      configured: !!clientKey && !!clientSecret && !!redirectUri
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

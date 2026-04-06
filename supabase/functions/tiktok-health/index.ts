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

  // Build a test auth URL to show exactly what would be sent to TikTok
  let testAuthUrl = null;
  if (clientKey && redirectUri) {
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user.info.basic,video.upload,video.publish');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', 'TEST_STATE');
    testAuthUrl = authUrl.toString();
  }

  return new Response(
    JSON.stringify({
      hasClientKey: !!clientKey,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      clientKeyPreview: clientKey ? `${clientKey.substring(0, 4)}***${clientKey.substring(clientKey.length - 4)}` : null,
      redirectUri: redirectUri || null,
      testAuthUrl,
      configured: !!clientKey && !!clientSecret && !!redirectUri
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

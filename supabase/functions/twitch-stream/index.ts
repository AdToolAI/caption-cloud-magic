const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twitch';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const TWITCH_API_KEY = Deno.env.get('TWITCH_API_KEY');
    if (!TWITCH_API_KEY) throw new Error('TWITCH_API_KEY is not configured');

    const { user_login } = await req.json();
    if (!user_login || typeof user_login !== 'string') {
      return new Response(JSON.stringify({ error: 'user_login parameter required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${GATEWAY_URL}/streams?user_login=${encodeURIComponent(user_login)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWITCH_API_KEY,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Twitch API error [${response.status}]: ${errBody}`);
    }

    const data = await response.json();
    
    // Also fetch channel info for offline state
    const channelResponse = await fetch(`${GATEWAY_URL}/search/channels?query=${encodeURIComponent(user_login)}&first=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWITCH_API_KEY,
      },
    });

    let channel = null;
    if (channelResponse.ok) {
      const channelData = await channelResponse.json();
      channel = channelData.data?.find((c: any) => c.broadcaster_login?.toLowerCase() === user_login.toLowerCase()) || null;
    }

    return new Response(JSON.stringify({ ...data, channel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[twitch-stream] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

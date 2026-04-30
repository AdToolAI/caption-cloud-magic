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

    const { broadcaster_id, title, game_id, tags } = await req.json();
    if (!broadcaster_id) {
      return new Response(JSON.stringify({ error: 'broadcaster_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: Record<string, any> = {};
    if (title !== undefined) body.title = title;
    if (game_id !== undefined) body.game_id = game_id;
    if (tags !== undefined) body.tags = tags;

    const response = await fetch(`${GATEWAY_URL}/channels?broadcaster_id=${broadcaster_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWITCH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Twitch API error [${response.status}]: ${errBody}`);
    }

    // PATCH channels returns 204 No Content on success
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[twitch-channel-update] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

    const { broadcaster_id } = await req.json();
    if (!broadcaster_id) {
      return new Response(JSON.stringify({ error: 'broadcaster_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get follower count
    const followersRes = await fetch(`${GATEWAY_URL}/channels/followers?broadcaster_id=${broadcaster_id}&first=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWITCH_API_KEY,
      },
    });

    if (!followersRes.ok) {
      const errBody = await followersRes.text();
      throw new Error(`Twitch API error [${followersRes.status}]: ${errBody}`);
    }

    const followersData = await followersRes.json();

    // Get subscriber count
    const subsRes = await fetch(`${GATEWAY_URL}/subscriptions?broadcaster_id=${broadcaster_id}&first=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWITCH_API_KEY,
      },
    });

    let subsData = { total: 0 };
    if (subsRes.ok) {
      subsData = await subsRes.json();
    } else {
      await subsRes.text(); // consume body
    }

    return new Response(JSON.stringify({
      followers: followersData.total || 0,
      subscribers: subsData.total || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[twitch-followers] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

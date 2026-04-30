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

    const body = await req.json();
    const { action, broadcaster_id } = body;

    if (!broadcaster_id) {
      return new Response(JSON.stringify({ error: 'broadcaster_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let response: Response;

    if (action === 'create') {
      const { start_time, timezone, duration, title, category_id, is_recurring } = body;
      response = await fetch(`${GATEWAY_URL}/schedule/segment?broadcaster_id=${broadcaster_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_time,
          timezone: timezone || 'Europe/Berlin',
          duration: duration || '240',
          title,
          category_id,
          is_recurring: is_recurring || false,
        }),
      });
    } else if (action === 'update') {
      const { segment_id, ...updateData } = body;
      response = await fetch(`${GATEWAY_URL}/schedule/segment?broadcaster_id=${broadcaster_id}&id=${segment_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
    } else if (action === 'delete') {
      const { segment_id } = body;
      response = await fetch(`${GATEWAY_URL}/schedule/segment?broadcaster_id=${broadcaster_id}&id=${segment_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
        },
      });
    } else {
      // Get schedule
      response = await fetch(`${GATEWAY_URL}/schedule?broadcaster_id=${broadcaster_id}&first=20`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
        },
      });
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Twitch API error [${response.status}]: ${errBody}`);
    }

    // Some endpoints return 204
    if (response.status === 204) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[twitch-schedule] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

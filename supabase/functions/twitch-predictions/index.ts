const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      const { title, outcomes, prediction_window } = body;
      response = await fetch(`${GATEWAY_URL}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broadcaster_id,
          title,
          outcomes: outcomes.map((o: string) => ({ title: o })),
          prediction_window: prediction_window || 60,
        }),
      });
    } else if (action === 'end') {
      const { prediction_id, status, winning_outcome_id } = body;
      response = await fetch(`${GATEWAY_URL}/predictions`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TWITCH_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broadcaster_id,
          id: prediction_id,
          status: status || 'RESOLVED',
          winning_outcome_id,
        }),
      });
    } else {
      response = await fetch(`${GATEWAY_URL}/predictions?broadcaster_id=${broadcaster_id}&first=5`, {
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

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[twitch-predictions] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

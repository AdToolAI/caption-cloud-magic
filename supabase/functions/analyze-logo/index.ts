const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const { logoUrl } = await req.json();

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: logoUrl } },
            {
              type: 'text',
              text: `Analysiere dieses Logo und extrahiere als JSON:
{
  "colors": {
    "primary": "<Hauptfarbe in #HEX>",
    "secondary": "<Zweitfarbe in #HEX>",
    "accent": "<Akzentfarbe in #HEX>",
    "palette": ["<Farbe1>", "<Farbe2>", "<Farbe3>"]
  },
  "style": "<modern, minimalistisch, elegant, verspielt, urban, luxuriös>",
  "mood": "<professionell, freundlich, luxuriös, dynamisch>",
  "typography_suggestions": {
    "headline": "<Google Font>",
    "body": "<Google Font>"
  },
  "emotions": ["<Emotion 1>", "<Emotion 2>", "<Emotion 3>"],
  "industry_guess": "<Branche>",
  "character": "<2-3 Sätze>"
}
Nur JSON!`
            }
          ]
        }],
        temperature: 0.6,
      }),
    });

    if (!aiResponse.ok) throw new Error('AI failed');

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Parse failed');
      }
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
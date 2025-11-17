import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MusicRequest {
  mood: string;
  genre?: string;
  duration?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { mood, genre = 'any', duration = 30 }: MusicRequest = await req.json();

    if (!mood) {
      throw new Error('Mood is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Du bist ein Experte für Musik-Kuratierung für Videos. Schlage passende Musik vor basierend auf Stimmung, Genre und Videolänge.`;

    const userPrompt = `Empfehle 3 Musik-Tracks für ein Video mit:
    
Stimmung: ${mood}
Genre: ${genre}
Dauer: ${duration} Sekunden

Die Empfehlungen sollten:
- Zur gewünschten Stimmung passen
- Copyright-frei/lizenziert sein (Shotstack Audio Library)
- Die richtige Energie und Tempo haben

Format: Gib die Empfehlungen in folgendem JSON-Format zurück:
{
  "recommendations": [
    {
      "name": "Track Name",
      "artist": "Artist Name",
      "mood": "energetic/calm/upbeat/etc",
      "shotstack_id": "preview-url-or-id",
      "description": "Kurze Beschreibung warum dieser Track passt"
    }
  ]
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_music',
            description: 'Returns music track recommendations',
            parameters: {
              type: 'object',
              properties: {
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      artist: { type: 'string' },
                      mood: { type: 'string' },
                      shotstack_id: { type: 'string' },
                      description: { type: 'string' }
                    },
                    required: ['name', 'artist', 'mood', 'shotstack_id', 'description'],
                    additionalProperties: false
                  }
                }
              },
              required: ['recommendations'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_music' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      throw new Error('AI generation failed');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No recommendations generated');
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ ok: true, recommendations: result.recommendations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Music suggestion error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

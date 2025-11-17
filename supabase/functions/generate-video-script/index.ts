import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptRequest {
  topic: string;
  duration: number; // in seconds
  tone?: string;
  target_audience?: string;
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

    const { topic, duration, tone = 'professional', target_audience = 'general' }: ScriptRequest = await req.json();

    if (!topic || !duration) {
      throw new Error('Topic and duration are required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Du bist ein Experte für Video-Script-Writing. Erstelle prägnante, fesselnde Video-Scripts die perfekt für Social Media Videos sind.`;

    const userPrompt = `Erstelle ein ${duration}-Sekunden Video-Script zum Thema: "${topic}"
    
Ton: ${tone}
Zielgruppe: ${target_audience}

Das Script sollte:
- Hook: Starke Aufmerksamkeits-Eröffnung (3-5 Sekunden)
- Hauptteil: Kernbotschaft klar vermitteln (${duration - 10} Sekunden)
- Call-to-Action: Klarer Aufruf zum Handeln (3-5 Sekunden)

Format: Gib das Script in folgendem JSON-Format zurück:
{
  "hook": "Starke Eröffnung...",
  "main_content": "Kernbotschaft...",
  "cta": "Call-to-Action...",
  "estimated_duration": ${duration}
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_video_script',
            description: 'Returns a structured video script',
            parameters: {
              type: 'object',
              properties: {
                hook: { type: 'string', description: 'Opening hook (3-5 seconds)' },
                main_content: { type: 'string', description: 'Main message' },
                cta: { type: 'string', description: 'Call to action (3-5 seconds)' },
                estimated_duration: { type: 'number', description: 'Total duration in seconds' }
              },
              required: ['hook', 'main_content', 'cta', 'estimated_duration'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'create_video_script' } }
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
      throw new Error('No script generated');
    }

    const script = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ ok: true, script }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Script generation error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const VISION_PROMPT = `Analyze this location/environment image and extract a structured visual identity card. Return STRICT JSON only.

Schema:
{
  "environment_type": "interior" | "exterior" | "mixed",
  "setting": string (e.g. "modern office", "wheat field", "neon-lit alley"),
  "time_of_day": "dawn" | "day" | "golden_hour" | "blue_hour" | "night" | "n/a",
  "weather": string,
  "lighting": string,
  "color_palette": string[],
  "atmosphere": string (mood/feeling),
  "style_tags": string[],
  "prompt_descriptor": string (single ENGLISH sentence ready to inject into a video prompt, max 220 chars)
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "extract-location-identity" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { image_url } = await req.json();
    if (!image_url || typeof image_url !== 'string') {
      return new Response(JSON.stringify({ error: 'image_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: image_url } },
          ],
        }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'AI extraction failed', detail: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '{}';
    let identity: any = {};
    try {
      identity = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      identity = match ? JSON.parse(match[0]) : {};
    }

    return new Response(JSON.stringify({ identity }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('extract-location-identity error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const VISION_PROMPT = `Analyze this character/person image and extract a structured visual identity card. Return STRICT JSON only, no markdown, no commentary.

Schema:
{
  "character_type": "person" | "mascot" | "avatar" | "creature",
  "gender_presentation": "male" | "female" | "neutral" | "n/a",
  "age_range": "child" | "teen" | "young_adult" | "adult" | "senior" | "n/a",
  "ethnicity_or_style": string (e.g. "caucasian", "asian", "cartoon", "3d-render"),
  "hair": { "color": string, "length": string, "style": string },
  "eyes": { "color": string, "shape": string },
  "facial_features": string (distinguishing marks, beard, glasses, etc.),
  "outfit": { "top": string, "bottom": string, "accessories": string },
  "color_palette": string[] (3-5 dominant colors),
  "style_tags": string[] (e.g. ["professional", "casual", "cinematic"]),
  "prompt_descriptor": string (a single sentence ready to inject into an image/video prompt, max 220 chars, in ENGLISH)
}

Use "n/a" or empty arrays where information cannot be determined. Be precise but concise.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { image_url } = await req.json();
    if (!image_url || typeof image_url !== 'string') {
      return new Response(JSON.stringify({ error: 'image_url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Lovable AI Gateway with Gemini Flash (vision-capable, fast, cheap)
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: image_url } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'AI extraction failed', detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    console.error('extract-character-identity error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

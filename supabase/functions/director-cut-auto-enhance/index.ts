import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { video_url, current_settings } = await req.json();

    if (!video_url) {
      return new Response(JSON.stringify({ error: 'Missing video_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[AutoEnhance] Analyzing video for user ${user.id}`);

    // Call Lovable AI for video analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

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
            role: 'system',
            content: `You are a professional video colorist and post-production expert. 
Analyze video settings and recommend optimal enhancement values.
Return ONLY a JSON object with these fields:
- brightness (50-150, default 100)
- contrast (50-150, default 100)  
- saturation (0-200, default 100)
- sharpness (0-100, default 0)
- temperature (-50 to 50, default 0)
- vignette (0-100, default 0)
- filter (one of: none, cinematic, vintage, warm, cool, dramatic, vibrant, muted, noir)
- reasoning (brief explanation of your choices)`
          },
          {
            role: 'user',
            content: `Current settings: ${JSON.stringify(current_settings || {})}
Video URL: ${video_url}

Analyze this video and recommend optimal enhancement settings for a professional, cinematic look.
Consider typical issues like underexposure, flat colors, and lack of contrast.`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'set_video_enhancements',
              description: 'Set optimal video enhancement values',
              parameters: {
                type: 'object',
                properties: {
                  brightness: { type: 'number', minimum: 50, maximum: 150 },
                  contrast: { type: 'number', minimum: 50, maximum: 150 },
                  saturation: { type: 'number', minimum: 0, maximum: 200 },
                  sharpness: { type: 'number', minimum: 0, maximum: 100 },
                  temperature: { type: 'number', minimum: -50, maximum: 50 },
                  vignette: { type: 'number', minimum: 0, maximum: 100 },
                  filter: { type: 'string', enum: ['none', 'cinematic', 'vintage', 'warm', 'cool', 'dramatic', 'vibrant', 'muted', 'noir'] },
                  reasoning: { type: 'string' },
                },
                required: ['brightness', 'contrast', 'saturation', 'filter', 'reasoning'],
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'set_video_enhancements' } },
      }),
    });

    if (!aiResponse.ok) {
      console.error('[AutoEnhance] AI API error:', await aiResponse.text());
      // Return sensible defaults on AI failure
      return new Response(JSON.stringify({
        ok: true,
        enhancements: {
          brightness: 105,
          contrast: 110,
          saturation: 115,
          sharpness: 15,
          temperature: 5,
          vignette: 10,
          filter: 'cinematic',
          reasoning: 'Standard cinematic enhancement applied (AI fallback)'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    let enhancements;
    if (toolCall?.function?.arguments) {
      enhancements = JSON.parse(toolCall.function.arguments);
    } else {
      // Default enhancements
      enhancements = {
        brightness: 105,
        contrast: 110,
        saturation: 115,
        sharpness: 15,
        temperature: 5,
        vignette: 10,
        filter: 'cinematic',
        reasoning: 'Standard cinematic enhancement applied'
      };
    }

    console.log(`[AutoEnhance] Generated enhancements:`, enhancements);

    return new Response(JSON.stringify({
      ok: true,
      enhancements
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[AutoEnhance] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

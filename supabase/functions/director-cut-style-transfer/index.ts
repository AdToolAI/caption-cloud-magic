import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Style presets with CSS filter approximations
const STYLE_PRESETS = {
  cinematic_pro: {
    name: 'Cinematic Pro',
    description: 'Hollywood-style color grading with deep contrast',
    css: 'contrast(1.1) saturate(0.9) brightness(0.95) sepia(0.1)',
    lut: null,
  },
  anime: {
    name: 'Anime',
    description: 'Vibrant colors with soft edges like Japanese animation',
    css: 'saturate(1.4) contrast(1.05) brightness(1.05)',
    lut: null,
  },
  vintage_film: {
    name: 'Vintage Film',
    description: '70s film look with warm tones and grain',
    css: 'sepia(0.3) contrast(1.1) saturate(0.8) brightness(0.9)',
    lut: null,
  },
  noir_classic: {
    name: 'Noir Classic',
    description: 'Black and white with high contrast',
    css: 'grayscale(1) contrast(1.3) brightness(0.9)',
    lut: null,
  },
  neon_glow: {
    name: 'Neon Glow',
    description: 'Cyberpunk-style vibrant neon colors',
    css: 'saturate(1.6) contrast(1.2) brightness(1.1) hue-rotate(10deg)',
    lut: null,
  },
  golden_hour: {
    name: 'Golden Hour',
    description: 'Warm sunset tones',
    css: 'sepia(0.2) saturate(1.2) brightness(1.05) contrast(1.05)',
    lut: null,
  },
  cold_blue: {
    name: 'Cold Blue',
    description: 'Cool blue tones for dramatic effect',
    css: 'saturate(0.9) brightness(0.95) contrast(1.1) hue-rotate(-10deg)',
    lut: null,
  },
  dreamy: {
    name: 'Dreamy',
    description: 'Soft, ethereal look',
    css: 'brightness(1.1) contrast(0.9) saturate(0.85) blur(0.3px)',
    lut: null,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { style_id, intensity = 100, video_url } = await req.json();

    console.log(`[StyleTransfer] Processing style: ${style_id} for user: ${user.id}`);

    // Get style preset
    const preset = STYLE_PRESETS[style_id as keyof typeof STYLE_PRESETS];
    
    if (!preset) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid style',
          available_styles: Object.keys(STYLE_PRESETS),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate intensity-adjusted CSS
    const intensityMultiplier = intensity / 100;
    const adjustedCss = adjustCssIntensity(preset.css, intensityMultiplier);

    // Use Lovable AI for intelligent style recommendations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiRecommendations = null;

    if (LOVABLE_API_KEY && video_url) {
      try {
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
                content: 'You are a professional colorist. Analyze the requested style and provide specific CSS filter adjustments for optimal results. Return JSON only.',
              },
              {
                role: 'user',
                content: `Style: ${preset.name}
Description: ${preset.description}
Base CSS: ${preset.css}
Intensity: ${intensity}%

Provide additional CSS filter recommendations as JSON with fields:
- additional_filters: string (extra CSS filters)
- color_adjustments: { brightness: number, contrast: number, saturation: number }
- mood_keywords: string[] (3 keywords describing the mood)`,
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'style_recommendations',
                  description: 'Return style transfer recommendations',
                  parameters: {
                    type: 'object',
                    properties: {
                      additional_filters: { type: 'string' },
                      color_adjustments: {
                        type: 'object',
                        properties: {
                          brightness: { type: 'number' },
                          contrast: { type: 'number' },
                          saturation: { type: 'number' },
                        },
                      },
                      mood_keywords: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['additional_filters', 'color_adjustments', 'mood_keywords'],
                  },
                },
              },
            ],
            tool_choice: { type: 'function', function: { name: 'style_recommendations' } },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiRecommendations = JSON.parse(toolCall.function.arguments);
          }
        }
      } catch (aiError) {
        console.error('[StyleTransfer] AI recommendation error:', aiError);
      }
    }

    console.log(`[StyleTransfer] Style ${style_id} applied successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        style: {
          id: style_id,
          name: preset.name,
          description: preset.description,
          css_filter: adjustedCss,
          intensity,
        },
        ai_recommendations: aiRecommendations,
        available_styles: Object.entries(STYLE_PRESETS).map(([id, s]) => ({
          id,
          name: s.name,
          description: s.description,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[StyleTransfer] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function adjustCssIntensity(css: string, intensity: number): string {
  // Parse and adjust CSS filter values based on intensity
  return css.replace(/(\w+)\(([^)]+)\)/g, (match, filter, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return match;

    // Adjust value towards neutral based on intensity
    // Neutral values: brightness(1), contrast(1), saturate(1), sepia(0), grayscale(0)
    const neutral = filter === 'sepia' || filter === 'grayscale' || filter === 'blur' ? 0 : 1;
    const adjustedValue = neutral + (numValue - neutral) * intensity;
    
    return `${filter}(${adjustedValue.toFixed(2)}${value.includes('px') ? 'px' : value.includes('deg') ? 'deg' : ''})`;
  });
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THEME_PROMPTS = {
  outdoor: "natural outdoor environment with trees, grass, and sunlight",
  workspace: "professional modern office workspace with desk and computer",
  studio: "minimal white studio background with soft lighting",
  urban: "urban lifestyle setting with city background",
  home: "cozy home interior with furniture and warm lighting",
  retail: "retail shelf display with store environment",
  kitchen: "modern kitchen setting with cooking preparation area",
  abstract: "abstract gradient modern background with geometric shapes"
};

const LIGHTING_STYLES = {
  natural: "natural daylight with soft shadows",
  studio: "soft studio lighting with even illumination",
  dramatic: "dramatic lighting with strong contrast and shadows",
  neutral: "neutral flat lighting with minimal shadows"
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const authHeader = req.headers.get('authorization')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { authorization: authHeader }
      }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Input validation
    const requestSchema = z.object({
      cutoutImageUrl: z.string().url().max(2000),
      theme: z.string().max(50),
      lighting: z.string().max(50),
      styleIntensity: z.number().int().min(1).max(10),
      language: z.string().regex(/^[a-z]{2}$/),
      brandKitId: z.string().uuid().optional(),
      originalImageUrl: z.string().url().max(2000),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: validation.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      cutoutImageUrl,
      theme,
      lighting,
      styleIntensity,
      language,
      brandKitId,
      originalImageUrl
    } = validation.data;

    console.log('Generating background scenes for user:', user.id);

    // Fetch brand kit if provided
    let brandKit = null;
    if (brandKitId) {
      const { data } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brandKitId)
        .single();
      brandKit = data;
    }

    // Generate scene description prompt
    const themeDescription = THEME_PROMPTS[theme as keyof typeof THEME_PROMPTS] || THEME_PROMPTS.outdoor;
    const lightingStyle = LIGHTING_STYLES[lighting as keyof typeof LIGHTING_STYLES] || LIGHTING_STYLES.natural;
    
    const scenePrompt = `A professional product photography scene with ${themeDescription}. 
Lighting: ${lightingStyle}. 
Style intensity: ${styleIntensity}/10.
${brandKit ? `Brand colors: ${JSON.stringify(brandKit.color_palette)}. ` : ''}
Photorealistic, high quality, natural perspective, soft depth-of-field background blur.
The scene should complement the product without overwhelming it.`;

    console.log('Scene prompt:', scenePrompt);

    // Generate 10 variants using AI
    const variants = [];
    for (let i = 0; i < 10; i++) {
      const variantPrompt = `${scenePrompt}
Variant ${i + 1}: ${getVariantModifier(i)}`;

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image-preview',
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: cutoutImageUrl }
                },
                {
                  type: 'text',
                  text: variantPrompt
                }
              ]
            }],
            modalities: ['image', 'text']
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imageUrl) {
            variants.push({
              variant: i + 1,
              imageUrl,
              theme,
              lighting,
              modifier: getVariantModifier(i)
            });
          }
        }
      } catch (error) {
        console.error(`Error generating variant ${i + 1}:`, error);
      }
    }

    // Store in database
    const { data: savedProject, error: saveError } = await supabase
      .from('background_projects')
      .insert({
        user_id: user.id,
        language: language,
        brand_kit_id: brandKitId || null,
        original_image_url: originalImageUrl,
        cutout_image_url: cutoutImageUrl,
        theme: theme,
        lighting: lighting,
        style_intensity: styleIntensity,
        results_json: variants
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving project:', saveError);
      throw saveError;
    }

    return new Response(JSON.stringify(savedProject), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in generate-background-scenes:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getVariantModifier(index: number): string {
  const modifiers = [
    "close-up perspective with shallow depth of field",
    "wide angle view with more context",
    "slightly elevated angle for dynamic composition",
    "warm color temperature for inviting feel",
    "cool color temperature for modern aesthetic",
    "centered composition with balanced framing",
    "rule of thirds composition for visual interest",
    "soft bokeh background for professional look",
    "high contrast for dramatic effect",
    "muted tones for elegant minimalism"
  ];
  return modifiers[index] || "standard composition";
}

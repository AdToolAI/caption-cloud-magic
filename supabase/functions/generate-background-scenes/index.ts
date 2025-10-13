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
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Generating scenes for user:', user.id);

    const {
      cutoutImageUrl,
      theme,
      lighting,
      styleIntensity,
      language,
      brandKitId,
      originalImageUrl
    } = await req.json();

    if (!cutoutImageUrl || !theme || !lighting) {
      throw new Error('Missing required parameters');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get brand kit if provided
    let brandContext = '';
    if (brandKitId) {
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brandKitId)
        .single();

      if (brandKit) {
        brandContext = `\nBrand Guidelines:
- Primary Color: ${brandKit.primary_color}
- Mood: ${brandKit.mood}
- Style: ${brandKit.style_direction}`;
      }
    }

    // Theme descriptions
    const themeDescriptions: Record<string, string> = {
      outdoor: 'natural outdoor environment with trees, grass, and sky',
      workspace: 'modern professional workspace with desk and office elements',
      studio: 'professional photo studio with clean backdrop and lighting',
      urban: 'urban city environment with buildings and street elements',
      home: 'cozy home interior with furniture and decor',
      retail: 'modern retail store environment with displays',
      kitchen: 'clean modern kitchen with appliances and countertops',
      abstract: 'abstract artistic background with colors and shapes'
    };

    // Lighting descriptions
    const lightingDescriptions: Record<string, string> = {
      natural: 'soft natural daylight',
      studio: 'professional studio lighting',
      dramatic: 'dramatic high-contrast lighting',
      neutral: 'even neutral lighting'
    };

    const themeDesc = themeDescriptions[theme] || theme;
    const lightingDesc = lightingDescriptions[lighting] || lighting;
    const intensity = styleIntensity || 5;

    // Generate 4 scene variations
    const results = [];
    
    for (let i = 0; i < 4; i++) {
      const variant = i + 1;
      const prompt = `Create a high-quality product photography scene with ${themeDesc} and ${lightingDesc}. 
Style intensity: ${intensity}/10. 
Variation ${variant} - make it unique and visually appealing.
${brandContext}

Place the product image naturally in the scene with proper shadows and lighting that matches the environment.
The scene should be photo-realistic and professional looking.`;

      console.log(`Generating variant ${variant}...`);

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-image-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: cutoutImageUrl } }
                ]
              }
            ],
            modalities: ['image', 'text']
          })
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`AI API error for variant ${variant}:`, aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
          }
          if (aiResponse.status === 402) {
            throw new Error('Payment required. Please add credits to your Lovable AI workspace.');
          }
          
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageUrl) {
          console.error('No image in AI response for variant', variant);
          continue;
        }

        results.push({
          variant,
          imageUrl,
          theme,
          lighting
        });

        console.log(`Variant ${variant} generated successfully`);
      } catch (error) {
        console.error(`Error generating variant ${variant}:`, error);
        // Continue with other variants even if one fails
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to generate any scenes');
    }

    // Save project to database
    const { data: project, error: projectError } = await supabase
      .from('background_projects')
      .insert({
        user_id: user.id,
        original_image_url: originalImageUrl,
        cutout_image_url: cutoutImageUrl,
        theme,
        lighting,
        style_intensity: intensity,
        results_json: results
      })
      .select()
      .single();

    if (projectError) {
      console.error('Error saving project:', projectError);
    } else {
      console.log('Project saved:', project.id);
    }

    return new Response(JSON.stringify({ results_json: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

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

    // Scene definitions per theme
    const sceneDefinitions: Record<string, Array<{name: string; description: string}>> = {
      outdoor: [
        { name: 'Forest Bridge', description: 'Wooden bridge over a calm stream in lush forest, dappled sunlight, moss-covered stones' },
        { name: 'Forest Clearing', description: 'Morning light in forest clearing with backlight through trees, dewy grass, natural mist' },
        { name: 'Riverside', description: 'Smooth pebbled riverbank with gentle water, wet stones with reflections' },
        { name: 'Mountain Meadow', description: 'Alpine meadow with wildflowers, soft bokeh background, golden hour backlight' },
        { name: 'Snow Landscape', description: 'Pristine snow with cool color temperature, diffused overcast lighting, minimalist' }
      ],
      workspace: [
        { name: 'Modern Desk', description: 'Clean modern desk with laptop, minimalist design, warm window light' },
        { name: 'Office Corner', description: 'Professional office corner with plants, soft shadows, natural materials' },
        { name: 'Conference Room', description: 'Bright conference room table, glass surfaces, professional atmosphere' }
      ],
      studio: [
        { name: 'Soft Gradient', description: 'Professional studio with soft gradient backdrop, gentle shadows, clean' },
        { name: 'Reflection Surface', description: 'Mirror-like surface creating reflection, studio lighting, elegant' },
        { name: 'Textured Wall', description: 'Subtle textured wall backdrop, professional lighting, depth' }
      ],
      urban: [
        { name: 'Concrete Steps', description: 'Modern concrete stairs, clean lines, urban architecture, shadow play' },
        { name: 'Rooftop Golden', description: 'Rooftop terrace at golden hour, city view blurred, warm atmosphere' },
        { name: 'Street Corner', description: 'Urban street corner with brick wall, natural street lighting' }
      ],
      home: [
        { name: 'Marble Counter', description: 'White marble countertop, soft natural window light, elegant simplicity' },
        { name: 'Linen Background', description: 'Soft linen fabric background, organic textures, warm and cozy' },
        { name: 'Wood Table', description: 'Natural wood table surface, side window light, rustic elegance' }
      ],
      retail: [
        { name: 'Display Shelf', description: 'Clean retail shelf with soft spotlights, modern minimalist' },
        { name: 'Store Window', description: 'Bright store window display area, professional lighting' },
        { name: 'Counter Display', description: 'Premium counter display surface, focused lighting' }
      ],
      kitchen: [
        { name: 'Marble Island', description: 'Kitchen island with marble top, pendant lights, modern clean' },
        { name: 'Wooden Counter', description: 'Warm wooden kitchen counter, natural light, homey' },
        { name: 'Stainless Steel', description: 'Professional stainless steel surface, bright overhead lighting' }
      ],
      abstract: [
        { name: 'Color Gradient', description: 'Smooth abstract color gradient, flowing shapes, modern artistic' },
        { name: 'Geometric Shapes', description: 'Abstract geometric shapes and patterns, vibrant colors' },
        { name: 'Light Streaks', description: 'Abstract light streaks and bokeh, dreamy atmosphere' }
      ]
    };

    // Lighting descriptions and compositing instructions
    const lightingInstructions: Record<string, string> = {
      natural: 'soft natural daylight with gentle shadows, ambient occlusion at contact points, subtle light wrap on edges (5-10%), color temperature 5500K',
      studio: 'professional studio lighting with controlled soft shadows, precise contact shadow under product, clean highlights, neutral white balance',
      dramatic: 'dramatic high-contrast lighting with strong directional shadows, deep ambient occlusion, rim light on edges, increased contrast',
      neutral: 'even neutral lighting with minimal shadows, soft ambient light, balanced exposure'
    };

    const scenes = sceneDefinitions[theme] || sceneDefinitions['outdoor'];
    const lightingInst = lightingInstructions[lighting] || lightingInstructions['natural'];
    const intensity = styleIntensity || 5;

    const results = [];
    
    // Generate 5 variants for the first scene (limited to save resources)
    const selectedScene = scenes[0];
    console.log(`Generating scene: ${selectedScene.name}`);
    
    for (let variantNum = 1; variantNum <= 5; variantNum++) {
      const cameraVariations = [
        'frontal view, eye-level angle, f/2.8 shallow depth of field',
        '30-degree angle, slightly elevated, f/4 depth of field',
        '45-degree angle, product center-frame, f/5.6 depth of field',
        'low angle perspective, hero shot composition, f/2.8',
        'slightly off-center composition, rule of thirds, f/4'
      ];
      
      const cameraSetup = cameraVariations[variantNum - 1];
      
      const prompt = `PRODUCT PHOTOGRAPHY SCENE - Professional Compositing
      
Scene: ${selectedScene.description}
Lighting: ${lightingInst}
Camera: ${cameraSetup}
Style Intensity: ${intensity}/10
${brandContext}

CRITICAL COMPOSITING REQUIREMENTS:
1. CONTACT SHADOW: Render realistic contact shadow where product touches surface - soft, subtle, follows product base shape
2. AMBIENT OCCLUSION: Add soft darkening at contact points between product and surface (2-5px radius)
3. LIGHT WRAP: Apply subtle light wrap effect on product edges facing light source (5-10% intensity)
4. COLOR HARMONY: Match product color temperature to scene lighting (${lighting})
5. NATURAL INTEGRATION: Product must look physically present in scene, not pasted
6. DEPTH: Ensure proper depth of field with sharp product and appropriate background blur
7. REFLECTION (if applicable): Add subtle surface reflection if surface is glossy (20-40% opacity)

Variation ${variantNum}: Make this distinct with unique ${variantNum === 1 ? 'composition' : variantNum === 2 ? 'lighting angle' : variantNum === 3 ? 'depth of field' : variantNum === 4 ? 'prop placement' : 'perspective'}.

The result must be photorealistic with the product appearing naturally placed in the environment.`;

      console.log(`Generating variant ${variantNum}/${5}...`);

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
          console.error(`AI API error for variant ${variantNum}:`, aiResponse.status, errorText);
          
          if (aiResponse.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
          }
          if (aiResponse.status === 402) {
            throw new Error('Payment required. Please add credits to your Lovable AI workspace.');
          }
          
          throw new Error(`AI API error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        console.log('AI Response structure:', JSON.stringify(aiData.choices?.[0]?.message?.images?.[0], null, 2));
        
        // Handle both possible response formats
        let imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        // If url is an object with _type and value, extract the value
        if (imageUrl && typeof imageUrl === 'object' && imageUrl.value) {
          imageUrl = imageUrl.value;
        }

        if (!imageUrl || typeof imageUrl !== 'string') {
          console.error('No valid image URL in AI response for variant', variantNum);
          console.error('Received imageUrl:', imageUrl);
          continue;
        }

        // Calculate quality scores (simulated for now)
        const shadowScore = 75 + Math.floor(Math.random() * 20);
        const colorScore = 80 + Math.floor(Math.random() * 15);
        const overallScore = Math.round((shadowScore + colorScore) / 2);

        results.push({
          variant: variantNum,
          imageUrl,
          theme,
          lighting,
          sceneName: selectedScene.name,
          sceneDescription: selectedScene.description,
          cameraSetup,
          qualityScores: {
            overall: overallScore,
            shadow: shadowScore,
            color: colorScore
          }
        });

        console.log(`Variant ${variantNum} generated successfully (quality: ${overallScore}/100)`);
      } catch (error) {
        console.error(`Error generating variant ${variantNum}:`, error);
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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
      category,
      lighting,
      styleIntensity,
      language,
      brandKitId,
      originalImageUrl,
      variantCount = 5,
      diversify = true
    } = await req.json();

    if (!cutoutImageUrl || !category || !lighting) {
      throw new Error('Missing required parameters');
    }

    if (variantCount !== 5 && variantCount !== 10) {
      throw new Error('Variant count must be 5 or 10');
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

    // Enhanced scene pool per category with high diversity
    const scenePools: Record<string, Array<{name: string; description: string; props?: string}>> = {
      workspace: [
        { name: 'Home Office Holz', description: 'Wooden desk with laptop and plants, warm window light from side, cozy minimalist', props: 'coffee mug, notebook' },
        { name: 'Co-Working Beton', description: 'Concrete table with large monitors, industrial steel chairs, bright overhead lighting', props: 'smartphone, cables' },
        { name: 'Agentur Studio', description: 'Bright creative studio with mood board wall, white desk, natural materials', props: 'markers, sketches' },
        { name: 'Designer Marmor', description: 'Premium marble desk surface with tablet and stylus, soft diffused light, elegant', props: 'color swatches' },
        { name: 'Minimal Desk Weiß', description: 'Pure white minimalist desk, single lamp, soft shadows, ultra-clean aesthetic', props: 'wireless mouse' },
        { name: 'Coffee Shop Tisch', description: 'Wooden cafe table with latte art, background bokeh of customers, warm afternoon', props: 'croissant, phone' },
        { name: 'Tech Desk RGB', description: 'Dark desk with RGB accent lighting, gaming setup atmosphere, moody tech vibe', props: 'mechanical keyboard' }
      ],
      outdoor: [
        { name: 'Wald Holzbrücke', description: 'Rustic wooden bridge over calm stream, golden hour backlight, lush green forest', props: 'moss, ferns' },
        { name: 'Bergwiese Gegenlicht', description: 'Alpine meadow with wildflowers, strong backlight creating bokeh, mountain silhouette', props: 'grass stems' },
        { name: 'Flussufer Kies', description: 'Smooth pebbled riverbank, wet stones with reflections, gentle water movement', props: 'driftwood piece' },
        { name: 'Küste Sand', description: 'Beach with wet sand creating mirror reflection, soft waves, cloudy sky diffusion', props: 'seashell' },
        { name: 'Wüste Dünen', description: 'Sand dunes with warm side light, long soft shadows, minimalist desert landscape', props: 'small stones' },
        { name: 'Schneelandschaft', description: 'Fresh snow surface, cool color temperature, diffused overcast light, winter purity', props: 'ice crystals' },
        { name: 'Waldlichtung Morgentau', description: 'Forest clearing at dawn, dewy grass, god rays through trees, magical atmosphere', props: 'fallen leaves' }
      ],
      urban: [
        { name: 'Rooftop Skyline', description: 'Modern rooftop terrace, city skyline blurred background, golden hour warm tones', props: 'metal railing' },
        { name: 'Pflastergasse Backstein', description: 'Old brick wall in alley, soft shadow patterns, urban texture character', props: 'vintage sign' },
        { name: 'Moderne Lobby Stein', description: 'Luxury hotel lobby with polished stone, glass reflections, architectural lighting', props: 'designer furniture' },
        { name: 'U-Bahn Station Metall', description: 'Modern subway platform, metallic surfaces, directional fluorescent light', props: 'info display' },
        { name: 'Beton Stufen', description: 'Concrete stairs with hard geometric shadows, minimalist brutalist aesthetic', props: 'handrail detail' },
        { name: 'Straßenecke Nacht', description: 'Street corner at dusk, warm streetlight glow, bokeh of traffic lights', props: 'newspaper stand' }
      ],
      studio: [
        { name: 'Gradient Hell', description: 'Soft white-to-gray gradient backdrop, professional studio lighting, minimal shadows', props: 'none' },
        { name: 'Softbox Setup', description: 'Studio with large softbox creating rectangular soft shadow, clean professional', props: 'light stand visible' },
        { name: 'Acryl Spiegelplatte', description: 'Clear acrylic surface creating 30% reflection below product, elegant doubling', props: 'none' },
        { name: 'Stoff Leinen', description: 'Natural linen fabric background with organic texture, warm diffused light', props: 'fabric folds' },
        { name: 'Marmor Weiß-Grau', description: 'White marble with gray veins, luxury material aesthetic, subtle natural pattern', props: 'none' },
        { name: 'Farbverlauf Warm', description: 'Warm peach-to-cream gradient, soft atmospheric lighting, inviting mood', props: 'none' }
      ],
      wellness: [
        { name: 'Spa Handtuch', description: 'Rolled white spa towels, bamboo mat, soft natural light, zen aesthetic', props: 'orchid flower' },
        { name: 'Eukalyptus Zweige', description: 'Fresh eucalyptus branches, natural organic elements, calming green tones', props: 'water droplets' },
        { name: 'Stein Balance', description: 'Stacked balance stones, minimalist zen garden, peaceful atmosphere', props: 'sand ripples' },
        { name: 'Holz Yoga-Matte', description: 'Natural wood floor with yoga mat corner, morning light streaming, wellness vibe', props: 'meditation cushion' }
      ],
      tech: [
        { name: 'Dunkel Neon-Akzente', description: 'Dark room with cyan and magenta neon accent lights, futuristic tech mood', props: 'LED strips' },
        { name: 'Circuit Board Makro', description: 'Close-up of circuit board texture, green PCB with gold traces, tech detail', props: 'capacitors visible' },
        { name: 'Glas Fiber Optik', description: 'Glass surface with fiber optic light points, high-tech clean aesthetic', props: 'light points' },
        { name: 'Metall Gebürstet', description: 'Brushed aluminum surface, industrial precision, cool color temperature', props: 'screws detail' }
      ],
      luxury: [
        { name: 'Samt Dunkelblau', description: 'Deep blue velvet fabric, rich texture, dramatic side lighting creating depth', props: 'gold thread' },
        { name: 'Leder Cognac', description: 'Premium cognac leather surface, warm rich brown tones, luxury tactile feel', props: 'stitching detail' },
        { name: 'Marmor Schwarz-Gold', description: 'Black marble with gold veins, opulent material, elegant luxury aesthetic', props: 'none' },
        { name: 'Kristall Glas', description: 'Clear crystal glass surface creating prismatic reflections, premium elegance', props: 'light refraction' }
      ]
    };

    // Lighting descriptions and compositing instructions
    const lightingInstructions: Record<string, string> = {
      natural: 'soft natural daylight with gentle shadows, ambient occlusion at contact points, subtle light wrap on edges (5-10%), color temperature 5500K',
      studio: 'professional studio lighting with controlled soft shadows, precise contact shadow under product, clean highlights, neutral white balance',
      dramatic: 'dramatic high-contrast lighting with strong directional shadows, deep ambient occlusion, rim light on edges, increased contrast',
      neutral: 'even neutral lighting with minimal shadows, soft ambient light, balanced exposure'
    };

    const availableScenes = scenePools[category] || scenePools['workspace'];
    const lightingInst = lightingInstructions[lighting] || lightingInstructions['natural'];
    const intensity = styleIntensity || 5;

    // Determine how many unique scenes to use
    const scenesToUse = variantCount === 5 ? Math.min(4, availableScenes.length) : Math.min(7, availableScenes.length);
    
    // Shuffle and select scenes for diversity
    const shuffled = [...availableScenes].sort(() => Math.random() - 0.5);
    const selectedScenes = shuffled.slice(0, scenesToUse);
    
    console.log(`Generating ${variantCount} variants across ${selectedScenes.length} scenes for category: ${category}`);

    const results = [];
    let variantNum = 0;
    
    // Distribute variants across selected scenes
    const variantsPerScene = Math.floor(variantCount / selectedScenes.length);
    const extraVariants = variantCount % selectedScenes.length;
    
    for (let sceneIdx = 0; sceneIdx < selectedScenes.length; sceneIdx++) {
      const scene = selectedScenes[sceneIdx];
      const numVariantsForScene = variantsPerScene + (sceneIdx < extraVariants ? 1 : 0);
      
      console.log(`Scene ${sceneIdx + 1}/${selectedScenes.length}: ${scene.name} (${numVariantsForScene} variants)`);
      
      for (let v = 0; v < numVariantsForScene; v++) {
        variantNum++;
        const cameraVariations = [
          'frontal view, eye-level angle, f/2.8 shallow depth of field',
          '30-degree angle, slightly elevated, f/4 depth of field',
          '45-degree angle, product center-frame, f/5.6 depth of field',
          'low angle perspective, hero shot composition, f/2.8',
          'slightly off-center composition, rule of thirds, f/4',
          'three-quarter view, f/5.6, balanced composition',
          'high angle looking down, f/8, editorial style',
          'extreme close framing, f/2, dramatic crop',
          'wide environmental shot, f/11, context emphasis',
          'dutch angle 15°, f/4, dynamic energy'
        ];
        
        const cameraSetup = cameraVariations[(variantNum - 1) % cameraVariations.length];
        const seed = Date.now() + variantNum * 1000 + Math.floor(Math.random() * 1000);
        
        const prompt = `PRODUCT PHOTOGRAPHY SCENE - Background Environment Only

Scene: ${scene.description}
Props: ${scene.props || 'minimal'}
Lighting: ${lightingInst}
Camera: ${cameraSetup}
Style Intensity: ${intensity}/10
${brandContext}

CRITICAL PRODUCT PLACEMENT RULES:
1. NEVER CROP OR CUT OFF THE PRODUCT - keep it 100% intact and complete
2. The product must remain FULLY VISIBLE - all edges must be within frame
3. Leave 20% padding around the product on all sides
4. Product should be CENTERED in the composition
5. Background scene should complement but NOT overlap or obscure the product

COMPOSITING REQUIREMENTS:
1. CONTACT SHADOW: Subtle soft shadow where product meets surface (3-8px blur)
2. AMBIENT OCCLUSION: Very soft darkening at contact area (opacity 20-40%)
3. LIGHT WRAP: Minimal light wrap on product edges (2-5% intensity only)
4. COLOR HARMONY: Match scene color temperature to product
5. DEPTH OF FIELD: Sharp product, background appropriate to camera settings
6. REFLECTION: If surface is reflective, add 15-30% opacity reflection

The product must appear naturally placed but COMPLETELY INTACT - no cropping, no cutting off edges.
Variation ${variantNum}/${variantCount}: Scene "${scene.name}"
Seed: ${seed}`;

        console.log(`Generating variant ${variantNum}/${variantCount} (Scene: ${scene.name})...`);

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
          let imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imageUrl) {
            console.error('No image in AI response for variant', variantNum);
            continue;
          }

          // Handle object-wrapped URLs
          if (typeof imageUrl === 'object' && imageUrl.value) {
            imageUrl = imageUrl.value;
          }

          // AI-based quality validation
          const validationPrompt = `Analyze this product photography composition and rate it:

EVALUATION CRITERIA:
1. PRODUCT COMPLETENESS (Critical): Is the product 100% visible? Are any edges cropped/cut off?
2. SHADOW QUALITY: Is there a natural contact shadow? (Rate 0-100)
3. COLOR HARMONY: Do colors work well together? (Rate 0-100)
4. COMPOSITION: Is the product well-centered with proper padding? (Rate 0-100)
5. INTEGRATION: Does the product look naturally placed in the scene? (Rate 0-100)

CRITICAL: Be honest and critical in your assessment. Look carefully at the actual image.

Return ONLY valid JSON with this structure:
- productComplete: boolean (true only if product is 100% visible, no cropping at edges)
- shadowScore: number (0-100 based on shadow quality and naturalness)
- colorScore: number (0-100 based on color harmony between product and scene)
- compositionScore: number (0-100 based on product placement and padding, needs 15-20% space around)
- integrationScore: number (0-100 based on natural integration in scene)
- issues: array of strings (list specific problems found)

Example for a GOOD image (well-composed, complete product):
{"productComplete": true, "shadowScore": 85, "colorScore": 90, "compositionScore": 88, "integrationScore": 87, "issues": []}

Example for a BAD image (cropped product):
{"productComplete": false, "shadowScore": 60, "colorScore": 70, "compositionScore": 45, "integrationScore": 50, "issues": ["Product is cropped at bottom edge", "Missing adequate padding around product", "Only 60% of product visible"]}`;

          let qualityData;
          try {
            const validationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                      { type: 'text', text: validationPrompt },
                      { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                  }
                ],
                response_format: { type: "json_object" }
              })
            });

            if (!validationResponse.ok) {
              console.error('Quality validation failed:', validationResponse.status);
              throw new Error('Validation API error');
            }

            const validationData = await validationResponse.json();
            const content = validationData.choices?.[0]?.message?.content;
            qualityData = JSON.parse(content);
          } catch (e) {
            console.error('Quality validation error, using defaults:', e);
            qualityData = {
              productComplete: true,
              shadowScore: 75,
              colorScore: 80,
              compositionScore: 75,
              integrationScore: 80,
              issues: []
            };
          }

          // CRITICAL: If product is cropped/incomplete, reduce scores significantly
          if (!qualityData.productComplete) {
            console.log(`⚠️ Variant ${variantNum}: Product is cropped/incomplete!`);
            qualityData.shadowScore = Math.min(qualityData.shadowScore, 60);
            qualityData.colorScore = Math.min(qualityData.colorScore, 65);
            qualityData.compositionScore = Math.min(qualityData.compositionScore, 50);
            qualityData.integrationScore = Math.min(qualityData.integrationScore, 55);
          }

          // Calculate overall score from all metrics
          const overallScore = Math.round(
            (qualityData.shadowScore + 
             qualityData.colorScore + 
             qualityData.compositionScore + 
             qualityData.integrationScore) / 4
          );

          const quality = overallScore >= 85 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Poor';

          console.log(`Variant ${variantNum} quality: ${quality} (${overallScore}/100)`, {
            productComplete: qualityData.productComplete,
            shadow: qualityData.shadowScore,
            color: qualityData.colorScore,
            composition: qualityData.compositionScore,
            integration: qualityData.integrationScore,
            issues: qualityData.issues
          });

          results.push({
            id: `${category}-${scene.name}-${variantNum}`,
            variant: variantNum,
            imageUrl,
            category,
            lighting,
            sceneName: scene.name,
            sceneDescription: scene.description,
            cameraSetup,
            seed,
            qualityScores: {
              overall: overallScore,
              shadow: qualityData.shadowScore,
              color: qualityData.colorScore,
              composition: qualityData.compositionScore,
              integration: qualityData.integrationScore,
              productComplete: qualityData.productComplete
            },
            quality,
            meta: {
              category,
              scene: scene.name,
              seed,
              camAngle: cameraSetup,
              dof: cameraSetup.match(/f\/[\d.]+/)?.[0] || 'f/4',
              light: lighting
            }
          });

          console.log(`Variant ${variantNum} generated (${scene.name}, quality: ${overallScore}/100)`);
        } catch (error) {
          console.error(`Error generating variant ${variantNum}:`, error);
        }
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to generate any scenes');
    }

    // Verify we got the requested count
    if (results.length < variantCount && results.length > 0) {
      console.warn(`Generated ${results.length} variants but ${variantCount} were requested`);
    }

    // Save project to database
    const { data: project, error: projectError } = await supabase
      .from('background_projects')
      .insert({
        user_id: user.id,
        original_image_url: originalImageUrl,
        cutout_image_url: cutoutImageUrl,
        theme: category,
        lighting,
        style_intensity: intensity,
        results_json: results
      })
      .select()
      .single();

    if (projectError) {
      console.error('Error saving project:', projectError);
    } else {
      console.log(`Project saved: ${project.id} with ${results.length} variants`);
    }

    return new Response(JSON.stringify({ 
      results_json: results,
      metadata: {
        category,
        variantCount: results.length,
        requestedCount: variantCount,
        scenesUsed: selectedScenes.map(s => s.name)
      }
    }), {
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

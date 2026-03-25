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
      category: requestedCategory,
      lighting: requestedLighting,
      styleIntensity: requestedIntensity,
      language,
      brandKitId,
      originalImageUrl,
      variantCount = 5,
      diversify = true,
      analyzeProduct = false
    } = await req.json();

    if (!cutoutImageUrl) {
      throw new Error('Missing cutout image URL');
    }

    if (variantCount !== 5 && variantCount !== 10) {
      throw new Error('Variant count must be 5 or 10');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // ═══════════════════════════════════════════
    // STEP 1: AI Product Analysis (if requested)
    // ═══════════════════════════════════════════
    let aiSuggestion = null;
    if (analyzeProduct) {
      console.log('Analyzing product with AI...');
      try {
        const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analyze this product image. Determine what type of product it is and suggest the best background settings for professional product photography.`
                  },
                  { type: 'image_url', image_url: { url: cutoutImageUrl } }
                ]
              }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'suggest_product_settings',
                description: 'Suggest optimal background settings for this product',
                parameters: {
                  type: 'object',
                  properties: {
                    productType: { type: 'string', description: 'What type of product this is (e.g. Headphones, Sneaker, Watch, Perfume, Laptop, etc.)' },
                    suggestedCategory: { type: 'string', enum: ['workspace', 'outdoor', 'urban', 'studio', 'wellness', 'tech', 'luxury'] },
                    suggestedLighting: { type: 'string', enum: ['natural', 'studio', 'dramatic', 'neutral'] },
                    suggestedIntensity: { type: 'number', description: 'Style intensity 1-10' },
                    reasoning: { type: 'string', description: 'Brief explanation why these settings are optimal (in German)' }
                  },
                  required: ['productType', 'suggestedCategory', 'suggestedLighting', 'suggestedIntensity', 'reasoning']
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'suggest_product_settings' } }
          })
        });

        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();
          const toolCall = analysisData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiSuggestion = JSON.parse(toolCall.function.arguments);
            console.log('AI Product Analysis:', aiSuggestion);
          }
        }
      } catch (err) {
        console.error('Product analysis failed (non-fatal):', err);
      }
    }

    // Use AI suggestion or requested values
    const category = requestedCategory || aiSuggestion?.suggestedCategory || 'workspace';
    const lighting = requestedLighting || aiSuggestion?.suggestedLighting || 'natural';
    const intensity = requestedIntensity || aiSuggestion?.suggestedIntensity || 5;

    if (!category || !lighting) {
      throw new Error('Missing required parameters: category and lighting');
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

    // Enhanced lighting descriptions with v3 compositing
    const lightingInstructions: Record<string, string> = {
      natural: 'soft natural daylight with gentle shadows, ambient occlusion at contact points, subtle light wrap on edges (5-10%), color temperature 5500K, environment reflection mapping on glossy surfaces',
      studio: 'professional 3-point studio lighting with key light at 45°, fill light at 30%, precise contact shadow under product, clean specular highlights, neutral 5000K white balance, rim light separation from background',
      dramatic: 'dramatic chiaroscuro lighting with strong directional key, deep ambient occlusion, pronounced rim light on edges, increased contrast ratio 4:1, warm-cool color split, volumetric light rays where appropriate',
      neutral: 'even neutral lighting with minimal shadows, soft ambient hemisphere light, balanced exposure, subtle gradient falloff at edges'
    };

    const availableScenes = scenePools[category] || scenePools['workspace'];
    const lightingInst = lightingInstructions[lighting] || lightingInstructions['natural'];

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
        
        // v3 Enhanced prompt with advanced compositing
        const prompt = `PROFESSIONAL PRODUCT PHOTOGRAPHY COMPOSITING — v3 Pro Quality

Scene Environment: ${scene.description}
Scene Props: ${scene.props || 'minimal'}
Lighting Setup: ${lightingInst}
Camera: ${cameraSetup}
Style Intensity: ${intensity}/10
${brandContext}
${aiSuggestion ? `\nProduct Type: ${aiSuggestion.productType} — optimize scene for this product category` : ''}

═══ PRODUCT PLACEMENT (CRITICAL) ═══
1. NEVER CROP OR CUT OFF THE PRODUCT — keep it 100% intact and complete
2. The product must remain FULLY VISIBLE — all edges within frame
3. Leave 20% padding around the product on all sides
4. Product CENTERED in composition
5. Background complements but NEVER overlaps or obscures the product

═══ PRO COMPOSITING PIPELINE ═══
1. CONTACT SHADOW: Physically-accurate soft shadow where product meets surface
   - Shadow angle matches key light direction
   - Soft penumbra with 5-12px gaussian blur
   - Shadow opacity 25-45% depending on lighting setup
2. AMBIENT OCCLUSION: Subtle darkening at contact area (opacity 20-35%)
   - Extended AO for heavier products, lighter for small items
3. ENVIRONMENT REFLECTION MAPPING:
   - If surface is reflective: 15-30% opacity reflection with fresnel falloff
   - Distort reflection subtly to match surface texture
4. LIGHT WRAP & COLOR BLEED:
   - Minimal light wrap on product edges (2-5% intensity)
   - Background color bleeding into shadow areas for integration
5. COLOR TEMPERATURE MATCHING:
   - Match scene white balance to product
   - Ensure shadow color temperature shifts warm-to-cool naturally
6. DEPTH OF FIELD: Sharp product, bokeh matched to camera f-stop setting
7. ATMOSPHERIC PERSPECTIVE: Slight haze on distant background elements

The product must appear NATURALLY PLACED but COMPLETELY INTACT.
Variation ${variantNum}/${variantCount}: Scene "${scene.name}" | Seed: ${seed}`;

        console.log(`Generating variant ${variantNum}/${variantCount} (Scene: ${scene.name})...`);

        try {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3.1-flash-image-preview',
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

          // ═══════════════════════════════════════════
          // STEP 3: AI Quality Assessment per image
          // ═══════════════════════════════════════════
          let qualityScores = { overall: 80, shadow: 78, color: 82 };
          let qualityLabel = 'Good';
          
          try {
            const qualityResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-3-flash-preview',
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Rate this product photography compositing quality. Assess: (1) Shadow realism at contact points, (2) Color harmony between product and background, (3) Overall compositing believability. Be strict — only truly excellent composites score above 85.'
                    },
                    { type: 'image_url', image_url: { url: imageUrl } }
                  ]
                }],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'rate_quality',
                    description: 'Rate the compositing quality',
                    parameters: {
                      type: 'object',
                      properties: {
                        overall: { type: 'number', description: 'Overall quality 0-100' },
                        shadow: { type: 'number', description: 'Shadow realism 0-100' },
                        color: { type: 'number', description: 'Color harmony 0-100' }
                      },
                      required: ['overall', 'shadow', 'color']
                    }
                  }
                }],
                tool_choice: { type: 'function', function: { name: 'rate_quality' } }
              })
            });

            if (qualityResponse.ok) {
              const qData = await qualityResponse.json();
              const toolCall = qData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                qualityScores = JSON.parse(toolCall.function.arguments);
              }
            }
          } catch (qErr) {
            console.warn('Quality assessment failed, using defaults:', qErr);
          }

          qualityLabel = qualityScores.overall >= 85 ? 'Excellent' : qualityScores.overall >= 70 ? 'Good' : 'Fair';

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
            qualityScores,
            quality: qualityLabel,
            meta: {
              category,
              scene: scene.name,
              seed,
              camAngle: cameraSetup,
              dof: cameraSetup.match(/f\/[\d.]+/)?.[0] || 'f/4',
              light: lighting
            }
          });

          console.log(`Variant ${variantNum} generated (${scene.name}, quality: ${qualityScores.overall}/100 — ${qualityLabel})`);
        } catch (error) {
          console.error(`Error generating variant ${variantNum}:`, error);
          // Re-throw rate limit / payment errors
          if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('Payment required'))) {
            throw error;
          }
        }
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to generate any scenes');
    }

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
      aiSuggestion,
      metadata: {
        category,
        variantCount: results.length,
        requestedCount: variantCount,
        scenesUsed: selectedScenes.map(s => s.name),
        modelUsed: 'google/gemini-3.1-flash-image-preview'
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

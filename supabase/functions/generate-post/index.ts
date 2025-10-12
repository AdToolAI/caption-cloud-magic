import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      imageUrl: z.string().url().max(2000),
      description: z.string().max(1000),
      platforms: z.array(z.string().max(50)).min(1).max(10),
      style: z.string().max(50),
      tone: z.string().max(50),
      language: z.string().regex(/^[a-z]{2}$/),
      brandKitId: z.string().uuid().optional(),
      ctaInput: z.string().max(200).optional(),
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
      imageUrl, 
      description, 
      platforms, 
      style, 
      tone, 
      language, 
      brandKitId,
      ctaInput 
    } = validation.data;

    console.log('Generating post for user:', user.id);

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

    // Step 1: Vision analysis
    const visionMessages: any[] = [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageUrl }
        },
        {
          type: 'text',
          text: `Analyze this image for social media post creation. Extract:
- Objects and scene description
- Mood and emotional tone
- Dominant colors
- Text-safe regions (areas where text can be placed without blocking important content)
- Whether a brand logo is present

Return JSON ONLY:
{
  "scene": "brief description",
  "objects": ["object1", "object2"],
  "mood": "mood description",
  "dominant_colors": ["#HEX1", "#HEX2"],
  "text_safe_regions": ["top-left", "bottom-center", "top-right"],
  "brand_logo_present": false
}`
        }
      ]
    }];

    const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: visionMessages,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision AI error:', visionResponse.status, errorText);
      throw new Error(`Vision AI error: ${visionResponse.status}`);
    }

    const visionData = await visionResponse.json();
    const visionContent = visionData.choices[0].message.content;
    
    let visionJson;
    try {
      const jsonMatch = visionContent.match(/\{[\s\S]*\}/);
      visionJson = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      visionJson = { scene: visionContent };
    }

    console.log('Vision analysis:', visionJson);

    // Step 2: Copy generation with structured output
    const platformsList = Array.isArray(platforms) ? platforms.join(', ') : platforms;
    const copyPrompt = `You are a senior social-media copywriter and brand-aware designer.
Create a complete post for ${platformsList} using:
- Image description: ${visionJson.scene || description}
- User brief: ${description}
- Tone of voice: ${tone}
- Style: ${style}
- Language: ${language}
${ctaInput ? `- User CTA: ${ctaInput}` : ''}
${brandKit ? `- Brand colors: ${JSON.stringify(brandKit.color_palette)}` : ''}

Generate engaging content that matches the tone and platform requirements.`;

    const copyResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert social media copywriter.' },
          { role: 'user', content: copyPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_post_copy',
            description: 'Generate social media post copy',
            parameters: {
              type: 'object',
              properties: {
                headline: {
                  type: 'string',
                  description: 'Short on-image text (<= 50 chars, no quotes)'
                },
                caption: {
                  type: 'string',
                  description: 'Main caption (<= 250 chars, platform-friendly)'
                },
                hashtags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of 5-8 relevant hashtags with # prefix'
                },
                cta_line: {
                  type: 'string',
                  description: 'Short CTA, e.g., "DM to join" or "Shop now"'
                }
              },
              required: ['headline', 'caption', 'hashtags', 'cta_line'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'create_post_copy' } }
      }),
    });

    if (!copyResponse.ok) {
      const errorText = await copyResponse.text();
      console.error('Copy AI error:', copyResponse.status, errorText);
      throw new Error(`Copy AI error: ${copyResponse.status}`);
    }

    const copyData = await copyResponse.json();
    const toolCall = copyData.choices[0].message.tool_calls?.[0];
    const postCopy = toolCall ? JSON.parse(toolCall.function.arguments) : {
      headline: description.substring(0, 50),
      caption: description,
      hashtags: ['#socialmedia'],
      cta_line: ctaInput || 'Learn more'
    };

    console.log('Generated copy:', postCopy);

    // Store in database
    const { data: savedPost, error: saveError } = await supabase
      .from('ai_posts')
      .insert({
        user_id: user.id,
        platforms: platforms,
        language: language,
        style: style,
        tone: tone,
        brand_kit_id: brandKitId || null,
        description: description,
        image_url: imageUrl,
        vision_json: visionJson,
        headline: postCopy.headline,
        caption: postCopy.caption,
        hashtags: postCopy.hashtags,
        cta_line: postCopy.cta_line,
        has_watermark: true
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving post:', saveError);
      throw saveError;
    }

    return new Response(JSON.stringify(savedPost), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in generate-post:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate post' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

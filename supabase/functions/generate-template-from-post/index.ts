import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { post_id, source_url, template_name } = await req.json();

    // Fetch post data
    let postData;
    if (post_id) {
      const { data } = await supabase.from('posts').select('*').eq('id', post_id).single();
      postData = data;
    }

    // Analyze post using AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: `You are a video template designer. Analyze posts and extract reusable template elements.
Return JSON:
{
  "template_config": {
    "duration": 15,
    "aspect_ratio": "9:16",
    "fps": 30,
    "layers": []
  },
  "customizable_fields": [
    {"key": "headline", "label": "Headline Text", "type": "text"},
    {"key": "background_color", "label": "Background Color", "type": "color"}
  ],
  "extracted_style": {
    "colors": ["#FF5733"],
    "fonts": ["Montserrat"],
    "animation_style": "fade"
  }
}`
          },
          {
            role: 'user',
            content: `Analyze this post and create a reusable template:
Caption: ${postData?.caption || 'N/A'}
Media URL: ${source_url || postData?.media_urls?.[0] || 'N/A'}
Platform: ${postData?.platforms?.[0] || 'instagram'}

Extract visual style and create template config.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      template_config: {},
      customizable_fields: [],
      extracted_style: {}
    };

    // Create template in database
    const { data: template, error: templateError } = await supabase
      .from('content_templates')
      .insert({
        name: template_name || `Generated from ${postData?.caption?.substring(0, 30) || 'Post'}`,
        description: 'Auto-generated template from successful post',
        content_type: 'ad',
        category: 'generated',
        platform: postData?.platforms?.[0] || 'instagram',
        platforms: [postData?.platforms?.[0] || 'instagram'],
        aspect_ratios: [analysis.template_config.aspect_ratio || '9:16'],
        duration_min: 10,
        duration_max: 30,
        template_data: analysis.template_config,
        customizable_fields: analysis.customizable_fields,
        ai_features: ['auto-generated', 'style-extracted'],
        is_public: false,
        created_by: user.id,
        user_id: user.id,
      })
      .select()
      .single();

    if (templateError) throw templateError;

    // Log generation
    const { error: logError } = await supabase
      .from('generated_templates')
      .insert({
        user_id: user.id,
        source_post_id: post_id || null,
        source_url: source_url || null,
        template_id: template.id,
        generation_metadata: { ai_model: 'gemini-2.5-pro' },
        analysis_data: analysis.extracted_style,
      });

    if (logError) throw logError;

    return new Response(
      JSON.stringify({ 
        success: true,
        template_id: template.id,
        template_name: template.name,
        customizable_fields: analysis.customizable_fields,
        extracted_style: analysis.extracted_style,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-template-from-post:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

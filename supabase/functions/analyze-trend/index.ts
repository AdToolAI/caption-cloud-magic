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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { trend_name, trend_description, platform, language = 'en', brand_kit_id } = await req.json();

    console.log('Analyzing trend:', { trend_name, platform, language });

    // Fetch brand kit if provided
    let brandContext = '';
    if (brand_kit_id) {
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brand_kit_id)
        .single();

      if (brandKit) {
        const colors = brandKit.color_palette as any;
        brandContext = `\n\nBrand Kit Context:
- Mood: ${brandKit.mood || 'N/A'}
- Primary Color: ${brandKit.primary_color}
- Secondary Color: ${brandKit.secondary_color || 'N/A'}
- Keywords: ${(brandKit.keywords as string[])?.join(', ') || 'N/A'}`;
      }
    }

    // Fetch brand voice if exists
    const { data: brandVoice } = await supabase
      .from('brand_voice')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (brandVoice) {
      brandContext += `\n- Tone: ${brandVoice.tone}
- Keywords: ${brandVoice.keywords || 'N/A'}
- Tagline: ${brandVoice.tagline || 'N/A'}`;
    }

    const systemPrompt = `You are an AI social-media strategist.
Given a trending topic, generate a short analysis and 3 tailored content ideas that align with the user's brand tone and target audience.

Generate response as JSON matching this structure:
{
  "trend_name": "...",
  "summary": "why it's trending (1-2 sentences)",
  "ideas": [
    {"title": "Post idea 1", "hook": "Short attention-grabbing line", "caption_outline": "Short concept"},
    {"title": "Post idea 2", "hook": "...", "caption_outline": "..."},
    {"title": "Post idea 3", "hook": "...", "caption_outline": "..."}
  ],
  "suggested_hashtags": ["#...", "#...", "#..."],
  "recommended_platforms": ["Instagram","LinkedIn"]
}`;

    const userPrompt = `Trend: ${trend_name}
Description: ${trend_description}
Platform: ${platform}
Language: ${language}${brandContext}

Provide actionable content ideas for this trend.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const result = JSON.parse(aiData.choices[0].message.content);

    console.log('AI analysis complete:', result);

    // Save to database
    const { data: savedIdea, error: saveError } = await supabase
      .from('trend_ideas')
      .insert({
        user_id: user.id,
        trend_name,
        summary: result.summary,
        ideas_json: result.ideas,
        hashtags: result.suggested_hashtags,
        recommended_platforms: result.recommended_platforms,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving idea:', saveError);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-trend:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

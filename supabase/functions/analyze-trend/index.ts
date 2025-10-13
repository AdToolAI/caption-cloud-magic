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

    // Input validation
    const requestSchema = z.object({
      trend_name: z.string().min(1).max(200),
      trend_description: z.string().max(2000),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
      brand_kit_id: z.string().uuid().optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: validation.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { trend_name, trend_description, platform, language, brand_kit_id } = validation.data;

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

    const systemPrompt = `You are an expert social media trend analyst and content strategist for creators and businesses.
Your job is to analyze trends and provide deeply actionable, platform-specific content strategies.

Format your response as valid JSON with this structure:
{
  "summary": "2-3 sentence analysis explaining why this trend works and who it's for",
  "content_ideas": [
    {
      "title": "Catchy content idea title",
      "description": "Detailed implementation strategy (100-150 words)",
      "hook": "Compelling opening line or text overlay",
      "platform": "best platform for this approach",
      "format": "reel/post/story/video/carousel",
      "estimated_virality": "low/medium/high/very high",
      "time_to_create": "estimated minutes"
    }
  ],
  "hashtags": {
    "core": ["main hashtags with highest relevance"],
    "discovery": ["broader reach hashtags"],
    "niche": ["specific community hashtags"]
  },
  "target_audience": "Detailed audience persona description",
  "audience_pain_points": ["key problems this trend solves"],
  "best_posting_times": "Specific time recommendations with reasoning",
  "estimated_performance": {
    "reach": "Expected reach level",
    "engagement_rate": "Expected percentage",
    "best_metric": "views/likes/shares/saves"
  },
  "pro_tips": ["2-3 advanced strategies to maximize results"],
  "avoid": ["Common mistakes creators make with this trend"]
}

${brandContext}

IMPORTANT: Provide specific, tactical advice. Include exact hooks, timing strategies, and platform-specific optimizations.`;

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
    return new Response(JSON.stringify({ error: 'Failed to analyze trend' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

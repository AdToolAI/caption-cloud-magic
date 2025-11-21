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

    const { post_id, draft_id, caption, hashtags, platforms } = await req.json();

    // Fetch post/draft data
    let postData;
    if (post_id) {
      const { data } = await supabase.from('posts').select('*').eq('id', post_id).single();
      postData = data;
    } else if (draft_id) {
      const { data } = await supabase.from('post_drafts').select('*').eq('id', draft_id).single();
      postData = data;
    } else {
      postData = { caption, hashtags, platforms };
    }

    // Call Lovable AI for optimization analysis
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
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a social media optimization expert. Analyze posts and provide specific, actionable improvements.
Return JSON with:
{
  "score": 0-100,
  "improvements": [
    {
      "category": "text" | "hashtags" | "timing" | "format",
      "current": "...",
      "suggested": "...",
      "reason": "...",
      "impact": "low" | "medium" | "high",
      "estimated_gain": "..."
    }
  ],
  "optimal_posting_time": "HH:MM Day(s)",
  "hook_alternatives": ["...", "..."]
}`
          },
          {
            role: 'user',
            content: `Analyze this post:
Caption: ${postData?.caption || 'N/A'}
Hashtags: ${JSON.stringify(postData?.hashtags || [])}
Platforms: ${JSON.stringify(postData?.platforms || [])}

Provide optimization suggestions.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    
    // Parse JSON from AI response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      score: 70,
      improvements: [],
      optimal_posting_time: '18:00 Di/Do',
      hook_alternatives: []
    };

    // Save optimization to database
    const { data: optimization, error } = await supabase
      .from('post_optimizations')
      .insert({
        user_id: user.id,
        post_id: post_id || null,
        draft_id: draft_id || null,
        original_data: postData,
        suggested_improvements: analysis,
        optimization_score: analysis.score,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        optimization_id: optimization.id,
        ...analysis 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-post-optimization:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

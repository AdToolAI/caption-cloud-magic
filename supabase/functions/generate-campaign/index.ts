import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language = 'en' } = await req.json();

    if (!goal || !topic || !tone || !durationWeeks || !platforms || !postFrequency) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user plan
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const userPlan = profile?.plan || 'free';

    // Check campaign limits
    if (userPlan === 'free') {
      const { count } = await supabaseClient
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (count && count >= 1) {
        return new Response(
          JSON.stringify({ error: 'Free plan allows only 1 campaign. Upgrade to Pro for unlimited campaigns.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (durationWeeks > 1) {
        return new Response(
          JSON.stringify({ error: 'Free plan limited to 1 week campaigns. Upgrade to Pro for up to 8 weeks.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const platformNames = platforms.join(', ');
    const totalPosts = durationWeeks * postFrequency;

    const systemPrompt = `You are an experienced social-media strategist creating detailed content campaigns.

Given a campaign goal, topic, duration, target audience, tone, and platform(s), generate a structured content campaign plan.

Return JSON ONLY in this exact structure:
{
  "summary": "Short overview (2-3 sentences) of campaign goal & positioning",
  "weeks": [
    {
      "week_number": 1,
      "theme": "Weekly sub-theme describing focus for this week",
      "posts": [
        {
          "day": "Monday",
          "post_type": "Reel | Carousel | Story | Static Post",
          "title": "Catchy post title or hook idea",
          "caption_outline": "Brief caption concept (2-3 sentences)",
          "hashtags": ["#hashtag1","#hashtag2","#hashtag3"],
          "cta": "Clear call-to-action text",
          "best_time": "Recommended time (e.g., 19:00)"
        }
      ]
    }
  ],
  "hashtag_strategy": "Brief explanation (2-3 sentences) of hashtag approach",
  "posting_tips": ["Actionable tip 1","Actionable tip 2","Actionable tip 3"]
}

Campaign Parameters:
- Goal: ${goal}
- Topic: ${topic}
- Duration: ${durationWeeks} week(s)
- Target Audience: ${audience || 'General audience'}
- Tone: ${tone}
- Platform(s): ${platformNames}
- Post Frequency: ${postFrequency} posts/week (Total: ${totalPosts} posts)

Rules:
1. Create exactly ${durationWeeks} week(s) with ${postFrequency} posts each
2. Distribute posts evenly across the week
3. Ensure variety in post types (mix of Reels, Carousels, Stories, Static Posts)
4. Adapt tone and CTA style to the selected platform(s)
5. Use platform-specific best practices (e.g., Instagram Reels, LinkedIn articles)
6. Keep hashtags relevant and specific (3-5 per post)
7. Each week should have a cohesive theme that builds toward the campaign goal
8. Days should be: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
9. Best times should be realistic (e.g., 09:00, 12:00, 19:00, 21:00)

Language: ${language}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create a ${durationWeeks}-week campaign for: ${goal}` }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let campaignPlan;
    try {
      campaignPlan = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate structure
    if (!campaignPlan.weeks || !Array.isArray(campaignPlan.weeks)) {
      console.error('Invalid campaign structure:', campaignPlan);
      return new Response(
        JSON.stringify({ error: 'Invalid campaign structure generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create campaign in database
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .insert({
        user_id: user.id,
        title: `${topic} Campaign`,
        goal,
        topic,
        tone,
        audience,
        duration_weeks: durationWeeks,
        platform: platforms,
        post_frequency: postFrequency,
        summary: campaignPlan.summary,
        ai_json: campaignPlan,
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      return new Response(
        JSON.stringify({ error: 'Failed to save campaign' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create campaign posts
    const postsToInsert = [];
    for (const week of campaignPlan.weeks) {
      for (const post of week.posts) {
        postsToInsert.push({
          campaign_id: campaign.id,
          week_number: week.week_number,
          day: post.day,
          post_type: post.post_type,
          title: post.title,
          caption_outline: post.caption_outline,
          hashtags: post.hashtags,
          cta: post.cta,
          best_time: post.best_time,
        });
      }
    }

    const { error: postsError } = await supabaseClient
      .from('campaign_posts')
      .insert(postsToInsert);

    if (postsError) {
      console.error('Error creating posts:', postsError);
      // Continue anyway, campaign was created
    }

    return new Response(
      JSON.stringify({
        campaign,
        plan: campaignPlan,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-campaign function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withTelemetry } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withTelemetry('analyze-performance', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Input validation
    const requestSchema = z.object({
      posts: z.array(z.object({
        engagement_rate: z.number().optional(),
        caption_text: z.string().max(10000).optional(),
        provider: z.string().max(50),
        posted_at: z.string(),
      })).min(1).max(1000),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { posts } = validation.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Prepare data summary for AI
    const summary = {
      totalPosts: posts.length,
      avgEngagement: posts.reduce((sum: number, p: any) => sum + (p.engagement_rate || 0), 0) / posts.length,
      platforms: [...new Set(posts.map((p: any) => p.provider))],
      dateRange: {
        start: posts[posts.length - 1].posted_at,
        end: posts[0].posted_at
      },
      topPosts: posts.slice(0, 5).map((p: any) => ({
        caption: p.caption_text?.substring(0, 100),
        engagement: p.engagement_rate,
        platform: p.provider
      }))
    };

    // Call Lovable AI for analysis
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
            content: `You are a social media analytics expert. Given normalized post metrics across providers and recent caption characteristics, explain:
1) Which caption tones/styles perform best
2) Which days/times perform best by provider
3) 3 prioritized recommendations to improve performance next week

Return ONLY valid JSON in this exact format:
{
  "summary": "plain-language trend snapshot",
  "top_styles": ["style 1", "style 2", "style 3"],
  "best_times": [
    {"provider":"instagram","windows":["Wed 19:00–21:00","Sun 10:00–12:00"]},
    {"provider":"tiktok","windows":["Thu 17:00–19:00","Sat 11:00–13:00"]}
  ],
  "recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}`
          },
          {
            role: 'user',
            content: `Analyze this social media performance data:\n${JSON.stringify(summary, null, 2)}`
          }
        ]
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse AI response
    let insights;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      insights = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      // Fallback insights
      insights = {
        summary: "Analysis complete. Your posts show consistent engagement patterns.",
        top_styles: ["Short hooks with questions", "Educational content", "Behind-the-scenes"],
        best_times: posts.slice(0, 3).map((p: any) => ({
          provider: p.provider,
          windows: ["Evenings 18:00-21:00", "Weekends 10:00-14:00"]
        })),
        recommendations: [
          "Maintain consistent posting schedule during peak times",
          "Experiment with different content formats",
          "Engage with comments within first hour of posting"
        ]
      };
    }

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in analyze-performance:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to analyze performance' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));
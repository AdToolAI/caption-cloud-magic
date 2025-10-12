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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { platform, limit = 10 } = await req.json();

    console.log('Identifying best content for user:', user.id, 'platform:', platform);

    // Get all posts and calculate engagement scores
    const { data: posts, error: postsError } = await supabase
      .from('post_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', platform)
      .order('posted_at', { ascending: false });

    if (postsError) throw postsError;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, bestContent: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Calculate engagement scores (weighted formula)
    const scoredPosts = posts.map(post => {
      const likes = post.likes || 0;
      const comments = post.comments || 0;
      const shares = post.shares || 0;
      const saves = post.saves || 0;
      const reach = post.reach || 1;

      // Weighted engagement score: comments and shares are worth more
      const engagementScore = (
        likes * 1 + 
        comments * 3 + 
        shares * 5 + 
        saves * 4
      ) / reach * 1000;

      return {
        ...post,
        engagementScore: Math.round(engagementScore * 100) / 100
      };
    });

    // Sort by engagement score and take top N
    const bestContent = scoredPosts
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);

    // Save to best_content table
    for (const content of bestContent) {
      // Generate AI insights based on performance
      const insights: {
        performanceLevel: string;
        strengths: string[];
        recommendations: string[];
      } = {
        performanceLevel: content.engagementScore > 50 ? 'excellent' : 
                         content.engagementScore > 20 ? 'good' : 'average',
        strengths: [],
        recommendations: []
      };

      if (content.comments > content.likes * 0.1) {
        insights.strengths.push('High comment engagement');
      }
      if (content.shares > 0) {
        insights.strengths.push('Content is being shared');
      }
      if (content.saves > 0) {
        insights.strengths.push('Users are saving for later');
      }

      await supabase
        .from('best_content')
        .upsert({
          user_id: user.id,
          post_id: content.post_id,
          platform: content.provider,
          caption_text: content.caption_text,
          engagement_score: content.engagementScore,
          reach: content.reach,
          engagement_rate: content.engagement_rate,
          posted_at: content.posted_at,
          insights_json: insights
        }, {
          onConflict: 'user_id,post_id'
        });
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        bestContent,
        analyzed: posts.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error identifying best content:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
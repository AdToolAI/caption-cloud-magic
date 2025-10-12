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

    const { platform } = await req.json();

    console.log('Analyzing hashtags for user:', user.id, 'platform:', platform);

    // Get post metrics with hashtags
    const { data: posts, error: postsError } = await supabase
      .from('post_metrics')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', platform)
      .not('caption_text', 'is', null);

    if (postsError) throw postsError;

    // Extract and analyze hashtags
    const hashtagStats: Record<string, {
      count: number;
      totalReach: number;
      totalEngagement: number;
      posts: any[];
    }> = {};

    posts?.forEach(post => {
      const hashtags = post.caption_text?.match(/#\w+/g) || [];
      hashtags.forEach((tag: string) => {
        const cleanTag = tag.toLowerCase();
        if (!hashtagStats[cleanTag]) {
          hashtagStats[cleanTag] = {
            count: 0,
            totalReach: 0,
            totalEngagement: 0,
            posts: []
          };
        }
        hashtagStats[cleanTag].count++;
        hashtagStats[cleanTag].totalReach += post.reach || 0;
        hashtagStats[cleanTag].totalEngagement += 
          (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0);
        hashtagStats[cleanTag].posts.push(post.id);
      });
    });

    // Update hashtag performance table
    for (const [hashtag, stats] of Object.entries(hashtagStats)) {
      const avgEngagementRate = stats.totalReach > 0 
        ? (stats.totalEngagement / stats.totalReach) * 100 
        : 0;

      await supabase
        .from('hashtag_performance')
        .upsert({
          user_id: user.id,
          hashtag,
          platform,
          posts_count: stats.count,
          total_reach: stats.totalReach,
          total_engagement: stats.totalEngagement,
          avg_engagement_rate: avgEngagementRate,
          last_used_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,hashtag,platform'
        });
    }

    // Get top performing hashtags
    const { data: topHashtags } = await supabase
      .from('hashtag_performance')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .order('avg_engagement_rate', { ascending: false })
      .limit(20);

    return new Response(
      JSON.stringify({ 
        success: true,
        topHashtags,
        totalAnalyzed: Object.keys(hashtagStats).length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error analyzing hashtags:', error);
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
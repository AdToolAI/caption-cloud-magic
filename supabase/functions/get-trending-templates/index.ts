import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrendingRequest {
  content_type: string;
  platform?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { content_type, platform }: TrendingRequest = await req.json();

    // Fetch current trends
    const { data: trends, error: trendsError } = await supabase
      .from('trends')
      .select('*')
      .order('popularity_index', { ascending: false })
      .limit(20);

    if (trendsError) throw trendsError;

    // Fetch templates for content_type
    let templateQuery = supabase
      .from('content_templates')
      .select('*, usage_count, created_at')
      .eq('content_type', content_type);

    if (platform) {
      templateQuery = templateQuery.contains('platforms', [platform]);
    }

    const { data: templates, error: templatesError } = await templateQuery;

    if (templatesError) throw templatesError;

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, trending_templates: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate trend score for each template
    const trendingTemplates = templates.map(template => {
      let trendScore = 0;
      let trendingReason = '';
      let trendHashtags: string[] = [];

      // 1. Keyword Match with Trends (max 40 points)
      const templateKeywords = [
        template.name.toLowerCase(),
        template.description?.toLowerCase() || '',
        template.category?.toLowerCase() || ''
      ].join(' ');

      for (const trend of trends || []) {
        const trendKeywords = [
          trend.name.toLowerCase(),
          trend.description?.toLowerCase() || ''
        ].join(' ');

        const matchingWords = trendKeywords.split(' ')
          .filter(word => word.length > 3 && templateKeywords.includes(word));

        if (matchingWords.length > 0) {
          const keywordScore = Math.min(matchingWords.length * 10, 40);
          if (keywordScore > trendScore) {
            trendScore = keywordScore;
            trendingReason = `Passt zu Trend: "${trend.name}"`;
            trendHashtags = trend.data_json?.hashtags?.slice(0, 3) || [];
          }
        }
      }

      // 2. Platform Popularity (max 20 points)
      if (platform === 'tiktok' || template.platforms?.includes('tiktok')) {
        trendScore += 20;
        if (!trendingReason) trendingReason = 'Beliebt auf TikTok';
      } else if (platform === 'instagram' || template.platforms?.includes('instagram')) {
        trendScore += 15;
        if (!trendingReason) trendingReason = 'Beliebt auf Instagram';
      }

      // 3. Usage Spike (max 25 points)
      // Calculate if template had 50%+ usage increase in last 7 days
      const usageCount = template.usage_count || 0;
      if (usageCount > 10) {
        trendScore += 25;
        if (!trendingReason) trendingReason = 'Stark steigender Nutzung';
      } else if (usageCount > 5) {
        trendScore += 15;
      }

      // 4. Recency (max 15 points)
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(template.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceCreation < 7) {
        trendScore += 15;
        if (!trendingReason) trendingReason = 'Neu und angesagt';
      } else if (daysSinceCreation < 30) {
        trendScore += 10;
      }

      return {
        ...template,
        trend_score: Math.min(trendScore, 100),
        trending_reason: trendingReason || 'Gutes Template',
        trend_hashtags: trendHashtags
      };
    });

    // Sort by trend score and take top 10
    const sortedTrending = trendingTemplates
      .sort((a, b) => b.trend_score - a.trend_score)
      .slice(0, 10);

    return new Response(
      JSON.stringify({ ok: true, trending_templates: sortedTrending }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get trending templates error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

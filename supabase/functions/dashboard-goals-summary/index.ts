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
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const timeframe = url.searchParams.get('timeframe') || '30'; // days
    const platform = url.searchParams.get('platform') || null;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(timeframe));

    // Fetch goals
    let goalsQuery = supabaseClient
      .from('social_goals')
      .select('*')
      .eq('user_id', user.id);

    if (platform) {
      goalsQuery = goalsQuery.eq('platform', platform);
    }

    const { data: goals, error: goalsError } = await goalsQuery;
    if (goalsError) throw goalsError;

    // Fetch post metrics
    let metricsQuery = supabaseClient
      .from('post_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('posted_at', daysAgo.toISOString())
      .order('posted_at', { ascending: false });

    if (platform) {
      metricsQuery = metricsQuery.eq('provider', platform.toLowerCase());
    }

    const { data: metrics, error: metricsError } = await metricsQuery;
    if (metricsError) throw metricsError;

    // Calculate aggregated metrics
    const totalViews = metrics?.reduce((sum, m) => sum + (m.impressions || 0), 0) || 0;
    const totalLikes = metrics?.reduce((sum, m) => sum + (m.likes || 0), 0) || 0;
    const totalComments = metrics?.reduce((sum, m) => sum + (m.comments || 0), 0) || 0;
    const totalShares = metrics?.reduce((sum, m) => sum + (m.shares || 0), 0) || 0;
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagementRate = metrics && metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.engagement_rate || 0), 0) / metrics.length
      : 0;

    // Calculate goal progress
    const activeGoals = goals?.filter(g => g.status === 'active') || [];
    const completedGoals = goals?.filter(g => g.status === 'completed') || [];
    const avgProgress = activeGoals.length > 0
      ? activeGoals.reduce((sum, g) => sum + (g.progress_percent || 0), 0) / activeGoals.length
      : 0;

    // Find top performers
    const topPerformers = (metrics || [])
      .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
      .slice(0, 5)
      .map(m => ({
        id: m.id,
        postId: m.post_id,
        platform: m.provider,
        caption: m.caption_text?.substring(0, 50) + '...' || 'No caption',
        views: m.impressions || 0,
        likes: m.likes || 0,
        comments: m.comments || 0,
        engagementRate: m.engagement_rate || 0,
        postedAt: m.posted_at,
      }));

    // Calculate trends (compare to previous period)
    const midpoint = new Date(daysAgo);
    midpoint.setDate(midpoint.getDate() + Math.floor(parseInt(timeframe) / 2));
    
    const recentMetrics = metrics?.filter(m => new Date(m.posted_at) >= midpoint) || [];
    const olderMetrics = metrics?.filter(m => new Date(m.posted_at) < midpoint) || [];

    const recentAvgEng = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + (m.engagement_rate || 0), 0) / recentMetrics.length
      : 0;
    const olderAvgEng = olderMetrics.length > 0
      ? olderMetrics.reduce((sum, m) => sum + (m.engagement_rate || 0), 0) / olderMetrics.length
      : 0;

    const engagementTrend = olderAvgEng > 0 
      ? ((recentAvgEng - olderAvgEng) / olderAvgEng) * 100
      : 0;

    // Calculate best posting times (heuristic from data)
    const postingHours = metrics?.map(m => new Date(m.posted_at).getHours()) || [];
    const hourCounts: Record<number, { count: number; totalEng: number }> = {};
    
    metrics?.forEach(m => {
      const hour = new Date(m.posted_at).getHours();
      if (!hourCounts[hour]) {
        hourCounts[hour] = { count: 0, totalEng: 0 };
      }
      hourCounts[hour].count++;
      hourCounts[hour].totalEng += m.engagement_rate || 0;
    });

    const bestHours = Object.entries(hourCounts)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgEngagement: data.totalEng / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    // Generate AI recommendations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let recommendations: any[] = [];

    if (LOVABLE_API_KEY && metrics && metrics.length > 0) {
      const systemPrompt = `Du bist ein Social-Media-Strategie-Experte. Analysiere die folgenden Daten und gib 3-5 umsetzbare Handlungsempfehlungen auf Deutsch. Priorisiere nach Impact (hoch/mittel/niedrig). Jede Empfehlung = max. 2 Sätze, konkret und umsetzungsorientiert.

Daten:
- Aktive Ziele: ${activeGoals.length}
- Durchschnittlicher Fortschritt: ${avgProgress.toFixed(1)}%
- Posts (${timeframe}d): ${metrics.length}
- Durchschn. Engagement-Rate: ${avgEngagementRate.toFixed(2)}%
- Trend: ${engagementTrend > 0 ? '+' : ''}${engagementTrend.toFixed(1)}%
- Beste Posting-Stunden: ${bestHours.map(h => `${h.hour}:00`).join(', ')}

Gib die Empfehlungen als JSON-Array zurück:
[{"title":"Kurzer Titel","detail":"Konkrete Beschreibung","impact":"hoch|mittel|niedrig","eta":"heute|3 Tage|Woche"}]`;

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: systemPrompt }],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '[]';
          
          // Try to extract JSON from markdown code blocks
          let jsonStr = content;
          const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
          }
          
          try {
            recommendations = JSON.parse(jsonStr);
          } catch {
            // Fallback if parsing fails
            recommendations = [
              {
                title: 'Posting-Frequenz erhöhen',
                detail: 'Erhöhe deine Posts auf 5-7 pro Woche für bessere Sichtbarkeit.',
                impact: 'hoch',
                eta: '3 Tage'
              }
            ];
          }
        }
      } catch (error) {
        console.error('AI recommendation error:', error);
      }
    }

    // Determine overall status
    let overallStatus = 'on_track';
    if (avgProgress < 70) {
      overallStatus = 'behind';
    } else if (avgProgress >= 100) {
      overallStatus = 'completed';
    }

    // Calculate achievement progress
    const achievements = {
      consistencyStreak: calculateStreak(metrics || []),
      monthlyPosts: metrics?.length || 0,
      engagementHero: avgEngagementRate > 5,
      goalCompleter: completedGoals.length,
    };

    return new Response(
      JSON.stringify({
        requestId: crypto.randomUUID(),
        progress: {
          active: activeGoals.length,
          completed: completedGoals.length,
          avgProgress: Math.round(avgProgress),
          status: overallStatus,
        },
        metrics: {
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalEngagement,
          avgEngagementRate: parseFloat(avgEngagementRate.toFixed(2)),
          postsCount: metrics?.length || 0,
        },
        trends: {
          engagementTrend: parseFloat(engagementTrend.toFixed(1)),
          bestHours: bestHours.map(h => `${h.hour}:00`),
        },
        topPerformers,
        recommendations,
        achievements,
        goals: goals || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in dashboard-goals-summary:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId: crypto.randomUUID(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function calculateStreak(metrics: any[]): number {
  if (!metrics || metrics.length === 0) return 0;
  
  const sortedDates = metrics
    .map(m => new Date(m.posted_at).toDateString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let streak = 1;
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const current = new Date(sortedDates[i]);
    const next = new Date(sortedDates[i + 1]);
    const diffDays = Math.floor((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

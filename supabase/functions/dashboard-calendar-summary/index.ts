import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueryParams {
  from?: string;
  to?: string;
  platform?: string;
  campaignId?: string;
  tz?: string;
}

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
    const params: QueryParams = {
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      platform: url.searchParams.get('platform') || undefined,
      campaignId: url.searchParams.get('campaignId') || undefined,
      tz: url.searchParams.get('tz') || 'UTC',
    };

    // Default date range: now to +7 days
    const now = new Date();
    const fromDate = params.from ? new Date(params.from) : now;
    const toDate = params.to ? new Date(params.to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch scheduled posts
    let postsQuery = supabaseClient
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (params.platform) {
      postsQuery = postsQuery.eq('platform', params.platform);
    }

    const { data: posts, error: postsError } = await postsQuery.order('scheduled_at', { ascending: true });

    if (postsError) throw postsError;

    // Fetch campaigns for target calculation
    let campaignsQuery = supabaseClient
      .from('campaigns')
      .select('post_frequency, duration_weeks')
      .eq('user_id', user.id);

    if (params.campaignId) {
      campaignsQuery = campaignsQuery.eq('id', params.campaignId);
    }

    const { data: campaigns } = await campaignsQuery;

    // Calculate KPIs
    const scheduled = posts?.filter(p => p.status === 'scheduled').length || 0;
    const published = posts?.filter(p => p.status === 'posted').length || 0;
    const target = campaigns?.reduce((sum, c) => sum + (c.post_frequency || 0), 0) || 10;
    
    // Calculate overdue (scheduled_at < now and not published)
    const overdue = posts?.filter(p => 
      p.status === 'scheduled' && 
      new Date(p.scheduled_at) < now
    ).length || 0;

    // Calculate conflicts (same platform within 15 min)
    const conflicts = calculateConflicts(posts || []);

    // Calculate good slots (heuristic: posts between 10-20h = score ≥ 70)
    const goodSlots = posts?.filter(p => {
      const hour = new Date(p.scheduled_at).getHours();
      return hour >= 10 && hour <= 20;
    }).length || 0;
    const goodSlotsShare = scheduled > 0 ? goodSlots / scheduled : 0;

    // Build events array
    const events = (posts || []).map(p => ({
      id: p.id,
      campaignId: null, // Link to campaign if needed
      platform: p.platform,
      title: p.caption?.substring(0, 30) + '...' || 'Post',
      scheduledAt: p.scheduled_at,
      status: p.status,
      score: calculateScore(p),
    }));

    // Build heatmap (simplified: 7 days × 24 hours, score 0-100)
    const heatmap = buildHeatmap(posts || [], params.platform);

    // Build alerts
    const alerts = [];
    if (conflicts.length > 0) {
      alerts.push({
        type: 'conflict',
        message: `${conflicts.length} Konflikte erkannt – Posts zur gleichen Zeit`,
        relatedIds: conflicts.flat(),
      });
    }
    if (overdue > 0) {
      alerts.push({
        type: 'overdue',
        message: `${overdue} Post(s) überfällig – jetzt veröffentlichen oder neu planen`,
        relatedIds: posts?.filter(p => p.status === 'scheduled' && new Date(p.scheduled_at) < now).map(p => p.id) || [],
      });
    }

    const weekDays = getWeekDays(fromDate, toDate);
    const emptyDays = weekDays.filter(day => {
      const dayPosts = posts?.filter(p => 
        new Date(p.scheduled_at).toDateString() === day.toDateString()
      );
      return !dayPosts || dayPosts.length === 0;
    });
    if (emptyDays.length > 0) {
      alerts.push({
        type: 'empty',
        message: `${emptyDays.length} Tag(e) ohne Slots – jetzt Auto-Planung starten`,
        relatedIds: [],
      });
    }

    return new Response(
      JSON.stringify({
        kpi: {
          scheduled,
          target,
          published,
          overdue,
          conflicts: conflicts.length,
          goodSlotsShare: Math.round(goodSlotsShare * 100) / 100,
        },
        events,
        heatmap,
        alerts,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in dashboard-calendar-summary:', error);
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

function calculateConflicts(posts: any[]): string[][] {
  const conflicts: string[][] = [];
  const sorted = [...posts].sort((a, b) => 
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const post1 = sorted[i];
      const post2 = sorted[j];
      
      if (post1.platform !== post2.platform) continue;
      
      const diff = Math.abs(
        new Date(post1.scheduled_at).getTime() - new Date(post2.scheduled_at).getTime()
      );
      
      // Within 15 minutes
      if (diff < 15 * 60 * 1000) {
        conflicts.push([post1.id, post2.id]);
      }
    }
  }
  
  return conflicts;
}

function calculateScore(post: any): number {
  const hour = new Date(post.scheduled_at).getHours();
  // Simple heuristic: 10-20h = 70-100, 6-10h & 20-23h = 50-70, else 30-50
  if (hour >= 10 && hour <= 20) return 70 + Math.floor(Math.random() * 30);
  if ((hour >= 6 && hour < 10) || (hour > 20 && hour <= 23)) return 50 + Math.floor(Math.random() * 20);
  return 30 + Math.floor(Math.random() * 20);
}

function buildHeatmap(posts: any[], platform?: string): Record<string, number[][]> {
  const platforms = platform ? [platform] : ['instagram', 'facebook', 'tiktok', 'linkedin'];
  const heatmap: Record<string, number[][]> = {};

  platforms.forEach(p => {
    // 7 days × 24 hours
    const grid: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
    
    posts.filter(post => post.platform === p).forEach(post => {
      const date = new Date(post.scheduled_at);
      const day = date.getDay();
      const hour = date.getHours();
      grid[day][hour] += 10; // Increment score
    });

    // Add base heuristic scores
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        if (grid[day][hour] === 0) {
          // Heuristic: 10-20h = high, 6-10h & 20-23h = medium, else low
          if (hour >= 10 && hour <= 20) grid[day][hour] = 60 + Math.floor(Math.random() * 20);
          else if ((hour >= 6 && hour < 10) || (hour > 20 && hour <= 23)) grid[day][hour] = 40 + Math.floor(Math.random() * 20);
          else grid[day][hour] = 20 + Math.floor(Math.random() * 20);
        } else {
          grid[day][hour] = Math.min(100, grid[day][hour] + 50);
        }
      }
    }

    heatmap[p] = grid;
  });

  return heatmap;
}

function getWeekDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(from);
  
  while (current <= to) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

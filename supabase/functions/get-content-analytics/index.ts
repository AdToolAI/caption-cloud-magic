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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { date_range } = await req.json();
    let dateFilter = '';
    
    if (date_range?.start && date_range?.end) {
      dateFilter = `created_at.gte.${date_range.start},created_at.lte.${date_range.end}`;
    }

    // Fetch all content projects
    let query = supabaseClient
      .from('content_projects')
      .select('*')
      .eq('user_id', user.id);

    if (dateFilter) {
      query = query.or(dateFilter);
    }

    const { data: projects, error: projectsError } = await query;

    if (projectsError) {
      console.error('Projects fetch error:', projectsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch projects' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate overview metrics
    const total_videos = projects?.length || 0;
    const completed_videos = projects?.filter(p => p.status === 'completed').length || 0;
    
    // Mock engagement data (in production would come from video_analytics)
    const total_views = Math.floor(Math.random() * 50000) + 10000;
    const avg_engagement = parseFloat((Math.random() * 10 + 2).toFixed(1));

    // Aggregate by content type
    const by_content_type: Record<string, any> = {};
    const content_types = ['ad', 'story', 'reel', 'tutorial', 'testimonial', 'news'];
    
    content_types.forEach(type => {
      const typeProjects = projects?.filter(p => p.content_type === type) || [];
      by_content_type[type] = {
        videos: typeProjects.length,
        avg_engagement: parseFloat((Math.random() * 12 + 3).toFixed(1)),
        views: Math.floor(Math.random() * 10000) + 1000
      };
    });

    // Find most used content type
    const most_used_content_type = Object.entries(by_content_type)
      .sort((a, b) => (b[1] as any).videos - (a[1] as any).videos)[0]?.[0] || 'reel';

    // Top templates (mock data)
    const template_usage: Record<string, number> = {};
    projects?.forEach(p => {
      if (p.template_id) {
        template_usage[p.template_id] = (template_usage[p.template_id] || 0) + 1;
      }
    });

    const top_templates = Object.entries(template_usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([template_id, usage_count]) => ({
        template_id,
        name: `Template ${template_id.slice(0, 8)}`,
        usage_count,
        avg_engagement: parseFloat((Math.random() * 15 + 5).toFixed(1))
      }));

    // Timeline data (last 30 days)
    const timeline = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayProjects = projects?.filter(p => 
        p.created_at.split('T')[0] === dateStr
      ).length || 0;
      
      timeline.push({
        date: dateStr,
        videos_created: dayProjects,
        views: Math.floor(Math.random() * 1000) + 100
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      overview: {
        total_videos,
        completed_videos,
        total_views,
        avg_engagement,
        most_used_content_type
      },
      by_content_type,
      top_templates,
      timeline
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
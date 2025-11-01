import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Heuristic/fallback best times based on industry research
const heuristicTimes = {
  instagram: {
    posts: [
      { day: 0, hour: 11 }, { day: 0, hour: 19 }, // Sunday
      { day: 1, hour: 11 }, { day: 1, hour: 19 }, // Monday
      { day: 2, hour: 11 }, { day: 2, hour: 19 }, // Tuesday
      { day: 3, hour: 11 }, { day: 3, hour: 19 }, { day: 3, hour: 14 }, // Wednesday (best)
      { day: 4, hour: 11 }, { day: 4, hour: 19 }, // Thursday
      { day: 5, hour: 11 }, { day: 5, hour: 19 }, // Friday
      { day: 6, hour: 11 }, { day: 6, hour: 19 }, // Saturday
    ],
    videos: [
      { day: 0, hour: 19 }, { day: 0, hour: 20 },
      { day: 1, hour: 19 }, { day: 1, hour: 20 },
      { day: 2, hour: 19 }, { day: 2, hour: 20 },
      { day: 3, hour: 19 }, { day: 3, hour: 20 }, { day: 3, hour: 21 },
      { day: 4, hour: 19 }, { day: 4, hour: 20 },
      { day: 5, hour: 19 }, { day: 5, hour: 20 }, { day: 5, hour: 21 },
      { day: 6, hour: 19 }, { day: 6, hour: 20 },
    ]
  },
  tiktok: {
    posts: [
      { day: 0, hour: 18 }, { day: 0, hour: 19 },
      { day: 1, hour: 6 }, { day: 1, hour: 18 },
      { day: 2, hour: 6 }, { day: 2, hour: 9 }, { day: 2, hour: 18 }, // Tuesday (best)
      { day: 3, hour: 6 }, { day: 3, hour: 18 },
      { day: 4, hour: 6 }, { day: 4, hour: 18 }, { day: 4, hour: 19 }, // Thursday (best)
      { day: 5, hour: 6 }, { day: 5, hour: 18 }, { day: 5, hour: 19 }, // Friday (best)
      { day: 6, hour: 18 }, { day: 6, hour: 19 },
    ],
    videos: [
      { day: 0, hour: 18 }, { day: 0, hour: 19 },
      { day: 1, hour: 6 }, { day: 1, hour: 18 },
      { day: 2, hour: 6 }, { day: 2, hour: 9 }, { day: 2, hour: 18 },
      { day: 3, hour: 6 }, { day: 3, hour: 18 },
      { day: 4, hour: 6 }, { day: 4, hour: 18 }, { day: 4, hour: 19 },
      { day: 5, hour: 6 }, { day: 5, hour: 18 }, { day: 5, hour: 19 },
      { day: 6, hour: 18 }, { day: 6, hour: 19 },
    ]
  },
  linkedin: {
    posts: [
      { day: 1, hour: 9 }, { day: 1, hour: 17 },
      { day: 2, hour: 9 }, { day: 2, hour: 12 }, { day: 2, hour: 17 }, // Tuesday (best)
      { day: 3, hour: 9 }, { day: 3, hour: 12 }, { day: 3, hour: 17 }, // Wednesday (best)
      { day: 4, hour: 9 }, { day: 4, hour: 17 },
      { day: 5, hour: 9 },
    ],
    videos: [
      { day: 1, hour: 9 }, { day: 1, hour: 12 },
      { day: 2, hour: 9 }, { day: 2, hour: 12 },
      { day: 3, hour: 9 }, { day: 3, hour: 12 },
      { day: 4, hour: 9 }, { day: 4, hour: 12 },
    ]
  },
  youtube: {
    posts: [], // YouTube is primarily video
    videos: [
      { day: 0, hour: 14 }, { day: 0, hour: 19 }, { day: 0, hour: 20 },
      { day: 1, hour: 14 }, { day: 1, hour: 19 },
      { day: 2, hour: 14 }, { day: 2, hour: 19 },
      { day: 3, hour: 14 }, { day: 3, hour: 19 },
      { day: 4, hour: 14 }, { day: 4, hour: 19 }, { day: 4, hour: 20 },
      { day: 5, hour: 14 }, { day: 5, hour: 19 }, { day: 5, hour: 20 },
      { day: 6, hour: 14 }, { day: 6, hour: 19 }, { day: 6, hour: 20 },
    ]
  },
  facebook: {
    posts: [
      { day: 0, hour: 13 }, { day: 0, hour: 19 },
      { day: 1, hour: 13 }, { day: 1, hour: 19 },
      { day: 2, hour: 13 }, { day: 2, hour: 19 },
      { day: 3, hour: 13 }, { day: 3, hour: 19 }, // Wednesday (best)
      { day: 4, hour: 13 }, { day: 4, hour: 19 },
      { day: 5, hour: 13 }, { day: 5, hour: 19 },
      { day: 6, hour: 13 }, { day: 6, hour: 19 },
    ],
    videos: [
      { day: 0, hour: 19 }, { day: 0, hour: 20 },
      { day: 1, hour: 19 },
      { day: 2, hour: 19 },
      { day: 3, hour: 19 }, { day: 3, hour: 20 },
      { day: 4, hour: 19 },
      { day: 5, hour: 19 }, { day: 5, hour: 20 },
      { day: 6, hour: 19 }, { day: 6, hour: 20 },
    ]
  },
  x: {
    posts: [
      { day: 0, hour: 9 }, { day: 0, hour: 12 },
      { day: 1, hour: 9 }, { day: 1, hour: 12 }, { day: 1, hour: 17 },
      { day: 2, hour: 9 }, { day: 2, hour: 12 }, { day: 2, hour: 17 },
      { day: 3, hour: 9 }, { day: 3, hour: 12 }, { day: 3, hour: 17 }, // Wednesday (best)
      { day: 4, hour: 9 }, { day: 4, hour: 12 },
      { day: 5, hour: 9 }, { day: 5, hour: 12 },
      { day: 6, hour: 9 }, { day: 6, hour: 12 },
    ],
    videos: [
      { day: 0, hour: 12 }, { day: 0, hour: 19 },
      { day: 1, hour: 12 }, { day: 1, hour: 19 },
      { day: 2, hour: 12 }, { day: 2, hour: 19 },
      { day: 3, hour: 12 }, { day: 3, hour: 19 },
      { day: 4, hour: 12 }, { day: 4, hour: 19 },
      { day: 5, hour: 12 }, { day: 5, hour: 19 },
      { day: 6, hour: 12 }, { day: 6, hour: 19 },
    ]
  }
};

function createEmptyGrid(): number[][] {
  return Array(7).fill(0).map(() => Array(24).fill(0));
}

function generateHeuristicHeatmap(platform: string, contentType: 'posts' | 'videos'): number[][] {
  const grid = createEmptyGrid();
  const times = heuristicTimes[platform as keyof typeof heuristicTimes]?.[contentType] || [];
  
  times.forEach(({ day, hour }) => {
    grid[day][hour] = 85; // High score for recommended times
    // Add surrounding hours with lower scores
    if (hour > 0) grid[day][hour - 1] = Math.max(grid[day][hour - 1], 60);
    if (hour < 23) grid[day][hour + 1] = Math.max(grid[day][hour + 1], 60);
  });
  
  // Fill remaining hours with baseline
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      if (grid[day][hour] === 0) {
        grid[day][hour] = 30; // Baseline score
      }
    }
  }
  
  return grid;
}

function calculateEngagementScore(post: any): number {
  const reach = post.reach || post.impressions || 1;
  const interactions = (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0);
  return (interactions / reach) * 100;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Try to get auth header from multiple sources
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    console.log('[Heatmap] Headers:', {
      authorization: authHeader ? 'present' : 'missing',
      apikey: req.headers.get('apikey') ? 'present' : 'missing'
    });
    
    if (!authHeader) {
      console.error('[Heatmap] No authorization header provided');
      return new Response(JSON.stringify({ error: 'Unauthorized - No auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    console.log('[Heatmap] Auth result:', { hasUser: !!user, error: authError?.message });
    
    if (!user || authError) {
      console.error('[Heatmap] Auth failed:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized - Invalid token', details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { platforms, date_range } = await req.json();
    const targetPlatforms = platforms || ['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook', 'x'];

    // Fetch user's posts with metrics
    let query = supabaseClient
      .from('post_metrics')
      .select('*')
      .eq('user_id', user.id)
      .not('posted_at', 'is', null);

    if (date_range?.from) {
      query = query.gte('posted_at', date_range.from);
    }
    if (date_range?.to) {
      query = query.lte('posted_at', date_range.to);
    }

    const { data: posts, error } = await query;

    if (error) throw error;

    const postCount = posts?.length || 0;
    const useRealData = postCount >= 10;

    const heatmapPosts: Record<string, number[][]> = {};
    const heatmapVideos: Record<string, number[][]> = {};

    for (const platform of targetPlatforms) {
      if (useRealData) {
        // Real data analysis
        const platformPosts = posts.filter(p => p.provider === platform);
        const postsGrid = createEmptyGrid();
        const videosGrid = createEmptyGrid();
        const postsCount: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));
        const videosCount: number[][] = Array(7).fill(0).map(() => Array(24).fill(0));

        platformPosts.forEach(post => {
          const date = new Date(post.posted_at);
          const day = date.getDay(); // 0 = Sunday
          const hour = date.getHours();
          const score = calculateEngagementScore(post);
          
          const isVideo = post.media_type?.toLowerCase() === 'video';
          
          if (isVideo) {
            videosGrid[day][hour] += score;
            videosCount[day][hour]++;
          } else {
            postsGrid[day][hour] += score;
            postsCount[day][hour]++;
          }
        });

        // Calculate averages and normalize to 0-100
        for (let day = 0; day < 7; day++) {
          for (let hour = 0; hour < 24; hour++) {
            if (postsCount[day][hour] > 0) {
              postsGrid[day][hour] = Math.min(100, Math.round(postsGrid[day][hour] / postsCount[day][hour]));
            } else {
              postsGrid[day][hour] = 30; // Baseline
            }
            
            if (videosCount[day][hour] > 0) {
              videosGrid[day][hour] = Math.min(100, Math.round(videosGrid[day][hour] / videosCount[day][hour]));
            } else {
              videosGrid[day][hour] = 30; // Baseline
            }
          }
        }

        heatmapPosts[platform] = postsGrid;
        heatmapVideos[platform] = videosGrid;
      } else {
        // Fallback to heuristic data
        heatmapPosts[platform] = generateHeuristicHeatmap(platform, 'posts');
        heatmapVideos[platform] = generateHeuristicHeatmap(platform, 'videos');
      }
    }

    return new Response(
      JSON.stringify({
        heatmap_posts: heatmapPosts,
        heatmap_videos: heatmapVideos,
        data_source: useRealData ? 'real' : 'heuristic',
        post_count: postCount,
        analyzed_platforms: targetPlatforms
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in analyze-heatmap-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

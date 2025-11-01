import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PostingSlot {
  slot_start: string;
  slot_end: string;
  score: number;
  reasons: string[];
  features: any;
  platform: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Parse query parameters
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'all';
    const days = parseInt(url.searchParams.get('days') || '14');
    const tz = url.searchParams.get('tz') || 'Europe/Berlin';

    console.log(`[Posting Times API] User: ${user.id}, Platform: ${platform}, Days: ${days}, TZ: ${tz}`);

    // Calculate date range
    const now = new Date();
    const fromDate = now.toISOString();
    const toDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    // Build platform filter
    let platformFilter = platform === 'all' 
      ? ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube']
      : [platform];

    // Fetch posting slots
    const { data: slots, error: slotsError } = await supabase
      .from('posting_slots')
      .select('*')
      .eq('user_id', user.id)
      .in('platform', platformFilter)
      .gte('slot_start', fromDate)
      .lte('slot_start', toDate)
      .order('slot_start', { ascending: true });

    if (slotsError) {
      console.error('[Posting Times API] Error fetching slots:', slotsError);
      throw slotsError;
    }

    console.log(`[Posting Times API] Found ${slots?.length || 0} slots`);

    // Check if user has any history
    const { count: historyCount } = await supabase
      .from('posts_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const hasHistory = (historyCount || 0) > 0;

    // Calculate history days if available
    let historyDays = 0;
    if (hasHistory) {
      const { data: oldestPost } = await supabase
        .from('posts_history')
        .select('published_at')
        .eq('user_id', user.id)
        .order('published_at', { ascending: true })
        .limit(1)
        .single();

      if (oldestPost) {
        historyDays = Math.floor((now.getTime() - new Date(oldestPost.published_at).getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // Group slots by platform and date
    const platformData: Record<string, any[]> = {};

    for (const slot of (slots || [])) {
      if (!platformData[slot.platform]) {
        platformData[slot.platform] = [];
      }

      const slotDate = new Date(slot.slot_start).toISOString().split('T')[0];
      let dayEntry = platformData[slot.platform].find((d: any) => d.date === slotDate);

      if (!dayEntry) {
        dayEntry = { date: slotDate, slots: [] };
        platformData[slot.platform].push(dayEntry);
      }

      dayEntry.slots.push({
        start: slot.slot_start,
        end: slot.slot_end,
        score: slot.score,
        reasons: slot.reasons,
        features: slot.features
      });
    }

    // Sort slots by score and take top 3 per day
    for (const platform of Object.keys(platformData)) {
      for (const dayEntry of platformData[platform]) {
        dayEntry.slots = dayEntry.slots
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 3);
      }
    }

    const response = {
      timezone: tz,
      range: {
        from: fromDate,
        to: toDate
      },
      platforms: platformData,
      metadata: {
        hasHistory,
        historyDays,
        generatedAt: new Date().toISOString(),
        slotsCount: slots?.length || 0
      }
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // 5 min cache
        } 
      }
    );

  } catch (error: any) {
    console.error('[Posting Times API] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: error.message === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

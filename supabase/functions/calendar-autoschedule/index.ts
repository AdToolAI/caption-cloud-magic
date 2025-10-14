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
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { campaignId, postsPerWeek = 5, tz = 'UTC' } = await req.json();

    // Fetch draft posts
    let draftsQuery = supabaseClient
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'draft');

    if (campaignId) {
      // Filter by campaign if needed (add campaign_id to posts table)
      // draftsQuery = draftsQuery.eq('campaign_id', campaignId);
    }

    const { data: drafts } = await draftsQuery.limit(postsPerWeek);

    if (!drafts || drafts.length === 0) {
      return new Response(
        JSON.stringify({ code: 'NO_DRAFTS_AVAILABLE', scheduled: [] }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch existing scheduled posts to avoid conflicts
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: existing } = await supabaseClient
      .from('posts')
      .select('scheduled_at, platform')
      .eq('user_id', user.id)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', weekEnd.toISOString());

    // Get best times dynamically from analyze-posting-times
    const getBestTimesForPlatform = async (platform: string): Promise<number[]> => {
      const defaultTimes: Record<string, number[]> = {
        instagram: [10, 12, 18, 20],
        facebook: [9, 12, 15, 19],
        tiktok: [11, 17, 19, 21],
        linkedin: [8, 12, 17],
        twitter: [9, 12, 15, 18],
      };

      try {
        // Try to get best times from analyze-posting-times
        const { data: bestTimesData, error: timesError } = await supabaseClient.functions.invoke(
          'analyze-posting-times',
          { body: { platform, timezone: tz, niche: 'general', goal: 'engagement', language: 'en' } }
        );

        if (timesError || !bestTimesData?.best_times) {
          return defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
        }

        // Parse best_times from response (format: ["10:00", "14:00", "18:00"])
        const times = bestTimesData.best_times
          .map((time: string) => parseInt(time.split(':')[0]))
          .filter((h: number) => !isNaN(h));

        return times.length > 0 ? times : defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
      } catch (error) {
        console.error('Error fetching best times:', error);
        return defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
      }
    };

    const scheduled = [];
    const existingSlots = new Set(
      (existing || []).map(e => `${e.platform}:${new Date(e.scheduled_at).toISOString()}`)
    );

    for (const draft of drafts) {
      const platform = draft.platform;
      const times = await getBestTimesForPlatform(platform);
      
      let slot = null;
      
      // Try each day of the week
      for (let dayOffset = 0; dayOffset < 7 && !slot; dayOffset++) {
        const testDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        
        // Skip if hour is in the past
        for (const hour of times) {
          testDate.setHours(hour, 0, 0, 0);
          
          if (testDate <= now) continue;
          
          // Check if slot is free (no post within ±15 min)
          const isFree = await checkSlotFree(
            testDate, 
            draft.platform, 
            existingSlots,
            supabaseClient,
            campaignId || '', // workspace_id - using campaignId as fallback
            undefined // brand_kit_id
          );
          
          if (isFree) {
            slot = testDate;
            existingSlots.add(`${draft.platform}:${slot.toISOString()}`);
            break;
          }
        }
      }

      if (slot) {
        const { data: updated } = await supabaseClient
          .from('posts')
          .update({ 
            scheduled_at: slot.toISOString(),
            status: 'scheduled',
          })
          .eq('id', draft.id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updated) {
          scheduled.push({
            id: updated.id,
            platform: updated.platform,
            scheduledAt: updated.scheduled_at,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        code: 'POSTS_SCHEDULED',
        count: scheduled.length,
        scheduled,
        preview: scheduled.map(s => ({
          platform: s.platform,
          time: new Date(s.scheduledAt).toISOString(),
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in calendar-autoschedule:', error);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        code: 'INTERNAL_ERROR',
        requestId: crypto.randomUUID(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function checkSlotFree(
  testTime: Date, 
  platform: string, 
  existingSlots: Set<string>,
  supabaseClient: any,
  workspaceId: string,
  brandKitId?: string
): Promise<boolean> {
  const minTime = new Date(testTime.getTime() - 18 * 60 * 60 * 1000); // 18h before
  const maxTime = new Date(testTime.getTime() + 18 * 60 * 60 * 1000); // 18h after

  for (const slot of existingSlots) {
    const [slotPlatform, slotTime] = slot.split(':');
    if (slotPlatform !== platform) continue;
    
    const slotDate = new Date(slotTime);
    if (slotDate >= minTime && slotDate <= maxTime) {
      return false;
    }
  }

  // Check blackout hours (23:00 - 06:00)
  const hour = testTime.getHours();
  if (hour >= 23 || hour < 6) return false;

  // Check blackout dates from database
  const dateStr = testTime.toISOString().split('T')[0];
  const { data: blackouts } = await supabaseClient
    .from('calendar_blackout_dates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('date', dateStr);

  if (blackouts && blackouts.length > 0) {
    for (const blackout of blackouts) {
      // If brand-specific blackout, check brand_kit_id match
      if (blackout.brand_kit_id && blackout.brand_kit_id !== brandKitId) {
        continue;
      }

      // If all-day blackout, slot is not free
      if (blackout.all_day) {
        return false;
      }

      // Check time range blackout
      if (blackout.start_time && blackout.end_time) {
        const testTimeStr = testTime.toTimeString().split(' ')[0].substring(0, 5);
        if (testTimeStr >= blackout.start_time && testTimeStr <= blackout.end_time) {
          return false;
        }
      }
    }
  }

  return true;
}

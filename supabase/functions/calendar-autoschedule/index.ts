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

    const { workspace_id, brand_kit_id, events } = await req.json();

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ code: 'NO_EVENTS_PROVIDED', suggestions: [] }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch existing scheduled events to avoid conflicts
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: existing } = await supabaseClient
      .from('calendar_events')
      .select('start_at, channels')
      .eq('workspace_id', workspace_id)
      .gte('start_at', now.toISOString())
      .lte('start_at', weekEnd.toISOString());

    // Get best times dynamically from analyze-posting-times
    const getBestTimesForPlatform = async (channels: string[]): Promise<number[]> => {
      const defaultTimes: Record<string, number[]> = {
        instagram: [10, 12, 18, 20],
        facebook: [9, 12, 15, 19],
        tiktok: [11, 17, 19, 21],
        linkedin: [8, 12, 17],
        twitter: [9, 12, 15, 18],
      };

      const platform = channels[0] || 'instagram';
      
      try {
        const { data: bestTimesData, error: timesError } = await supabaseClient.functions.invoke(
          'analyze-posting-times',
          { body: { platform, timezone: 'UTC', niche: 'general', goal: 'engagement', language: 'en' } }
        );

        if (timesError || !bestTimesData?.best_times) {
          return defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
        }

        const times = bestTimesData.best_times
          .map((time: string) => parseInt(time.split(':')[0]))
          .filter((h: number) => !isNaN(h));

        return times.length > 0 ? times : defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
      } catch (error) {
        console.error('Error fetching best times:', error);
        return defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18];
      }
    };

    const suggestions = [];
    const existingSlots = new Set(
      (existing || []).map(e => `${e.channels.join(',')}:${new Date(e.start_at).toISOString()}`)
    );

    for (const event of events) {
      const channels = event.channels || ['instagram'];
      const times = await getBestTimesForPlatform(channels);
      
      let bestSlot = null;
      let bestScore = 0;
      let bestReason = 'GOOD_TIME';
      
      // Try each day of the week
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const testDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        
        for (const hour of times) {
          testDate.setHours(hour, 0, 0, 0);
          
          if (testDate <= now) continue;
          
          const channelKey = channels.join(',');
          const isFree = await checkSlotFree(
            testDate, 
            channelKey, 
            existingSlots,
            supabaseClient,
            workspace_id,
            event.brand_kit_id || brand_kit_id
          );
          
          if (isFree) {
            // Calculate score
            let score = 50; // Base score
            
            // Best time from analyze-posting-times: +40
            if (times.includes(hour)) {
              score += 40;
              bestReason = 'PRIME_TIME';
            }
            
            // No conflict within 18h: +30
            const hasNearbyConflict = Array.from(existingSlots).some(slot => {
              const [slotChannel, slotTime] = slot.split(':');
              if (slotChannel !== channelKey) return false;
              const slotDate = new Date(slotTime);
              const diff = Math.abs(testDate.getTime() - slotDate.getTime());
              return diff < 18 * 60 * 60 * 1000;
            });
            if (!hasNearbyConflict) score += 30;
            
            // Optimal weekday (Mon-Thu): +10
            const dayOfWeek = testDate.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 4) {
              score += 10;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestSlot = testDate;
              existingSlots.add(`${channelKey}:${bestSlot.toISOString()}`);
            }
            
            break; // Found a slot for this day
          }
        }
        
        if (bestSlot) break; // Found optimal slot
      }

      if (bestSlot) {
        suggestions.push({
          event_id: event.id,
          suggested_time: bestSlot.toISOString(),
          score: bestScore,
          reason_key: bestReason,
        });
      }
    }

    return new Response(
      JSON.stringify({ suggestions }),
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
  channelKey: string, 
  existingSlots: Set<string>,
  supabaseClient: any,
  workspaceId: string,
  brandKitId?: string
): Promise<boolean> {
  const minTime = new Date(testTime.getTime() - 18 * 60 * 60 * 1000);
  const maxTime = new Date(testTime.getTime() + 18 * 60 * 60 * 1000);

  for (const slot of existingSlots) {
    const [slotChannel, slotTime] = slot.split(':');
    if (slotChannel !== channelKey) continue;
    
    const slotDate = new Date(slotTime);
    if (slotDate >= minTime && slotDate <= maxTime) {
      return false;
    }
  }

  const hour = testTime.getHours();
  if (hour >= 23 || hour < 6) return false;

  const dateStr = testTime.toISOString().split('T')[0];
  const { data: blackouts } = await supabaseClient
    .from('calendar_blackout_dates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('date', dateStr);

  if (blackouts && blackouts.length > 0) {
    for (const blackout of blackouts) {
      if (blackout.brand_kit_id && blackout.brand_kit_id !== brandKitId) {
        continue;
      }

      if (blackout.all_day) {
        return false;
      }

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

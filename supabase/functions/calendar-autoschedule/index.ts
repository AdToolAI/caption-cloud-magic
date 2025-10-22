import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    // Fetch existing scheduled events to avoid conflicts (exclude currently selected events)
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const selectedEventIds = events.map((e: any) => e.id);

    const { data: existing } = await supabaseClient
      .from('calendar_events')
      .select('start_at, channels')
      .eq('workspace_id', workspace_id)
      .not('id', 'in', `(${selectedEventIds.join(',')})`)
      .gte('start_at', now.toISOString())
      .lte('start_at', weekEnd.toISOString());

    // Get best times dynamically from analyze-posting-times
    const getBestTimesForPlatform = async (channels: string[]): Promise<{ times: number[], preferredDays: string[] }> => {
  const defaultTimes: Record<string, number[]> = {
    instagram: [10, 12, 18, 20],
    facebook: [9, 12, 15, 19],
    tiktok: [11, 17, 19, 21],
    linkedin: [8, 12, 17],
    twitter: [9, 12, 15, 18],
    youtube: [14, 16, 18, 20],
  };

      const platform = channels[0] || 'instagram';
      
      try {
    const { data: bestTimesData, error: timesError } = await supabaseClient.functions.invoke(
          'analyze-posting-times',
          { body: { platform, timezone: 'UTC', niche: 'general', goal: 'engagement', language: 'en' } }
        );

        if (timesError || !bestTimesData?.best_times) {
          return { times: defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18], preferredDays: [] };
        }

    const times = bestTimesData.best_times
      .flatMap((timeWindow: string) => {
        // Extract all hours from "Wednesday 19:00-21:00" → [19, 20, 21]
        const match = timeWindow.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
        if (!match) return [];
        
        const startHour = parseInt(match[1]);
        const endHour = parseInt(match[3]);
        
        // Generate array of hours in the window
        const hours = [];
        for (let h = startHour; h <= endHour; h++) {
          hours.push(h);
        }
        return hours;
      })
      .filter((h: number) => !isNaN(h) && h >= 6 && h <= 23);

    // Extract preferred days from AI response
    const preferredDays = bestTimesData.best_times
      .map((timeWindow: string) => {
        const dayMatch = timeWindow.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
        return dayMatch ? dayMatch[1].toLowerCase() : null;
      })
      .filter(Boolean);

    console.log(`[AI-Schedule] Extracted hours from AI for ${channels.join(',')}: ${times.join(', ')}`);
    console.log(`[AI-Schedule] Preferred days from AI: ${preferredDays.join(', ')}`);

        return { 
          times: times.length > 0 ? times : defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18],
          preferredDays
        };
      } catch (error) {
        console.error('Error fetching best times:', error);
        return { 
          times: defaultTimes[platform as keyof typeof defaultTimes] || [10, 14, 18],
          preferredDays: []
        };
      }
    };

    const suggestions = [];
    const existingSlots = new Set(
      (existing || []).map(e => `${e.channels.join(',')}:${new Date(e.start_at).toISOString()}`)
    );

    for (const event of events) {
      console.log(`[AI-Schedule] Processing event: ${event.title} (${event.id})`);
      console.log(`[AI-Schedule] Current start_at: ${event.start_at || 'null'}`);
      
      const channels = event.channels || ['instagram'];
      const bestTimeData = await getBestTimesForPlatform(channels);
      const times = bestTimeData.times;
      const preferredDays = bestTimeData.preferredDays;
      console.log(`[AI-Schedule] Best times for ${channels.join(',')}: ${times.join(', ')}`);
      
      // Remove this event's current time from conflict check
      if (event.start_at) {
        const channelKey = channels.join(',');
        const oldSlot = `${channelKey}:${new Date(event.start_at).toISOString()}`;
        existingSlots.delete(oldSlot);
      }

      // Helper: Check if day is preferred
      const isDayPreferred = (date: Date): boolean => {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[date.getDay()];
        return preferredDays.includes(dayName);
      };
      
      let bestSlot = null;
      let bestScore = 0;
      let bestReason = 'GOOD_TIME';
      let bestReasonDetails: string[] = [];
      
      // Try next 14 days for better options
      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
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
            // Calculate score with detailed reasons
            let score = 50; // Base score
            let reasonDetails: string[] = [];
            
            // AI-recommended day bonus: +20
            if (isDayPreferred(testDate)) {
              score += 20;
              const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
              reasonDetails.push(`📅 ${dayNames[testDate.getDay()]} - AI-empfohlener Tag`);
            }
            
            // Best time from analyze-posting-times: +40
            if (times.includes(hour)) {
              score += 40;
              bestReason = 'PRIME_TIME';
              reasonDetails.push(`🎯 Beste Engagement-Zeit für ${channels[0].toUpperCase()}`);
            }
            
            // No conflict within 18h: +30
            const hasNearbyConflict = Array.from(existingSlots).some(slot => {
              const [slotChannel, slotTime] = slot.split(':');
              if (slotChannel !== channelKey) return false;
              const slotDate = new Date(slotTime);
              const diff = Math.abs(testDate.getTime() - slotDate.getTime());
              return diff < 18 * 60 * 60 * 1000;
            });
            if (!hasNearbyConflict) {
              score += 30;
              reasonDetails.push('✅ Keine Konflikte in den nächsten 18h');
            }
            
            // Weekend bonus for YouTube/TikTok: +10
            const isWeekend = testDate.getDay() === 0 || testDate.getDay() === 6;
            if (isWeekend && (channels.includes('youtube') || channels.includes('tiktok'))) {
              score += 10;
              reasonDetails.push('🎉 Wochenende - Höhere Reichweite');
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestSlot = testDate;
              bestReasonDetails = reasonDetails;
              existingSlots.add(`${channelKey}:${bestSlot.toISOString()}`);
            }
            
            // Only break if we found a really good slot
            if (score >= 100) break;
          }
        }
        
        // Continue searching for better slots across days
      }

      if (bestSlot) {
        console.log(`[AI-Schedule] Found slot for ${event.title}: ${bestSlot.toISOString()} (score: ${bestScore}%)`);
        suggestions.push({
          event_id: event.id,
          event_title: event.title,
          suggested_time: bestSlot.toISOString(),
          score: bestScore,
          reason_key: bestReason,
          reason_details: bestReasonDetails.join(' • '),
        });
      } else {
        console.warn(`[AI-Schedule] No suitable slot found for ${event.title}`);
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

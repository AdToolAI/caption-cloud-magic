import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use SERVICE_ROLE_KEY for direct DB access without user token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { workspace_id, brand_kit_id, platform, start_date, weeks = 2 } = await req.json();
    
    console.log('[Timeline-Slots] Request:', { workspace_id, platform, start_date, weeks, brand_kit_id });

    if (!workspace_id || !platform || !start_date) {
      const missing = [];
      if (!workspace_id) missing.push('workspace_id');
      if (!platform) missing.push('platform');
      if (!start_date) missing.push('start_date');
      
      console.error('[Timeline-Slots] Missing fields:', missing);
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields', 
          missing_fields: missing 
        }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[Timeline-Slots] Processing request for workspace:', workspace_id);

    console.log(`[Timeline-Slots] Generating ${weeks}-week timeline for ${platform}`);

    // Fetch optimal times from analyze-posting-times
    const { data: timesData, error: timesError } = await supabaseClient.functions.invoke(
      'analyze-posting-times',
      {
        body: {
          platform,
          timezone: 'Europe/Berlin',
          niche: 'general',
          goal: 'engagement',
          language: 'de'
        }
      }
    );

    if (timesError) {
      console.error('[Timeline-Slots] Error fetching times:', timesError);
    }

    const bestTimesData = timesData || {};
    console.log('[Timeline-Slots] Best times data:', JSON.stringify(bestTimesData));

    // Parse time windows and preferred days
    const timeWindows: Array<{ day: string; startHour: number; endHour: number }> = [];
    const preferredDays = new Set<string>();

    if (bestTimesData.best_times && Array.isArray(bestTimesData.best_times)) {
      for (const timeWindow of bestTimesData.best_times) {
        const dayMatch = timeWindow.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
        const timeMatch = timeWindow.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);

        if (dayMatch && timeMatch) {
          const day = dayMatch[1].toLowerCase();
          preferredDays.add(day);
          timeWindows.push({
            day,
            startHour: parseInt(timeMatch[1]),
            endHour: parseInt(timeMatch[3])
          });
        }
      }
    }

    console.log('[Timeline-Slots] Parsed time windows:', timeWindows);
    console.log('[Timeline-Slots] Preferred days:', Array.from(preferredDays));

    // Fetch existing events to check conflicts
    const { data: existingEvents } = await supabaseClient
      .from('calendar_events')
      .select('start_at, channels')
      .eq('workspace_id', workspace_id)
      .gte('start_at', start_date);

    const existingSlots = new Set(
      (existingEvents || []).map(e => `${e.channels?.join(',')}:${e.start_at}`)
    );

    // Fetch blackout dates
    const endDate = new Date(start_date);
    endDate.setDate(endDate.getDate() + (weeks * 7));

    const { data: blackoutDates } = await supabaseClient
      .from('calendar_blackout_dates')
      .select('*')
      .eq('workspace_id', workspace_id)
      .gte('date', start_date)
      .lte('date', endDate.toISOString().split('T')[0]);

    const blackoutMap = new Map(
      (blackoutDates || []).map(bd => [bd.date, bd])
    );

    // Generate timeline
    const timeline = [];
    const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const dayNamesEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const startDateTime = new Date(start_date);

    for (let dayOffset = 0; dayOffset < (weeks * 7); dayOffset++) {
      const currentDate = new Date(startDateTime.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();
      const dayNameDe = dayNames[dayOfWeek];
      const dayNameEn = dayNamesEn[dayOfWeek];

      // Check if day is preferred by AI
      const isDayPreferred = preferredDays.has(dayNameEn);

      // Check blackout
      const blackout = blackoutMap.get(dateStr);

      // Generate slots for this day
      const slots = [];

      // Find time windows for this day
      const dayTimeWindows = timeWindows.filter(tw => tw.day === dayNameEn);

      if (dayTimeWindows.length > 0) {
        // Use AI-recommended windows
        for (const window of dayTimeWindows) {
          for (let hour = window.startHour; hour <= window.endHour; hour++) {
            const timeStart = `${hour.toString().padStart(2, '0')}:00`;
            const timeEnd = `${(hour + 1).toString().padStart(2, '0')}:00`;
            const testTime = new Date(currentDate);
            testTime.setHours(hour, 0, 0, 0);

            if (testTime <= new Date()) continue;

            // Check if slot is blocked
            let isBlocked = false;
            let blockReason = '';

            if (blackout) {
              if (blackout.all_day) {
                isBlocked = true;
                blockReason = blackout.reason || 'Blackout Date';
              }
            }

            // Check conflicts
            const slotKey = `${platform}:${testTime.toISOString()}`;
            if (existingSlots.has(slotKey)) {
              isBlocked = true;
              blockReason = 'Event bereits geplant';
            }

            // Calculate score
            let score = 50;
            const reasons = [];

            if (isDayPreferred) {
              score += 20;
              reasons.push(`📅 ${dayNameDe} - AI-empfohlener Tag`);
            }

            if (hour >= window.startHour && hour <= window.endHour) {
              score += 40;
              reasons.push(`🎯 Prime Time für ${platform.toUpperCase()}`);
            }

            if (!isBlocked) {
              score += 30;
              reasons.push('✅ Keine Konflikte');
            }

            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            if (isWeekend && (platform === 'youtube' || platform === 'tiktok')) {
              score += 10;
              reasons.push('🎉 Wochenende - Höhere Reichweite');
            }

            slots.push({
              time_start: timeStart,
              time_end: timeEnd,
              score,
              reason: isBlocked ? `⚠️ ${blockReason}` : reasons.join(' • '),
              is_blocked: isBlocked,
              estimated_reach_boost: Math.min(score, 200)
            });
          }
        }
      } else {
        // Fallback times if no AI data for this day
        const fallbackHours = [10, 14, 18, 20];
        for (const hour of fallbackHours) {
          const timeStart = `${hour.toString().padStart(2, '0')}:00`;
          const timeEnd = `${(hour + 1).toString().padStart(2, '0')}:00`;
          const testTime = new Date(currentDate);
          testTime.setHours(hour, 0, 0, 0);

          if (testTime <= new Date()) continue;

          let isBlocked = false;
          if (blackout?.all_day) {
            isBlocked = true;
          }

          const slotKey = `${platform}:${testTime.toISOString()}`;
          if (existingSlots.has(slotKey)) {
            isBlocked = true;
          }

          slots.push({
            time_start: timeStart,
            time_end: timeEnd,
            score: 70,
            reason: isBlocked ? '⚠️ Slot blockiert' : 'Standard-Zeitfenster',
            is_blocked: isBlocked,
            estimated_reach_boost: 70
          });
        }
      }

      timeline.push({
        date: dateStr,
        day_name: dayNameDe,
        day_of_week: dayOfWeek,
        slots: slots.sort((a, b) => 
          a.time_start.localeCompare(b.time_start)
        )
      });
    }

    console.log(`[Timeline-Slots] Generated timeline with ${timeline.length} days`);

    return new Response(
      JSON.stringify({ timeline }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[Timeline-Slots] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

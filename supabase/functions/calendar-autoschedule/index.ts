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
        JSON.stringify({ message: 'Keine Draft-Posts zum Planen vorhanden', scheduled: [] }),
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

    // Best times per platform (simplified heuristic)
    const bestTimes = {
      instagram: [10, 12, 18, 20],
      facebook: [9, 12, 15, 19],
      tiktok: [11, 17, 19, 21],
      linkedin: [8, 12, 17],
      twitter: [9, 12, 15, 18],
    };

    const scheduled = [];
    const existingSlots = new Set(
      (existing || []).map(e => `${e.platform}:${new Date(e.scheduled_at).toISOString()}`)
    );

    for (const draft of drafts) {
      const platform = draft.platform as keyof typeof bestTimes;
      const times = bestTimes[platform] || [10, 14, 18];
      
      let slot = null;
      
      // Try each day of the week
      for (let dayOffset = 0; dayOffset < 7 && !slot; dayOffset++) {
        const testDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        
        // Skip if hour is in the past
        for (const hour of times) {
          testDate.setHours(hour, 0, 0, 0);
          
          if (testDate <= now) continue;
          
          // Check if slot is free (no post within ±15 min)
          const isFree = checkSlotFree(testDate, draft.platform, existingSlots);
          
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
        message: `${scheduled.length} Post(s) erfolgreich eingeplant`,
        scheduled,
        preview: scheduled.map(s => ({
          platform: s.platform,
          time: new Date(s.scheduledAt).toLocaleString('de-DE'),
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

function checkSlotFree(testTime: Date, platform: string, existingSlots: Set<string>): boolean {
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

  return true;
}

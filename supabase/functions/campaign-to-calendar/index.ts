import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function selectOptimalSlot(slots: any[], postType: string): any {
  if (!slots || slots.length === 0) return null;
  
  // Reels: Evening (18:00-22:00)
  if (postType === 'Reel') {
    const slot = slots.find(s => {
      const hour = parseInt(s.start.split('T')[1].substring(0, 2));
      return hour >= 18 && hour <= 22;
    });
    if (slot) return slot;
  }
  
  // Stories: Morning/Midday (09:00-13:00)
  if (postType === 'Story') {
    const slot = slots.find(s => {
      const hour = parseInt(s.start.split('T')[1].substring(0, 2));
      return hour >= 9 && hour <= 13;
    });
    if (slot) return slot;
  }
  
  // Static Posts: Midday/Afternoon (12:00-16:00)
  if (postType === 'Static Post') {
    const slot = slots.find(s => {
      const hour = parseInt(s.start.split('T')[1].substring(0, 2));
      return hour >= 12 && hour <= 16;
    });
    if (slot) return slot;
  }
  
  // Default: highest score
  return slots.reduce((best, slot) => 
    slot.score > best.score ? slot : best
  );
}

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

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { campaignId, startDate } = await req.json();

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'campaignId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get campaign and its posts
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      throw new Error('Campaign not found');
    }

    if (!campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get campaign posts separately
    const { data: campaignPosts, error: postsError } = await supabaseClient
      .from('campaign_posts')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('week_number', { ascending: true });

    if (postsError) {
      console.error('Error fetching campaign posts:', postsError);
      throw new Error('Failed to fetch campaign posts');
    }

    campaign.campaign_posts = campaignPosts || [];


    // Get user's workspace
    const { data: workspace } = await supabaseClient
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'No workspace found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get optimal posting times for each platform
    const platforms = campaign.platform;
    const postingTimesMap: Record<string, any> = {};

    for (const platform of platforms) {
      try {
        const { data, error } = await supabaseClient.functions.invoke('posting-times-api', {
          body: { 
            platform: platform.toLowerCase(), 
            days: 14,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone 
          }
        });

        if (!error && data) {
          postingTimesMap[platform] = data;
        }
      } catch (err) {
        console.error(`Error fetching posting times for ${platform}:`, err);
      }
    }

    // Create calendar events for each post
    const eventsToCreate = [];
    const baseDate = new Date(startDate || Date.now());
    
    // Group posts by week
    const postsByWeek: Record<number, any[]> = {};
    for (const post of campaign.campaign_posts) {
      if (!postsByWeek[post.week_number]) {
        postsByWeek[post.week_number] = [];
      }
      postsByWeek[post.week_number].push(post);
    }

    for (const [weekNum, posts] of Object.entries(postsByWeek)) {
      const weekNumber = parseInt(weekNum);
      const weekOffset = (weekNumber - 1) * 7;

      for (const post of posts) {
        // Map day to date
        const dayMap: Record<string, number> = {
          'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
          'Friday': 5, 'Saturday': 6, 'Sunday': 0
        };

        const targetDayOfWeek = dayMap[post.day] ?? 1;
        const postDate = new Date(baseDate);
        postDate.setDate(postDate.getDate() + weekOffset);
        
        // Find the target day of week
        while (postDate.getDay() !== targetDayOfWeek) {
          postDate.setDate(postDate.getDate() + 1);
        }

        // Get optimal time for this platform and post type
        let optimalTime = '12:00'; // Default
        const primaryPlatform = platforms[0].toLowerCase();
        
        if (postingTimesMap[platforms[0]]) {
          const timesData = postingTimesMap[platforms[0]];
          const dateStr = postDate.toISOString().split('T')[0];
          
          // Find matching date in posting times
          const platformData = timesData.platforms?.[primaryPlatform];
          if (platformData) {
            const dayData = platformData.find((d: any) => d.date === dateStr);
            if (dayData && dayData.slots && dayData.slots.length > 0) {
              const bestSlot = selectOptimalSlot(dayData.slots, post.post_type);
              if (bestSlot) {
                optimalTime = bestSlot.start.split('T')[1].substring(0, 5);
              }
            }
          }
        }

        // Use post.best_time if provided by AI, otherwise use calculated optimal time
        const finalTime = post.best_time || optimalTime;
        const [hours, minutes] = finalTime.split(':');
        postDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const eventData = {
          workspace_id: workspace.id,
          campaign_id: campaignId,
          title: post.title,
          brief: `Week ${post.week_number} - ${post.day}`,
          caption: post.caption_outline,
          hashtags: post.hashtags,
          channels: platforms,
          status: 'scheduled',
          start_at: postDate.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          created_by: user.id,
          owner_id: user.id,
          media_url: post.media_url || null,
          media_type: post.media_type || null,
        };

        eventsToCreate.push(eventData);
      }
    }

    // Bulk insert events
    const { data: createdEvents, error: insertError } = await supabaseClient
      .from('calendar_events')
      .insert(eventsToCreate)
      .select();

    if (insertError) {
      console.error('Error creating events:', insertError);
      throw insertError;
    }

    const createdCount = createdEvents?.length || 0;

    return new Response(
      JSON.stringify({
        success: true,
        eventsCreated: createdCount,
        message: `${createdCount} Posts wurden im Kalender eingeplant`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in campaign-to-calendar:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

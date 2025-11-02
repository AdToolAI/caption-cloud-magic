import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PostingSlot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
}

interface PostingTimesDay {
  date: string;
  slots: PostingSlot[];
}

Deno.serve(async (req) => {
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { campaignId, startDate, workspaceId } = await req.json();

    console.log('[campaign-to-planner] Processing:', { campaignId, startDate, workspaceId, userId: user.id });

    // 1. Load campaign and posts
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      console.error('[campaign-to-planner] Campaign not found:', campaignError);
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: campaignPosts, error: postsError } = await supabaseClient
      .from('campaign_posts')
      .select('*')
      .eq('campaign_id', campaignId);

    if (postsError) {
      console.error('[campaign-to-planner] Error loading posts:', postsError);
      return new Response(JSON.stringify({ error: 'Failed to load posts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validate workspace
    const { data: workspace } = await supabaseClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single();

    if (!workspace) {
      console.error('[campaign-to-planner] Workspace not found');
      return new Response(JSON.stringify({ error: 'Workspace not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Get or create weekplan
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(endDateObj.getDate() + (campaign.duration_weeks * 7));

    let weekplanId = null;
    
    const { data: existingWeekplan } = await supabaseClient
      .from('weekplans')
      .select('id')
      .eq('workspace_id', workspaceId)
      .gte('end_date', startDateObj.toISOString())
      .lte('start_date', endDateObj.toISOString())
      .single();

    if (existingWeekplan) {
      weekplanId = existingWeekplan.id;
    } else {
      const { data: newWeekplan, error: weekplanError } = await supabaseClient
        .from('weekplans')
        .insert({
          workspace_id: workspaceId,
          title: `${campaign.title} Plan`,
          start_date: startDateObj.toISOString(),
          end_date: endDateObj.toISOString(),
        })
        .select()
        .single();

      if (weekplanError) {
        console.error('[campaign-to-planner] Error creating weekplan:', weekplanError);
        return new Response(JSON.stringify({ error: 'Failed to create weekplan' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      weekplanId = newWeekplan.id;
    }

    console.log('[campaign-to-planner] Using weekplan:', weekplanId);

    // 4. Get posting times for all platforms
    const platforms = campaign.platform as string[];
    const durationDays = campaign.duration_weeks * 7;
    const tz = 'Europe/Berlin';

    const postingTimesMap: Record<string, PostingTimesDay[]> = {};

    for (const platform of platforms) {
      try {
        const { data: timesData, error: timesError } = await supabaseClient.functions.invoke('posting-times-api', {
          body: { platform, days: durationDays, tz }
        });

        if (!timesError && timesData?.platforms?.[platform]) {
          postingTimesMap[platform] = timesData.platforms[platform];
        } else {
          console.warn(`[campaign-to-planner] No posting times for ${platform}`);
          postingTimesMap[platform] = [];
        }
      } catch (error) {
        console.error(`[campaign-to-planner] Error fetching times for ${platform}:`, error);
        postingTimesMap[platform] = [];
      }
    }

    // 5. Get existing blocks to avoid conflicts
    const { data: existingBlocks } = await supabaseClient
      .from('schedule_blocks')
      .select('start_at, end_at, platform')
      .eq('workspace_id', workspaceId)
      .eq('weekplan_id', weekplanId);

    const occupiedSlots = new Set(
      (existingBlocks || []).map((block: any) => 
        `${block.platform}:${new Date(block.start_at).toISOString()}`
      )
    );

    // 6. Helper function to select optimal slot
    const selectOptimalSlot = (
      slots: PostingSlot[], 
      postType: string, 
      platform: string,
      dayOffset: number
    ): PostingSlot | null => {
      const targetDate = new Date(startDateObj);
      targetDate.setDate(targetDate.getDate() + dayOffset);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Filter slots for the target day
      const daySlots = slots.filter(slot => slot.start.startsWith(targetDateStr));

      // Filter out occupied slots
      const freeSlots = daySlots.filter(slot => {
        const slotKey = `${platform}:${slot.start}`;
        return !occupiedSlots.has(slotKey);
      });

      if (freeSlots.length === 0) return null;

      // Score boost based on post type
      const scoredSlots = freeSlots.map(slot => {
        let boostedScore = slot.score;
        const hour = new Date(slot.start).getHours();

        // Reels & Videos → Evening (18-22)
        if ((postType === 'Reel' || postType === 'Story') && hour >= 18 && hour <= 22) {
          boostedScore += 15;
        }

        // Static Posts → Afternoon (11-15)
        if ((postType === 'Static Post' || postType === 'Carousel') && hour >= 11 && hour <= 15) {
          boostedScore += 10;
        }

        // Link Posts → Morning (9-12)
        if (postType === 'Link Post' && hour >= 9 && hour <= 12) {
          boostedScore += 5;
        }

        return { ...slot, boostedScore };
      });

      // Sort by boosted score
      scoredSlots.sort((a, b) => b.boostedScore - a.boostedScore);

      return scoredSlots[0] || null;
    };

    // 7. Create schedule blocks for each post
    let blocksCreated = 0;
    const blocksToInsert = [];

    for (const post of campaignPosts || []) {
      const platform = platforms[0]; // Default to first platform
      const postType = post.post_type;
      
      // Calculate day offset from week and day
      const weekNumber = post.week_number || 1;
      const dayMap: Record<string, number> = {
        'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
        'Friday': 4, 'Saturday': 5, 'Sunday': 6
      };
      const dayOffset = ((weekNumber - 1) * 7) + (dayMap[post.day] || 0);

      // Get slots for this platform
      const platformSlots = postingTimesMap[platform] || [];
      const allSlots = platformSlots.flatMap(day => day.slots);

      const optimalSlot = selectOptimalSlot(allSlots, postType, platform, dayOffset);

      if (!optimalSlot) {
        console.warn(`[campaign-to-planner] No optimal slot found for post: ${post.title}`);
        continue;
      }

      // Create content_item first
      const { data: contentItem, error: contentError } = await supabaseClient
        .from('content_items')
        .insert({
          workspace_id: workspaceId,
          type: 'post',
          caption: post.caption_outline,
          hashtags: post.hashtags,
          media_urls: post.media_url ? [post.media_url] : [],
          source: 'campaign',
          source_id: post.id,
        })
        .select()
        .single();

      if (contentError) {
        console.error('[campaign-to-planner] Error creating content_item:', contentError);
        continue;
      }

      // Calculate end time (15 minutes after start)
      const startAt = new Date(optimalSlot.start);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + 15);

      // Create schedule block
      blocksToInsert.push({
        workspace_id: workspaceId,
        weekplan_id: weekplanId,
        platform: platform,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        content_id: contentItem.id,
        status: 'scheduled',
        caption: post.caption_outline,
        hashtags: post.hashtags,
        media_urls: post.media_url ? [post.media_url] : [],
      });

      // Mark slot as occupied
      occupiedSlots.add(`${platform}:${optimalSlot.start}`);
      blocksCreated++;
    }

    // Batch insert all blocks
    if (blocksToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('schedule_blocks')
        .insert(blocksToInsert);

      if (insertError) {
        console.error('[campaign-to-planner] Error inserting blocks:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create schedule blocks' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[campaign-to-planner] Created ${blocksCreated} blocks successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        blocksCreated,
        weekplanId,
        message: `✅ ${blocksCreated} Posts erfolgreich im Content-Planner eingeplant`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('[campaign-to-planner] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

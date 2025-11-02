import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // 1. Load campaign
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

    // 2. Extract posts from campaign.ai_json
    const aiJson = campaign.ai_json;
    if (!aiJson || !aiJson.weeks || aiJson.weeks.length === 0) {
      console.error('[campaign-to-planner] No posts in campaign ai_json');
      return new Response(JSON.stringify({ error: 'No posts found in campaign' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Flatten weeks into posts array
    const allPosts = [];
    for (const week of aiJson.weeks) {
      if (week.posts && Array.isArray(week.posts)) {
        for (const post of week.posts) {
          allPosts.push({
            ...post,
            week_number: week.week_number,
          });
        }
      }
    }

    if (allPosts.length === 0) {
      console.error('[campaign-to-planner] No posts extracted from weeks');
      return new Response(JSON.stringify({ error: 'No posts found in campaign' }), {
        status: 400,
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
      .maybeSingle();

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

      if (weekplanError || !newWeekplan) {
        console.error('[campaign-to-planner] Error creating weekplan:', weekplanError);
        return new Response(JSON.stringify({ error: 'Failed to create weekplan' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      weekplanId = newWeekplan.id;
    }

    console.log('[campaign-to-planner] Using weekplan:', weekplanId);

    // 4. Create schedule blocks for posts
    let blocksCreated = 0;
    const dayMap: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
      'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };

    // Time slots based on post type (simplified without API call for now)
    const getOptimalTime = (postType: string, dayOffset: number): Date => {
      const baseDate = new Date(startDateObj);
      baseDate.setDate(baseDate.getDate() + dayOffset);
      
      // Set optimal hours based on post type
      switch (postType) {
        case 'Reel':
        case 'Story':
          baseDate.setHours(19, 0, 0, 0); // Evening
          break;
        case 'Static Post':
        case 'Carousel':
          baseDate.setHours(14, 0, 0, 0); // Afternoon
          break;
        default:
          baseDate.setHours(11, 0, 0, 0); // Morning
      }
      
      return baseDate;
    };

    const blocksToInsert = [];
    const platform = Array.isArray(campaign.platform) ? campaign.platform[0] : campaign.platform;

    for (const post of allPosts) {
      // Calculate day offset
      const weekNumber = post.week_number || 1;
      const dayOffset = ((weekNumber - 1) * 7) + (dayMap[post.day] || 0);
      
      // Get optimal posting time
      const startAt = getOptimalTime(post.post_type, dayOffset);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + 15);

      // Create content_item
      const { data: contentItem, error: contentError } = await supabaseClient
        .from('content_items')
        .insert({
          workspace_id: workspaceId,
          type: 'post',
          caption: post.caption_outline || '',
          hashtags: post.hashtags || [],
          media_urls: post.media_url ? [post.media_url] : [],
          source: 'campaign',
          source_id: post.id,
        })
        .select()
        .single();

      if (contentError || !contentItem) {
        console.error('[campaign-to-planner] Error creating content_item:', contentError);
        continue;
      }

      // Add block to batch insert
      blocksToInsert.push({
        workspace_id: workspaceId,
        weekplan_id: weekplanId,
        platform: platform,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        content_id: contentItem.id,
        status: 'scheduled',
        caption: post.caption_outline || '',
        hashtags: post.hashtags || [],
        media_urls: post.media_url ? [post.media_url] : [],
      });

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

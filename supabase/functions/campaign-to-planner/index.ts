import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getRedisCache } from "../_shared/redis-cache.ts";

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
    const allPosts: any[] = [];
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

    let weekplanId = null;
    
    // Try to find existing weekplan for this workspace
    const { data: existingWeekplan } = await supabaseClient
      .from('weekplans')
      .select('id')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingWeekplan) {
      weekplanId = existingWeekplan.id;
    } else {
      const { data: newWeekplan, error: weekplanError } = await supabaseClient
        .from('weekplans')
        .insert({
          workspace_id: workspaceId,
          name: `${campaign.title} Plan`,
          start_date: startDateObj.toISOString(),
          weeks: campaign.duration_weeks,
          timezone: 'Europe/Berlin',
          default_platforms: Array.isArray(campaign.platform) ? campaign.platform : [campaign.platform],
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
    let errors: Array<{ post: string; error: string }> = [];
    const dayMap: Record<string, number> = {
      'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
      'Friday': 4, 'Saturday': 5, 'Sunday': 6
    };

    // Map campaign post types to content_item types
    const mapPostType = (postType: string): string => {
      switch (postType) {
        case 'Reel':
        case 'Video':
        case 'Story':
          return 'video';
        case 'Static Post':
        case 'Carousel':
          return 'image';
        default:
          return 'post';
      }
    };

    // Time slots based on post type
    const getOptimalTime = (postType: string, dayOffset: number): Date => {
      const baseDate = new Date(startDateObj);
      baseDate.setDate(baseDate.getDate() + dayOffset);
      
      // Set optimal hours based on post type
      switch (postType) {
        case 'Reel':
        case 'Story':
          baseDate.setHours(19, 0, 0, 0); // Evening - best for short-form
          break;
        case 'Video':
          baseDate.setHours(17, 0, 0, 0); // Late afternoon - best for long-form
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

    // Use all platforms instead of just the first one
    const platforms = Array.isArray(campaign.platform) ? campaign.platform : [campaign.platform];

    // BATCH INSERT: Prepare all content items first
    const contentItemsToInsert = allPosts.map((post) => {
      const hashtags = post.hashtags || [];
      const mediaUrl = post.media_url;
      
      return {
        workspace_id: workspaceId,
        type: mapPostType(post.post_type),
        title: post.title || post.post_type || 'Campaign Post',
        caption: post.caption_outline || '',
        tags: hashtags,
        thumb_url: mediaUrl || null,
        targets: platforms,
        source: 'campaign',
        source_id: null,
      };
    });

    console.log(`[campaign-to-planner] Batch inserting ${contentItemsToInsert.length} content items`);

    // Single batch insert for all content items
    const { data: contentItems, error: contentError } = await supabaseClient
      .from('content_items')
      .insert(contentItemsToInsert)
      .select();

    if (contentError || !contentItems) {
      console.error('[campaign-to-planner] Batch content insert error:', contentError);
      return new Response(JSON.stringify({ error: 'Failed to create content items: ' + contentError?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[campaign-to-planner] Created ${contentItems.length} content items`);

    // Now create all schedule blocks
    const blocksToInsert: any[] = [];
    
    contentItems.forEach((contentItem, index) => {
      const post = allPosts[index];
      const weekNumber = post.week_number || 1;
      const dayOffset = ((weekNumber - 1) * 7) + (dayMap[post.day] || 0);
      const startAt = getOptimalTime(post.post_type, dayOffset);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + 15);
      const hashtags = post.hashtags || [];
      const mediaUrl = post.media_url;

      for (const platform of platforms) {
        blocksToInsert.push({
          workspace_id: workspaceId,
          weekplan_id: weekplanId,
          platform: platform,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          content_id: contentItem.id,
          status: 'draft',
          caption_override: post.caption_outline || '',
          meta: {
            campaign_id: campaignId,
            campaign_name: campaign.title,
            hashtags: hashtags,
            media_urls: mediaUrl ? [mediaUrl] : [],
            post_type: post.post_type,
            week_number: weekNumber,
            day: post.day,
          },
        });
      }
      blocksCreated++;
    });

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
    
    if (errors.length > 0) {
      console.warn(`[campaign-to-planner] ${errors.length} posts had errors:`, errors);
    }

    // Invalidate relevant caches before returning response
    const cache = getRedisCache();
    await cache.invalidate(`planner:${workspaceId}:*`);
    await cache.invalidate(`dashboard-calendar:${user.id}:*`);
    console.log(`[campaign-to-planner] Invalidated caches for workspace ${workspaceId} and user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        blocksCreated,
        weekplanId,
        errors: errors.length > 0 ? errors : undefined,
        message: `✅ ${blocksCreated} Posts erfolgreich im Content-Planner eingeplant${errors.length > 0 ? ` (${errors.length} Fehler)` : ''}`,
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Graph API GET request
async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`https://graph.facebook.com/v24.0${path}`);
  url.searchParams.append('access_token', token);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.log(`[Graph API] GET ${path}`, params);
  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    console.error(`[Graph API Error]`, data);
    throw new Error(data.error?.message || 'Graph API request failed');
  }

  return data;
}

// Step 1: Get Page Token dynamically
async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const data = await graphGet('/me/accounts', { fields: 'id,access_token' }, userToken);
  
  const page = data.data?.find((p: any) => p.id === pageId);
  if (!page) {
    throw new Error(`Page ${pageId} not found in /me/accounts. Ensure the user has access.`);
  }

  console.log(`[Token] Page token retrieved for page ${pageId}`);
  return page.access_token;
}

// Step 2: Get Instagram User ID from Page
async function getIgUserId(pageId: string, pageToken: string): Promise<string> {
  const data = await graphGet(`/${pageId}`, { fields: 'connected_instagram_account' }, pageToken);
  
  const igUserId = data.connected_instagram_account?.id;
  if (!igUserId) {
    throw new Error('Page not connected to Instagram account. Link them in Facebook Business Manager.');
  }

  console.log(`[IG User] Instagram User ID: ${igUserId}`);
  return igUserId;
}

// Step 3: Get Account Insights (reach + followers)
async function getAccountInsights(igUserId: string, pageToken: string) {
  // Reach for day
  const reachDay = await graphGet(`/${igUserId}/insights`, {
    metric: 'reach',
    period: 'day'
  }, pageToken);

  // Reach for week (optional)
  let reachWeek = null;
  try {
    const weekData = await graphGet(`/${igUserId}/insights`, {
      metric: 'reach',
      period: 'week'
    }, pageToken);
    reachWeek = weekData.data?.[0]?.values?.[0]?.value || null;
  } catch (e) {
    console.warn('[Reach Week] Not available:', e);
  }

  // Reach for 28 days (optional)
  let reach28d = null;
  try {
    const days28Data = await graphGet(`/${igUserId}/insights`, {
      metric: 'reach',
      period: 'days_28'
    }, pageToken);
    reach28d = days28Data.data?.[0]?.values?.[0]?.value || null;
  } catch (e) {
    console.warn('[Reach 28d] Not available:', e);
  }

  // Followers count (snapshot)
  const profile = await graphGet(`/${igUserId}`, {
    fields: 'followers_count,media_count,username'
  }, pageToken);

  return {
    reachDay: reachDay.data?.[0]?.values?.[0]?.value || 0,
    reachWeek,
    reach28d,
    followersCount: profile.followers_count || 0,
    mediaCount: profile.media_count || 0,
    username: profile.username
  };
}

// Step 4: Get Media List
async function getMediaList(igUserId: string, pageToken: string, sinceDate?: Date) {
  const data = await graphGet(`/${igUserId}/media`, {
    fields: 'id,media_type,caption,permalink,thumbnail_url,timestamp',
    limit: '50'
  }, pageToken);

  let media = data.data || [];

  // Filter by date if provided
  if (sinceDate) {
    media = media.filter((m: any) => new Date(m.timestamp) >= sinceDate);
  }

  console.log(`[Media] Found ${media.length} media items`);
  return media;
}

// Step 5: Get Media Insights (v24-conform)
async function getMediaInsights(mediaId: string, mediaType: string, pageToken: string) {
  let metrics = ['reach', 'saved'];
  
  // Add 'plays' for VIDEO/REEL
  if (mediaType === 'VIDEO' || mediaType === 'REEL') {
    metrics.push('plays');
  }

  try {
    const data = await graphGet(`/${mediaId}/insights`, {
      metric: metrics.join(',')
    }, pageToken);

    const result: any = {
      reach: 0,
      saved: 0,
      plays: null
    };

    data.data?.forEach((item: any) => {
      if (item.name === 'reach') result.reach = item.values?.[0]?.value || 0;
      if (item.name === 'saved') result.saved = item.values?.[0]?.value || 0;
      if (item.name === 'plays') result.plays = item.values?.[0]?.value || 0;
    });

    return result;
  } catch (e: any) {
    console.warn(`[Media Insights] Failed for ${mediaId}:`, e.message);
    return { reach: 0, saved: 0, plays: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user token for updating social_connections
    const authHeader = req.headers.get('authorization');
    const userToken = authHeader?.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${userToken}` } }
    });

    // Get secrets
    const fbUserToken = Deno.env.get('FB_USER_LL_TOKEN');
    const igPageId = Deno.env.get('IG_PAGE_ID');

    if (!fbUserToken || !igPageId) {
      throw new Error('Missing FB_USER_LL_TOKEN or IG_PAGE_ID in secrets');
    }

    console.log('[Sync Start] Instagram Graph API sync initiated');

    // Step 1: Get Page Token (dynamic, never cache)
    const pageToken = await getPageToken(fbUserToken, igPageId);

    // Step 2: Get Instagram User ID
    const igUserId = await getIgUserId(igPageId, pageToken);

    // Step 3: Get Account Insights
    const insights = await getAccountInsights(igUserId, pageToken);
    console.log('[Insights]', insights);

    // Save account daily metrics
    const today = new Date().toISOString().split('T')[0];
    const { error: dailyError } = await supabase
      .from('ig_account_daily')
      .upsert({
        date: today,
        ig_user_id: igUserId,
        reach_day: insights.reachDay,
        reach_week: insights.reachWeek,
        reach_28d: insights.reach28d,
        followers_count: insights.followersCount,
        media_count: insights.mediaCount
      }, { onConflict: 'date,ig_user_id' });

    if (dailyError) {
      console.error('[DB Error] ig_account_daily:', dailyError);
      throw dailyError;
    }

    // Step 4: Get Media List (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const mediaList = await getMediaList(igUserId, pageToken, sevenDaysAgo);

    // Step 5: Upsert Media and fetch insights
    let metricsUpdated = 0;
    for (const media of mediaList) {
      // Upsert media
      const { error: mediaError } = await supabase
        .from('ig_media')
        .upsert({
          media_id: media.id,
          ig_user_id: igUserId,
          media_type: media.media_type,
          caption: media.caption || null,
          permalink: media.permalink,
          thumbnail_url: media.thumbnail_url || null,
          timestamp: media.timestamp
        }, { onConflict: 'media_id' });

      if (mediaError) {
        console.error(`[DB Error] ig_media ${media.id}:`, mediaError);
        continue;
      }

      // Get media insights
      const metrics = await getMediaInsights(media.id, media.media_type, pageToken);

      // Upsert media metrics
      const { error: metricsError } = await supabase
        .from('ig_media_metrics')
        .upsert({
          media_id: media.id,
          reach: metrics.reach,
          saved: metrics.saved,
          plays: metrics.plays,
          last_updated: new Date().toISOString()
        }, { onConflict: 'media_id' });

      if (metricsError) {
        console.error(`[DB Error] ig_media_metrics ${media.id}:`, metricsError);
      } else {
        metricsUpdated++;
      }
    }

    console.log(`[Sync Complete] ${metricsUpdated}/${mediaList.length} media metrics updated`);

    // Update last_sync_at in social_connections
    const { data: userData } = await supabaseUser.auth.getUser();
    if (userData?.user?.id) {
      const { error: syncUpdateError } = await supabaseUser
        .from('social_connections')
        .update({ 
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('provider', 'instagram')
        .eq('user_id', userData.user.id);

      if (syncUpdateError) {
        console.error('[Update last_sync_at Error]', syncUpdateError);
      } else {
        console.log('[Update last_sync_at] Success');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        igUserId,
        username: insights.username,
        followers: insights.followersCount,
        reachToday: insights.reachDay,
        mediaSynced: metricsUpdated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Sync Error]', error);
    
    // Check for specific error codes
    let errorMessage = error.message;
    if (error.message?.includes('(#190)')) {
      errorMessage = 'Token expired. Please regenerate a new Long-Lived User Access Token.';
    } else if (error.message?.includes('(#10)')) {
      errorMessage = 'Permission error. Ensure token has: instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement';
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: error.message 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Make GET requests to Facebook Graph API
async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`https://graph.facebook.com/v24.0${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  console.log(`[Graph API] GET ${url.pathname}?${url.searchParams.toString().replace(/access_token=[^&]+/g, 'access_token=***')}`);
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Graph API Error: ${JSON.stringify(error)}`);
  }
  
  return response.json();
}

// Helper: Get Page Access Token from User Token
async function getPageToken(userToken: string, pageId: string): Promise<string> {
  console.log('[Token] Fetching page token dynamically...');
  
  const data = await graphGet('/me/accounts', {}, userToken);
  
  if (!data.data || data.data.length === 0) {
    throw new Error('No pages found for this user. Make sure you have a Facebook Page connected.');
  }
  
  const page = data.data.find((p: any) => p.id === pageId);
  if (!page) {
    throw new Error(`Page ID ${pageId} not found in user's pages. Available: ${data.data.map((p: any) => p.id).join(', ')}`);
  }
  
  console.log(`[Token] Page token retrieved for page: ${page.name} (${pageId})`);
  return page.access_token;
}

// Helper: Parse metric value from Graph API response
function parseMetricValue(data: any, metricName: string): number {
  if (!data?.data || data.data.length === 0) {
    console.log(`[Metric] ${metricName}: No data returned (using 0)`);
    return 0;
  }
  
  const metric = data.data.find((m: any) => m.name === metricName);
  if (!metric || !metric.values || metric.values.length === 0) {
    console.log(`[Metric] ${metricName}: Not available (using 0)`);
    return 0;
  }
  
  const value = metric.values[0].value || 0;
  console.log(`[Metric] ${metricName}: ${value}`);
  return value;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[FB Sync] Starting Facebook Page sync...');
    
    // Initialize Supabase clients
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
    const fbPageId = Deno.env.get('IG_PAGE_ID'); // Same ID used for FB Page
    const fbAppId = Deno.env.get('FB_APP_ID');
    const fbAppSecret = Deno.env.get('FB_APP_SECRET');

    if (!fbUserToken) {
      throw new Error('FB_USER_LL_TOKEN not configured. Please set up your Facebook user token.');
    }
    if (!fbPageId) {
      throw new Error('IG_PAGE_ID not configured. This is your Facebook Page ID.');
    }
    if (!fbAppId || !fbAppSecret) {
      console.warn('[Warning] FB_APP_ID or FB_APP_SECRET not set. Some features may be limited.');
    }

    // Get Page Access Token dynamically
    const pageToken = await getPageToken(fbUserToken, fbPageId);

    // Fetch Facebook Page Daily Insights (new metrics after Nov 2025 deprecation)
    console.log('[FB Insights] Fetching daily metrics (new API)...');
    let dailyInsights;
    try {
      dailyInsights = await graphGet(
        `/${fbPageId}/insights`,
        {
          metric: 'page_media_view',
          period: 'day',
        },
        pageToken
      );
    } catch (error) {
      console.warn('[FB Insights] page_media_view not available:', error);
      dailyInsights = { data: [] };
    }

    // Fetch Facebook Page Follows (replaces deprecated page_fans)
    console.log('[FB Insights] Fetching follows total...');
    let followsData;
    try {
      followsData = await graphGet(
        `/${fbPageId}/insights`,
        {
          metric: 'page_follows',
          period: 'day',
        },
        pageToken
      );
    } catch (error) {
      console.warn('[FB Insights] page_follows metric not available:', error);
      followsData = { data: [] };
    }

    // Parse metrics — map new metric names to existing DB columns
    const impressions = parseMetricValue(dailyInsights, 'page_media_view');
    const postEngagements = 0; // Deprecated — no page-level replacement
    const totalActions = 0;    // Deprecated — no page-level replacement
    const videoViews = 0;      // Now included in page_media_view
    const fansTotal = parseMetricValue(followsData, 'page_follows');

    // Get today's date in ISO format (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // Upsert into fb_page_daily
    console.log(`[DB] Upserting fb_page_daily for date: ${today}`);
    const { error: upsertError } = await supabase
      .from('fb_page_daily')
      .upsert(
        {
          date: today,
          page_id: fbPageId,
          impressions,
          post_engagements: postEngagements,
          total_actions: totalActions,
          video_views: videoViews,
          fans_total: fansTotal,
        },
        {
          onConflict: 'date,page_id',
        }
      );

    if (upsertError) {
      console.error('[DB Error] Failed to upsert fb_page_daily:', upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    console.log('[DB] fb_page_daily upserted successfully');

    // Update last_sync_at in social_connections for Facebook
    const { data: userData } = await supabaseUser.auth.getUser();
    if (userData?.user?.id) {
      const { error: syncUpdateError } = await supabaseUser
        .from('social_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('provider', 'facebook')
        .eq('user_id', userData.user.id);

      if (syncUpdateError) {
        console.error('[Update last_sync_at Error]', syncUpdateError);
      } else {
        console.log('[Update last_sync_at] Success for Facebook');
      }
    }

    console.log('[FB Sync] Complete!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Facebook Page sync completed successfully',
        data: {
          date: today,
          pageId: fbPageId,
          metrics: {
            impressions,
            postEngagements,
            totalActions,
            videoViews,
            fansTotal,
          },
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[FB Sync Error]', error);

    // Enhanced error messages for common issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = errorMessage;
    if (errorMessage.includes('OAuthException') && errorMessage.includes('190')) {
      userMessage = 'Your Facebook access token has expired. Please reconnect your Facebook account (Token renews every 60 days).';
    } else if (errorMessage.includes('100')) {
      userMessage = 'Some Facebook metrics are not available. This might be due to insufficient permissions or the page being too new.';
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: userMessage,
        details: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

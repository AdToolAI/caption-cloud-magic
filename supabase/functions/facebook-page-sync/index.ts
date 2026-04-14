import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`https://graph.facebook.com/v24.0${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  console.log(`[Graph] GET ${url.pathname}`);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Graph API Error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[FB Sync] Starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Authenticate user
    const authHeader = req.headers.get('authorization');
    const jwt = authHeader?.replace('Bearer ', '');
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await supabaseUser.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error('Unauthorized');

    // Load Facebook connection from social_connections
    const { data: conn, error: connErr } = await supabase
      .from('social_connections')
      .select('account_id, access_token_hash, account_metadata')
      .eq('user_id', userId)
      .eq('provider', 'facebook')
      .single();

    if (connErr || !conn) throw new Error('No Facebook connection found. Please connect your Facebook account first.');
    if (!conn.access_token_hash) throw new Error('No access token stored. Please reconnect Facebook.');
    if ((conn.account_metadata as any)?.selection_required) throw new Error('Please select a Facebook Page first.');

    const pageId = conn.account_id;
    if (!pageId) throw new Error('No Page ID found. Please select a Facebook Page.');

    // Decrypt page access token
    const pageToken = await decryptToken(conn.access_token_hash);
    console.log(`[FB Sync] Page ${pageId} token decrypted`);

    // ── 1. Fetch individual posts with engagement ──
    console.log('[FB Sync] Fetching posts...');
    let postsData;
    try {
      postsData = await graphGet(`/${pageId}/posts`, {
        fields: 'id,message,created_time,permalink_url,shares,reactions.summary(true),comments.summary(true)',
        limit: '50',
      }, pageToken);
    } catch (e) {
      console.error('[FB Sync] Posts fetch failed:', e);
      postsData = { data: [] };
    }

    const posts = postsData?.data || [];
    console.log(`[FB Sync] Got ${posts.length} posts`);

    // Fetch insights for each post (impressions/reach)
    let upsertedCount = 0;
    for (const post of posts) {
      let impressions = 0;
      let reach = 0;

      // Try new metrics first (post_total_media_view), fallback to legacy (post_impressions)
      try {
        const insights = await graphGet(`/${post.id}/insights`, {
          metric: 'post_total_media_view,post_total_media_view_unique',
        }, pageToken);
        for (const m of insights?.data || []) {
          if (m.name === 'post_total_media_view') impressions = m.values?.[0]?.value || 0;
          if (m.name === 'post_total_media_view_unique') reach = m.values?.[0]?.value || 0;
        }
        console.log(`[FB Sync] Used new metrics for ${post.id}`);
      } catch {
        // Fallback to legacy metrics
        try {
          const insights = await graphGet(`/${post.id}/insights`, {
            metric: 'post_impressions,post_impressions_unique',
          }, pageToken);
          for (const m of insights?.data || []) {
            if (m.name === 'post_impressions') impressions = m.values?.[0]?.value || 0;
            if (m.name === 'post_impressions_unique') reach = m.values?.[0]?.value || 0;
          }
          console.log(`[FB Sync] Used legacy metrics for ${post.id}`);
        } catch {
          // Some posts (shared, etc.) may not have insights
        }
      }

      const likes = post.reactions?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;

      const { error: upsertErr } = await supabase
        .from('post_metrics')
        .upsert({
          user_id: userId,
          provider: 'facebook',
          account_id: pageId,
          post_id: post.id,
          external_id: post.id,
          post_url: post.permalink_url || null,
          caption_text: post.message || null,
          posted_at: post.created_time,
          likes,
          comments,
          shares,
          reach,
          impressions,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,provider,post_id',
        });

      if (upsertErr) {
        console.error(`[FB Sync] Upsert error for ${post.id}:`, upsertErr.message);
      } else {
        upsertedCount++;
      }
    }

    console.log(`[FB Sync] Upserted ${upsertedCount}/${posts.length} posts into post_metrics`);

    // ── 2. Page-level insights → fb_page_daily ──
    console.log('[FB Sync] Fetching page insights...');
    const today = new Date().toISOString().split('T')[0];

    let pageImpressions = 0;
    let pageFollows = 0;

    // Try new page_media_view first, fallback to legacy page_impressions
    try {
      const daily = await graphGet(`/${pageId}/insights`, {
        metric: 'page_media_view',
        period: 'day',
      }, pageToken);
      pageImpressions = daily?.data?.[0]?.values?.[0]?.value || 0;
    } catch {
      try {
        const daily = await graphGet(`/${pageId}/insights`, {
          metric: 'page_impressions',
          period: 'day',
        }, pageToken);
        pageImpressions = daily?.data?.[0]?.values?.[0]?.value || 0;
      } catch { /* metric may not be available */ }
    }

    try {
      const follows = await graphGet(`/${pageId}/insights`, {
        metric: 'page_follows',
        period: 'day',
      }, pageToken);
      pageFollows = follows?.data?.[0]?.values?.[0]?.value || 0;
    } catch { /* metric may not be available */ }

    await supabase.from('fb_page_daily').upsert({
      date: today,
      page_id: pageId,
      impressions: pageImpressions,
      fans_total: pageFollows,
      post_engagements: 0,
      total_actions: 0,
      video_views: 0,
    }, { onConflict: 'date,page_id' });

    // ── 3. Update last_sync_at ──
    await supabaseUser.from('social_connections').update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('provider', 'facebook').eq('user_id', userId);

    console.log('[FB Sync] Complete!');

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${upsertedCount} Facebook posts`,
      data: { date: today, pageId, postsUpserted: upsertedCount, pageImpressions, pageFollows },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[FB Sync Error]', error);
    const msg = error instanceof Error ? error.message : String(error);
    let userMsg = msg;
    if (msg.includes('OAuthException') && msg.includes('190')) {
      userMsg = 'Your Facebook access token has expired. Please reconnect your Facebook account.';
    }

    return new Response(JSON.stringify({ success: false, error: userMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

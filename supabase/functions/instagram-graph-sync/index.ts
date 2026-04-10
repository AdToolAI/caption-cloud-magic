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
    console.log('[IG Sync] Starting...');

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

    // Load Instagram connection from social_connections
    const { data: conn, error: connErr } = await supabase
      .from('social_connections')
      .select('account_id, access_token_hash, account_metadata')
      .eq('user_id', userId)
      .eq('provider', 'instagram')
      .single();

    if (connErr || !conn) throw new Error('No Instagram connection found. Please connect your Instagram account first.');
    if (!conn.access_token_hash) throw new Error('No access token stored. Please reconnect Instagram.');

    // Decrypt the page access token
    const pageToken = await decryptToken(conn.access_token_hash);
    console.log('[IG Sync] Token decrypted');

    // The account_id for Instagram connections IS the IG User ID
    const metadata = conn.account_metadata as any;
    const igUserId = metadata?.ig_user_id || conn.account_id;
    if (!igUserId) throw new Error('No Instagram User ID found. Please reconnect Instagram.');
    console.log(`[IG Sync] IG User ID: ${igUserId}`);

    // Get profile info
    let username = '';
    let followersCount = 0;
    let mediaCount = 0;
    try {
      const profile = await graphGet(`/${igUserId}`, {
        fields: 'followers_count,media_count,username',
      }, pageToken);
      username = profile.username || '';
      followersCount = profile.followers_count || 0;
      mediaCount = profile.media_count || 0;
    } catch { /* optional */ }

    // ── 1. Fetch media (last 90 days) ──
    console.log('[IG Sync] Fetching media...');
    let mediaData;
    try {
      mediaData = await graphGet(`/${igUserId}/media`, {
        fields: 'id,media_type,caption,permalink,thumbnail_url,timestamp,like_count,comments_count',
        limit: '50',
      }, pageToken);
    } catch (e) {
      console.error('[IG Sync] Media fetch failed:', e);
      mediaData = { data: [] };
    }

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const allMedia = (mediaData?.data || []).filter(
      (m: any) => new Date(m.timestamp) >= ninetyDaysAgo
    );
    console.log(`[IG Sync] Got ${allMedia.length} media items (last 90 days)`);

    // ── 2. Fetch insights per media & upsert to post_metrics + ig_media ──
    let upsertedCount = 0;
    for (const media of allMedia) {
      let reach = 0;
      let saved = 0;
      let plays: number | null = null;
      let impressions = 0;

      // Get per-media insights
      try {
        const metrics = media.media_type === 'VIDEO' || media.media_type === 'REEL'
          ? ['reach', 'saved', 'plays']
          : ['reach', 'saved'];

        const insightsData = await graphGet(`/${media.id}/insights`, {
          metric: metrics.join(','),
        }, pageToken);

        for (const m of insightsData?.data || []) {
          if (m.name === 'reach') reach = m.values?.[0]?.value || 0;
          if (m.name === 'saved') saved = m.values?.[0]?.value || 0;
          if (m.name === 'plays') plays = m.values?.[0]?.value || 0;
        }
        impressions = reach; // IG reach ≈ impressions for our purposes
      } catch {
        // Some media may not have insights (stories, etc.)
      }

      const likes = media.like_count || 0;
      const comments = media.comments_count || 0;

      // Upsert into post_metrics (for PlatformOverviewCards)
      const { error: upsertErr } = await supabase
        .from('post_metrics')
        .upsert({
          user_id: userId,
          provider: 'instagram',
          account_id: igUserId,
          post_id: media.id,
          external_id: media.id,
          post_url: media.permalink || null,
          caption_text: media.caption || null,
          posted_at: media.timestamp,
          likes,
          comments,
          shares: 0,
          saves: saved,
          reach,
          impressions,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,provider,post_id',
        });

      if (upsertErr) {
        console.error(`[IG Sync] post_metrics upsert error for ${media.id}:`, upsertErr.message);
      } else {
        upsertedCount++;
      }

      // Also keep legacy ig_media + ig_media_metrics tables
      await supabase.from('ig_media').upsert({
        media_id: media.id,
        ig_user_id: igUserId,
        media_type: media.media_type,
        caption: media.caption || null,
        permalink: media.permalink,
        thumbnail_url: media.thumbnail_url || null,
        timestamp: media.timestamp,
      }, { onConflict: 'media_id' });

      await supabase.from('ig_media_metrics').upsert({
        media_id: media.id,
        reach,
        saved,
        plays,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'media_id' });
    }

    console.log(`[IG Sync] Upserted ${upsertedCount}/${allMedia.length} posts into post_metrics`);

    // ── 3. Account daily insights → ig_account_daily ──
    const today = new Date().toISOString().split('T')[0];
    let reachDay = 0;
    try {
      const reachData = await graphGet(`/${igUserId}/insights`, {
        metric: 'reach',
        period: 'day',
      }, pageToken);
      reachDay = reachData.data?.[0]?.values?.[0]?.value || 0;
    } catch { /* optional */ }

    await supabase.from('ig_account_daily').upsert({
      date: today,
      ig_user_id: igUserId,
      reach_day: reachDay,
      followers_count: followersCount,
      media_count: mediaCount,
    }, { onConflict: 'date,ig_user_id' });

    // ── 4. Update last_sync_at ──
    await supabaseUser.from('social_connections').update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('provider', 'instagram').eq('user_id', userId);

    console.log('[IG Sync] Complete!');

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${upsertedCount} Instagram posts`,
      data: { igUserId, username, followers: followersCount, postsUpserted: upsertedCount },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[IG Sync Error]', error);
    const msg = error instanceof Error ? error.message : String(error);
    let userMsg = msg;
    if (msg.includes('OAuthException') && msg.includes('190')) {
      userMsg = 'Your Instagram access token has expired. Please reconnect your Instagram account.';
    }

    return new Response(JSON.stringify({ success: false, error: userMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

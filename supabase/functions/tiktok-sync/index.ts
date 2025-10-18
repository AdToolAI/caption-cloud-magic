import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    console.log('TikTok sync started for user:', user.id);

    // 2. Get TikTok connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'tiktok')
      .maybeSingle();

    if (connError || !connection) {
      throw new Error('TikTok account not connected');
    }

    // 3. Decode access token
    let accessToken = atob(connection.access_token_hash);

    // 4. Check token expiry
    const expiresAt = new Date(connection.token_expires_at);
    if (expiresAt < new Date()) {
      console.log('Token expired, refreshing...');
      // Token expired - refresh needed
      const refreshToken = atob(connection.refresh_token_hash);
      const newTokens = await refreshTikTokToken(refreshToken);
      
      // Update tokens in DB
      await supabase
        .from('social_connections')
        .update({
          access_token_hash: btoa(newTokens.access_token),
          refresh_token_hash: btoa(newTokens.refresh_token),
          token_expires_at: newTokens.expires_at
        })
        .eq('id', connection.id);

      accessToken = newTokens.access_token;
      console.log('Token refreshed successfully');
    }

    // 5. Fetch TikTok User Info
    const userInfo = await fetchTikTokUserInfo(accessToken);
    console.log('Fetched TikTok user info:', userInfo.display_name);

    // 6. (Optional) Fetch Video List if Business API approved
    let videosSynced = 0;
    try {
      const videos = await fetchTikTokVideos(accessToken);
      videosSynced = videos.length;
      console.log(`Fetched ${videosSynced} TikTok videos`);
      // Store videos in database (future enhancement)
    } catch (videoError: any) {
      console.log('Video fetch not available (Business API not approved):', videoError.message);
    }

    // 7. Update connection metadata
    await supabase
      .from('social_connections')
      .update({
        account_name: userInfo.display_name,
        account_metadata: {
          avatar_url: userInfo.avatar_url,
          follower_count: userInfo.follower_count,
          following_count: userInfo.following_count,
          video_count: userInfo.video_count
        },
        last_sync_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    // 8. Log sync
    await supabase
      .from('tiktok_sync_logs')
      .insert({
        user_id: user.id,
        status: 'success',
        message: `Synced TikTok profile: ${userInfo.display_name}`,
        videos_synced: videosSynced
      });

    return new Response(
      JSON.stringify({
        success: true,
        profile: userInfo,
        videosSynced,
        lastSyncAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('TikTok sync error:', error);
    
    // Log error
    try {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          await supabase
            .from('tiktok_sync_logs')
            .insert({
              user_id: user.id,
              status: 'error',
              message: error.message,
              error_details: { error: error.message, stack: error.stack }
            });
        }
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function fetchTikTokUserInfo(accessToken: string) {
  const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,video_count', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TikTok User Info API failed: ${errorText}`);
  }

  const data = await response.json();
  return data.data.user;
}

async function fetchTikTokVideos(accessToken: string) {
  const response = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,video_description,duration,height,width,like_count,comment_count,share_count,view_count', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ max_count: 20 })
  });

  if (!response.ok) {
    throw new Error('Video list not accessible (requires Business API approval)');
  }

  const data = await response.json();
  return data.data.videos || [];
}

async function refreshTikTokToken(refreshToken: string) {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh TikTok token');
  }

  const data = await response.json();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: new Date(Date.now() + data.data.expires_in * 1000).toISOString()
  };
}

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshAccessToken, getUserInfo, needsRefresh } from '../_shared/tiktok-api.ts';
import { decryptToken, encryptToken } from '../_shared/crypto.ts';
import { upsertProfile } from '../_shared/db-repo.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    console.log('TikTok sync started for user:', user.id);

    // Get connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'tiktok')
      .maybeSingle();

    if (connError || !connection) {
      throw new Error('TikTok account not connected');
    }

    // Decrypt tokens
    let accessToken = await decryptToken(connection.access_token_hash);
    let refreshToken = await decryptToken(connection.refresh_token_hash);

    // Check if token needs refresh
    if (needsRefresh(connection.token_expires_at)) {
      console.log('Token expired or expiring soon, refreshing...');
      const newTokens = await refreshAccessToken(refreshToken);
      
      const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
      
      // Update tokens in DB
      await supabase
        .from('social_connections')
        .update({
          access_token_hash: await encryptToken(newTokens.access_token),
          refresh_token_hash: await encryptToken(newTokens.refresh_token),
          token_expires_at: expiresAt
        })
        .eq('id', connection.id);

      accessToken = newTokens.access_token;
      console.log('Token refreshed successfully');
    }

    // Fetch user info
    const userInfo = await getUserInfo(accessToken);
    console.log('Fetched TikTok user info:', userInfo.display_name);

    // Update profile
    await upsertProfile(supabase, {
      user_id: user.id,
      provider: 'tiktok',
      username: userInfo.username,
      display_name: userInfo.display_name,
      avatar_url: userInfo.avatar_url,
      follower_count: userInfo.follower_count || 0,
      following_count: userInfo.following_count || 0,
      video_count: userInfo.video_count || 0
    });

    // Update connection metadata
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

    return new Response(
      JSON.stringify({
        success: true,
        profile: userInfo,
        synced_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('TikTok sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

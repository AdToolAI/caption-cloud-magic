import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshAccessToken, getUserInfo, needsRefresh } from '../_shared/tiktok-api.ts';
import { decryptToken, encryptToken } from '../_shared/crypto.ts';
import { upsertProfile } from '../_shared/db-repo.ts';

serve(async (req) => {
  try {
    console.log('Starting TikTok scheduled sync...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all TikTok connections
    const { data: connections, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('provider', 'tiktok');

    if (connError) throw connError;

    console.log(`Found ${connections?.length || 0} TikTok connections to sync`);

    let successCount = 0;
    let errorCount = 0;

    for (const connection of connections || []) {
      try {
        console.log(`Syncing user: ${connection.user_id}`);

        // Decrypt tokens
        let accessToken = await decryptToken(connection.access_token_hash);
        let refreshToken = await decryptToken(connection.refresh_token_hash);

        // Refresh if needed
        if (needsRefresh(connection.token_expires_at)) {
          console.log(`Refreshing token for user: ${connection.user_id}`);
          const newTokens = await refreshAccessToken(refreshToken);
          
          const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
          
          await supabase
            .from('social_connections')
            .update({
              access_token_hash: await encryptToken(newTokens.access_token),
              refresh_token_hash: await encryptToken(newTokens.refresh_token),
              token_expires_at: expiresAt
            })
            .eq('id', connection.id);

          accessToken = newTokens.access_token;
        }

        // Fetch user info
        const userInfo = await getUserInfo(accessToken);

        // Update profile
        await upsertProfile(supabase, {
          user_id: connection.user_id,
          provider: 'tiktok',
          username: userInfo.username,
          display_name: userInfo.display_name,
          avatar_url: userInfo.avatar_url,
          follower_count: userInfo.follower_count || 0,
          following_count: userInfo.following_count || 0,
          video_count: userInfo.video_count || 0
        });

        // Update connection
        await supabase
          .from('social_connections')
          .update({
            account_name: userInfo.display_name,
            last_sync_at: new Date().toISOString()
          })
          .eq('id', connection.id);

        successCount++;
        console.log(`Sync successful for user: ${connection.user_id}`);

      } catch (error: any) {
        errorCount++;
        console.error(`Sync failed for user ${connection.user_id}:`, error.message);
        
        // Bei 429 (Rate Limit) -> Pause
        if (error.message.includes('429')) {
          console.log('Rate limit hit, pausing for 60s...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }

    console.log(`Scheduled sync completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: successCount,
        errors: errorCount
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Scheduled sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

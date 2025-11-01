import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function calculateEngagementScore(post: any, platform: string): number {
  const likes = post.likes || post.like_count || 0;
  const comments = post.comments || post.comments_count || 0;
  const shares = post.shares || post.share_count || 0;
  const saves = post.saves || post.saved || 0;
  const clicks = post.clicks || 0;
  const reach = post.reach || post.impressions || 1;

  // Weighted engagement formula
  const totalEngagement = likes + (comments * 2) + (shares * 3) + (saves * 2) + (clicks * 1.5);
  return (totalEngagement / reach) * 100;
}

async function syncInstagram(supabase: any, userId: string, connection: any) {
  console.log('[Sync Instagram] Starting sync for user:', userId);

  // This is a placeholder - actual implementation would use Instagram Graph API
  // For now, we'll return 0 to indicate no posts synced
  console.log('[Sync Instagram] Instagram sync not yet implemented');
  return 0;
}

async function syncTikTok(supabase: any, userId: string, connection: any) {
  console.log('[Sync TikTok] Starting sync for user:', userId);
  
  // Placeholder for TikTok API integration
  console.log('[Sync TikTok] TikTok sync not yet implemented');
  return 0;
}

async function syncLinkedIn(supabase: any, userId: string, connection: any) {
  console.log('[Sync LinkedIn] Starting sync for user:', userId);
  
  // Placeholder for LinkedIn API integration
  console.log('[Sync LinkedIn] LinkedIn sync not yet implemented');
  return 0;
}

async function syncX(supabase: any, userId: string, connection: any) {
  console.log('[Sync X] Starting sync for user:', userId);
  
  // Placeholder for X (Twitter) API integration
  console.log('[Sync X] X sync not yet implemented');
  return 0;
}

async function syncFacebook(supabase: any, userId: string, connection: any) {
  console.log('[Sync Facebook] Starting sync for user:', userId);
  
  // Placeholder for Facebook API integration
  console.log('[Sync Facebook] Facebook sync not yet implemented');
  return 0;
}

async function syncYouTube(supabase: any, userId: string, connection: any) {
  console.log('[Sync YouTube] Starting sync for user:', userId);
  
  // Placeholder for YouTube API integration
  console.log('[Sync YouTube] YouTube sync not yet implemented');
  return 0;
}

async function syncUserHistory(supabase: any, userId: string) {
  console.log('[Sync History] Processing user:', userId);

  // Get all active connections for this user
  const { data: connections, error: connectionsError } = await supabase
    .from('social_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (connectionsError) {
    console.error('[Sync History] Error fetching connections:', connectionsError);
    throw connectionsError;
  }

  if (!connections || connections.length === 0) {
    console.log('[Sync History] No active connections found');
    return { synced: 0, platforms: [] };
  }

  let totalSynced = 0;
  const platformsSynced: string[] = [];

  for (const conn of connections) {
    let synced = 0;

    try {
      switch (conn.provider) {
        case 'instagram':
          synced = await syncInstagram(supabase, userId, conn);
          break;
        case 'tiktok':
          synced = await syncTikTok(supabase, userId, conn);
          break;
        case 'linkedin':
          synced = await syncLinkedIn(supabase, userId, conn);
          break;
        case 'x':
          synced = await syncX(supabase, userId, conn);
          break;
        case 'facebook':
          synced = await syncFacebook(supabase, userId, conn);
          break;
        case 'youtube':
          synced = await syncYouTube(supabase, userId, conn);
          break;
        default:
          console.log(`[Sync History] Unknown provider: ${conn.provider}`);
      }

      if (synced > 0) {
        totalSynced += synced;
        platformsSynced.push(conn.provider);
      }
    } catch (error) {
      console.error(`[Sync History] Error syncing ${conn.provider}:`, error);
      // Continue with other platforms
    }
  }

  return { synced: totalSynced, platforms: platformsSynced };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a user-triggered sync or a cron job
    const authHeader = req.headers.get('authorization');
    let userId: string | null = null;

    if (authHeader) {
      // User-triggered sync
      const userToken = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
      
      if (authError || !user) {
        throw new Error('Unauthorized');
      }

      userId = user.id;
      console.log('[Sync History] User-triggered sync for:', userId);

      const result = await syncUserHistory(supabase, userId);

      return new Response(
        JSON.stringify({
          success: true,
          userId,
          postsSynced: result.synced,
          platforms: result.platforms,
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      // Cron job - sync all users
      console.log('[Sync History] Cron job - syncing all users');

      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id')
        .limit(100); // Process in batches

      if (usersError) {
        throw usersError;
      }

      let totalSynced = 0;
      const results: any[] = [];

      for (const user of (users || [])) {
        try {
          const result = await syncUserHistory(supabase, user.id);
          totalSynced += result.synced;
          results.push({
            userId: user.id,
            synced: result.synced,
            platforms: result.platforms
          });
        } catch (error) {
          console.error(`[Sync History] Error for user ${user.id}:`, error);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          usersProcessed: results.length,
          totalPostsSynced: totalSynced,
          results,
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error: any) {
    console.error('[Sync History] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: error.message === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

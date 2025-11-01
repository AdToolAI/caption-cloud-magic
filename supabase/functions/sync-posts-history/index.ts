import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SocialConnection {
  user_id: string;
  provider: string;
  account_id: string;
  access_token_hash: string;
  status: string;
}

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

async function syncInstagram(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync Instagram] Starting sync for user:', userId);

  try {
    const accessToken = await decryptToken(connection.access_token_hash);
    const accountId = connection.account_id;

    // Get media posts from last 90 days
    const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const mediaUrl = `https://graph.instagram.com/${accountId}/media?fields=id,caption,timestamp,like_count,comments_count,media_type,media_url,permalink&since=${since}&access_token=${accessToken}`;
    
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error('[Sync Instagram] Media fetch failed:', await mediaResponse.text());
      return 0;
    }

    const mediaData = await mediaResponse.json();
    const posts = mediaData.data || [];

    let syncedCount = 0;

    for (const post of posts) {
      // Get insights for each post
      const insightsUrl = `https://graph.instagram.com/${post.id}/insights?metric=reach,impressions,saved&access_token=${accessToken}`;
      const insightsResponse = await fetch(insightsUrl);
      
      let reach = 1;
      let impressions = 0;
      let saves = 0;

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        const insights = insightsData.data || [];
        
        reach = insights.find((m: any) => m.name === 'reach')?.values?.[0]?.value || 1;
        impressions = insights.find((m: any) => m.name === 'impressions')?.values?.[0]?.value || 0;
        saves = insights.find((m: any) => m.name === 'saved')?.values?.[0]?.value || 0;
      }

      const likes = post.like_count || 0;
      const comments = post.comments_count || 0;
      const engagementScore = calculateEngagementScore({
        likes,
        comments,
        shares: 0,
        saves,
        reach
      }, 'instagram');

      // Insert into posts_history
      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'instagram',
          external_id: post.id,
          published_at: post.timestamp,
          caption: post.caption || '',
          media_url: post.media_url,
          permalink: post.permalink,
          likes,
          comments,
          shares: 0,
          saves,
          reach,
          impressions,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync Instagram] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync Instagram] Error:', error);
    return 0;
  }
}

async function syncTikTok(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync TikTok] Starting sync for user:', userId);
  
  try {
    const accessToken = await decryptToken(connection.access_token_hash);

    // Get user videos
    const videosUrl = 'https://open.tiktokapis.com/v2/video/list/';
    const videosResponse = await fetch(videosUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_count: 100
      })
    });

    if (!videosResponse.ok) {
      console.error('[Sync TikTok] Videos fetch failed:', await videosResponse.text());
      return 0;
    }

    const videosData = await videosResponse.json();
    const videos = videosData.data?.videos || [];

    let syncedCount = 0;

    for (const video of videos) {
      const publishedDate = new Date(video.create_time * 1000);
      const daysSince = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSince > 90) continue; // Skip videos older than 90 days

      const likes = video.like_count || 0;
      const comments = video.comment_count || 0;
      const shares = video.share_count || 0;
      const views = video.view_count || 1;

      const engagementScore = calculateEngagementScore({
        likes,
        comments,
        shares,
        reach: views
      }, 'tiktok');

      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'tiktok',
          external_id: video.id,
          published_at: publishedDate.toISOString(),
          caption: video.title || '',
          media_url: video.cover_image_url,
          permalink: video.share_url,
          likes,
          comments,
          shares,
          reach: views,
          impressions: views,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync TikTok] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync TikTok] Error:', error);
    return 0;
  }
}

async function syncLinkedIn(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync LinkedIn] Starting sync for user:', userId);
  
  try {
    const accessToken = await decryptToken(connection.access_token_hash);
    const accountId = connection.account_id;

    // Get posts (UGC posts)
    const postsUrl = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${accountId})&count=100`;
    const postsResponse = await fetch(postsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!postsResponse.ok) {
      console.error('[Sync LinkedIn] Posts fetch failed:', await postsResponse.text());
      return 0;
    }

    const postsData = await postsResponse.json();
    const posts = postsData.elements || [];

    let syncedCount = 0;

    for (const post of posts) {
      const publishedDate = new Date(post.created.time);
      const daysSince = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSince > 90) continue;

      const postId = post.id;

      // Get post statistics
      const statsUrl = `https://api.linkedin.com/v2/socialActions/${postId}`;
      const statsResponse = await fetch(statsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      let likes = 0;
      let comments = 0;
      let shares = 0;

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        likes = statsData.likesSummary?.totalLikes || 0;
        comments = statsData.commentsSummary?.totalComments || 0;
        shares = statsData.sharesSummary?.totalShares || 0;
      }

      const engagementScore = calculateEngagementScore({
        likes,
        comments,
        shares,
        reach: likes + comments + shares || 1
      }, 'linkedin');

      const caption = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '';

      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'linkedin',
          external_id: postId,
          published_at: publishedDate.toISOString(),
          caption,
          likes,
          comments,
          shares,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync LinkedIn] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync LinkedIn] Error:', error);
    return 0;
  }
}

async function syncX(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync X] Starting sync for user:', userId);
  
  try {
    const accessToken = await decryptToken(connection.access_token_hash);
    const accountId = connection.account_id;

    // Get user tweets from last 90 days
    const startTime = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const tweetsUrl = `https://api.twitter.com/2/users/${accountId}/tweets?tweet.fields=created_at,public_metrics,text&max_results=100&start_time=${startTime}`;
    
    const tweetsResponse = await fetch(tweetsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!tweetsResponse.ok) {
      console.error('[Sync X] Tweets fetch failed:', await tweetsResponse.text());
      return 0;
    }

    const tweetsData = await tweetsResponse.json();
    const tweets = tweetsData.data || [];

    let syncedCount = 0;

    for (const tweet of tweets) {
      const metrics = tweet.public_metrics || {};
      const likes = metrics.like_count || 0;
      const retweets = metrics.retweet_count || 0;
      const replies = metrics.reply_count || 0;
      const impressions = metrics.impression_count || 1;

      const engagementScore = calculateEngagementScore({
        likes,
        comments: replies,
        shares: retweets,
        reach: impressions
      }, 'x');

      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'x',
          external_id: tweet.id,
          published_at: tweet.created_at,
          caption: tweet.text || '',
          permalink: `https://twitter.com/i/web/status/${tweet.id}`,
          likes,
          comments: replies,
          shares: retweets,
          reach: impressions,
          impressions,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync X] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync X] Error:', error);
    return 0;
  }
}

async function syncFacebook(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync Facebook] Starting sync for user:', userId);
  
  try {
    const accessToken = await decryptToken(connection.access_token_hash);
    const pageId = connection.account_id;

    // Get posts from page
    const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,created_time,permalink_url,likes.summary(true),comments.summary(true),shares&since=${since}&access_token=${accessToken}`;
    
    const postsResponse = await fetch(postsUrl);

    if (!postsResponse.ok) {
      console.error('[Sync Facebook] Posts fetch failed:', await postsResponse.text());
      return 0;
    }

    const postsData = await postsResponse.json();
    const posts = postsData.data || [];

    let syncedCount = 0;

    for (const post of posts) {
      // Get insights for reach
      const insightsUrl = `https://graph.facebook.com/v18.0/${post.id}/insights?metric=post_impressions,post_impressions_unique&access_token=${accessToken}`;
      const insightsResponse = await fetch(insightsUrl);
      
      let reach = 1;
      let impressions = 0;

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        const insights = insightsData.data || [];
        
        reach = insights.find((m: any) => m.name === 'post_impressions_unique')?.values?.[0]?.value || 1;
        impressions = insights.find((m: any) => m.name === 'post_impressions')?.values?.[0]?.value || 0;
      }

      const likes = post.likes?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;

      const engagementScore = calculateEngagementScore({
        likes,
        comments,
        shares,
        reach
      }, 'facebook');

      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'facebook',
          external_id: post.id,
          published_at: post.created_time,
          caption: post.message || '',
          permalink: post.permalink_url,
          likes,
          comments,
          shares,
          reach,
          impressions,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync Facebook] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync Facebook] Error:', error);
    return 0;
  }
}

async function syncYouTube(supabase: any, userId: string, connection: SocialConnection): Promise<number> {
  console.log('[Sync YouTube] Starting sync for user:', userId);
  
  try {
    const accessToken = await decryptToken(connection.access_token_hash);

    // Get channel videos
    const publishedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&publishedAfter=${publishedAfter}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      console.error('[Sync YouTube] Search failed:', await searchResponse.text());
      return 0;
    }

    const searchData = await searchResponse.json();
    const videos = searchData.items || [];

    let syncedCount = 0;

    for (const video of videos) {
      const videoId = video.id.videoId;

      // Get video statistics
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`;
      const statsResponse = await fetch(statsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!statsResponse.ok) continue;

      const statsData = await statsResponse.json();
      const videoData = statsData.items?.[0];
      
      if (!videoData) continue;

      const stats = videoData.statistics || {};
      const views = parseInt(stats.viewCount || '1', 10);
      const likes = parseInt(stats.likeCount || '0', 10);
      const comments = parseInt(stats.commentCount || '0', 10);

      const engagementScore = calculateEngagementScore({
        likes,
        comments,
        reach: views
      }, 'youtube');

      const { error } = await supabase
        .from('posts_history')
        .upsert({
          user_id: userId,
          platform: 'youtube',
          external_id: videoId,
          published_at: video.snippet.publishedAt,
          caption: video.snippet.title || '',
          media_url: video.snippet.thumbnails?.high?.url,
          permalink: `https://www.youtube.com/watch?v=${videoId}`,
          likes,
          comments,
          reach: views,
          impressions: views,
          engagement_score: engagementScore
        }, { onConflict: 'user_id,platform,external_id' });

      if (!error) syncedCount++;
    }

    console.log(`[Sync YouTube] Synced ${syncedCount} posts`);
    return syncedCount;

  } catch (error) {
    console.error('[Sync YouTube] Error:', error);
    return 0;
  }
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

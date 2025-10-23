import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEPLOYMENT_VERSION = '2.0';

// Provider-specific token decoding
async function decodeProviderToken(provider: string, tokenHash: string): Promise<string> {
  console.log(`🔓 Decoding token for provider: ${provider}`);
  
  // Instagram, Facebook, YouTube use simple Base64 encoding
  if (['instagram', 'facebook', 'youtube'].includes(provider)) {
    try {
      const decoded = atob(tokenHash);
      console.log(`✅ Base64 decoded for ${provider}`);
      return decoded;
    } catch (error) {
      console.error(`❌ Base64 decode failed for ${provider}:`, error);
      throw new Error(`Failed to decode ${provider} token`);
    }
  }
  
  // X, TikTok, and LinkedIn use AES-GCM encryption
  if (['x', 'tiktok', 'linkedin'].includes(provider)) {
    try {
      const decrypted = await decryptToken(tokenHash);
      console.log(`✅ AES-GCM decrypted for ${provider}`);
      return decrypted;
    } catch (error) {
      console.error(`❌ AES-GCM decrypt failed for ${provider}:`, error);
      throw new Error(`Failed to decrypt ${provider} token`);
    }
  }
  
  throw new Error(`Unsupported provider: ${provider}`);
}

serve(async (req) => {
  console.log(`🚀 sync-social-posts-v2 v${DEPLOYMENT_VERSION} starting`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    console.log(`✅ User authenticated: ${user.id}`);

    const { provider, connectionId } = await req.json();
    if (!provider || !connectionId) {
      throw new Error('Missing provider or connectionId');
    }

    console.log(`📋 Syncing ${provider} posts for connection ${connectionId}`);

    // Fetch social connection
    const { data: connection, error: connError } = await serviceClient
      .from('social_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      throw new Error('Connection not found');
    }

    // Verify ownership
    if (connection.user_id !== user.id) {
      throw new Error('Unauthorized: Connection does not belong to user');
    }
    console.log(`✅ Connection ownership verified for user ${user.id}`);

    // Decode access token using provider-specific method
    const accessToken = await decodeProviderToken(provider, connection.access_token_hash);

    let posts: any[] = [];
    
    // Fetch posts based on provider
    if (provider === 'instagram') {
      posts = await fetchInstagramPosts(accessToken, connection.account_id, connection.account_type);
    } else if (provider === 'facebook') {
      posts = await fetchFacebookPosts(accessToken, connection.account_id);
    } else if (provider === 'tiktok') {
      posts = await fetchTikTokPosts(accessToken);
    } else if (provider === 'linkedin') {
      posts = await fetchLinkedInPosts(accessToken, connection.account_id);
    } else if (provider === 'youtube') {
      posts = await fetchYouTubePosts(accessToken);
    } else if (provider === 'x') {
      posts = await fetchXPosts(accessToken, connection.account_id);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(`📊 Fetched ${posts.length} posts from ${provider}`);

    // Upsert posts into post_metrics table
    if (posts.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('post_metrics')
        .upsert(posts, { onConflict: 'platform_post_id' });

      if (upsertError) {
        console.error('Error upserting posts:', upsertError);
        throw upsertError;
      }
    }

    // Update last_sync_at
    await serviceClient
      .from('social_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId);

    console.log(`✅ Successfully synced ${posts.length} posts from ${provider}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: posts.length,
        provider,
        version: DEPLOYMENT_VERSION
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Instagram Posts Fetcher
async function fetchInstagramPosts(accessToken: string, accountId: string, accountType: string): Promise<any[]> {
  try {
    const endpoint = accountType === 'creator'
      ? `https://graph.instagram.com/v21.0/${accountId}/media`
      : `https://graph.facebook.com/v21.0/${accountId}/media`;

    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,insights.metric(impressions,reach,saved,engagement)';
    
    const response = await fetch(
      `${endpoint}?fields=${fields}&access_token=${accessToken}&limit=25`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Instagram API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    return (data.data || []).map((post: any) => ({
      user_id: null,
      platform: 'instagram',
      platform_post_id: post.id,
      caption: post.caption || null,
      media_url: post.media_url || post.thumbnail_url || null,
      permalink: post.permalink || null,
      posted_at: post.timestamp || new Date().toISOString(),
      likes: post.like_count || 0,
      comments: post.comments_count || 0,
      shares: 0,
      saves: post.insights?.data?.find((i: any) => i.name === 'saved')?.values?.[0]?.value || 0,
      impressions: post.insights?.data?.find((i: any) => i.name === 'impressions')?.values?.[0]?.value || 0,
      reach: post.insights?.data?.find((i: any) => i.name === 'reach')?.values?.[0]?.value || 0,
    }));
  } catch (error) {
    console.error('Error fetching Instagram posts:', error);
    throw error;
  }
}

// Facebook Posts Fetcher
async function fetchFacebookPosts(accessToken: string, pageId: string): Promise<any[]> {
  try {
    const fields = 'id,message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares';
    
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/posts?fields=${fields}&access_token=${accessToken}&limit=25`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Facebook API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    return (data.data || []).map((post: any) => ({
      user_id: null,
      platform: 'facebook',
      platform_post_id: post.id,
      caption: post.message || null,
      media_url: post.full_picture || null,
      permalink: post.permalink_url || null,
      posted_at: post.created_time || new Date().toISOString(),
      likes: post.likes?.summary?.total_count || 0,
      comments: post.comments?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
      saves: 0,
      impressions: 0,
      reach: 0,
    }));
  } catch (error) {
    console.error('Error fetching Facebook posts:', error);
    throw error;
  }
}

// TikTok Posts Fetcher
async function fetchTikTokPosts(accessToken: string): Promise<any[]> {
  try {
    const fields = 'id,title,video_description,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count';
    
    const response = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${fields}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 20 })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`TikTok API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    return (data.data?.videos || []).map((video: any) => ({
      user_id: null,
      platform: 'tiktok',
      platform_post_id: video.id,
      caption: video.video_description || video.title || null,
      media_url: video.cover_image_url || null,
      permalink: video.share_url || null,
      posted_at: new Date(video.create_time * 1000).toISOString(),
      likes: video.like_count || 0,
      comments: video.comment_count || 0,
      shares: video.share_count || 0,
      saves: 0,
      impressions: video.view_count || 0,
      reach: 0,
    }));
  } catch (error) {
    console.error('Error fetching TikTok posts:', error);
    throw error;
  }
}

// LinkedIn Posts Fetcher with Analytics
async function fetchLinkedInPosts(accessToken: string, memberId: string): Promise<any[]> {
  console.log(`📘 Fetching LinkedIn posts for member: ${memberId}`);
  
  try {
    // Fetch user's shares using v2 API
    const response = await fetch(
      `https://api.linkedin.com/v2/shares?q=owners&owners=urn:li:person:${memberId}&count=25`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ LinkedIn API error (${response.status}):`, errorData);
      throw new Error(`LinkedIn API error: ${errorData}`);
    }

    const data = await response.json();
    console.log(`✅ Found ${data.elements?.length || 0} LinkedIn shares`);
    
    // Map LinkedIn v2 shares API response to our format
    return (data.elements || []).map((share: any) => ({
      user_id: null,
      platform: 'linkedin',
      platform_post_id: share.id,
      caption: share.text?.text || '',
      media_url: share.content?.contentEntities?.[0]?.thumbnails?.[0]?.resolvedUrl || null,
      permalink: `https://www.linkedin.com/feed/update/${share.id}`,
      posted_at: new Date(share.created?.time || Date.now()).toISOString(),
      likes: share.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
      comments: share.socialDetail?.totalSocialActivityCounts?.numComments || 0,
      shares: share.socialDetail?.totalSocialActivityCounts?.numShares || 0,
      saves: 0,
      impressions: 0,
      reach: 0,
    }));
  } catch (error) {
    console.error('Error fetching LinkedIn posts:', error);
    throw error;
  }
}

// YouTube Posts Fetcher
async function fetchYouTubePosts(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=25`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`YouTube API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    const videoIds = data.items?.map((item: any) => item.id.videoId).join(',') || '';
    
    if (!videoIds) return [];

    const statsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      }
    );

    const statsData = await statsResponse.json();
    
    return (data.items || []).map((item: any, index: number) => {
      const stats = statsData.items?.[index]?.statistics || {};
      
      return {
        user_id: null,
        platform: 'youtube',
        platform_post_id: item.id.videoId,
        caption: item.snippet?.title || null,
        media_url: item.snippet?.thumbnails?.high?.url || null,
        permalink: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        posted_at: item.snippet?.publishedAt || new Date().toISOString(),
        likes: parseInt(stats.likeCount || '0'),
        comments: parseInt(stats.commentCount || '0'),
        shares: 0,
        saves: 0,
        impressions: parseInt(stats.viewCount || '0'),
        reach: 0,
      };
    });
  } catch (error) {
    console.error('Error fetching YouTube posts:', error);
    throw error;
  }
}

// X (Twitter) Posts Fetcher
async function fetchXPosts(accessToken: string, userId: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?tweet.fields=created_at,public_metrics,entities&max_results=25`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    return (data.data || []).map((tweet: any) => ({
      user_id: null,
      platform: 'x',
      platform_post_id: tweet.id,
      caption: tweet.text || null,
      media_url: null,
      permalink: `https://twitter.com/i/web/status/${tweet.id}`,
      posted_at: tweet.created_at || new Date().toISOString(),
      likes: tweet.public_metrics?.like_count || 0,
      comments: tweet.public_metrics?.reply_count || 0,
      shares: tweet.public_metrics?.retweet_count || 0,
      saves: 0,
      impressions: tweet.public_metrics?.impression_count || 0,
      reach: 0,
    }));
  } catch (error) {
    console.error('Error fetching X posts:', error);
    throw error;
  }
}

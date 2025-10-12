import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Input validation
    const requestSchema = z.object({
      provider: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube']),
      connectionId: z.string().uuid(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { provider, connectionId } = validation.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get connection details
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      throw new Error('Connection not found');
    }

    // Decode access token
    const accessToken = atob(connection.access_token_hash);

    // Fetch posts based on provider
    let posts;
    switch (provider) {
      case 'instagram':
        posts = await fetchInstagramPosts(accessToken, connection.account_id);
        break;
      case 'facebook':
        posts = await fetchFacebookPosts(accessToken, connection.account_id);
        break;
      case 'tiktok':
        posts = await fetchTikTokPosts(accessToken);
        break;
      case 'linkedin':
        posts = await fetchLinkedInPosts(accessToken);
        break;
      case 'x':
        posts = await fetchXPosts(accessToken);
        break;
      case 'youtube':
        posts = await fetchYouTubePosts(accessToken);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Transform and insert posts
    const metricsToInsert = posts.map((post: any) => ({
      user_id: connection.user_id,
      provider: connection.provider,
      account_id: connection.account_id,
      post_id: post.id,
      post_url: post.url,
      media_type: post.mediaType,
      caption_text: post.caption,
      posted_at: post.postedAt,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      reach: post.reach,
      impressions: post.impressions,
      video_views: post.videoViews
    }));

    const { error: insertError } = await supabase
      .from('post_metrics')
      .upsert(metricsToInsert, {
        onConflict: 'user_id,provider,post_id',
        ignoreDuplicates: false
      });

    if (insertError) throw insertError;

    // Update last sync time
    await supabase
      .from('social_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId);

    return new Response(
      JSON.stringify({ success: true, postsImported: posts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to sync social posts' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function fetchInstagramPosts(accessToken: string, accountId: string) {
  const response = await fetch(
    `https://graph.instagram.com/${accountId}/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,insights.metric(impressions,reach,saved)&limit=100`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error('Failed to fetch Instagram posts');

  const data = await response.json();
  
  return data.data.map((post: any) => ({
    id: post.id,
    caption: post.caption || '',
    mediaType: post.media_type.toLowerCase(),
    url: post.permalink,
    postedAt: post.timestamp,
    likes: post.like_count || 0,
    comments: post.comments_count || 0,
    shares: 0,
    saves: post.insights?.data?.find((i: any) => i.name === 'saved')?.values[0]?.value || 0,
    reach: post.insights?.data?.find((i: any) => i.name === 'reach')?.values[0]?.value || 0,
    impressions: post.insights?.data?.find((i: any) => i.name === 'impressions')?.values[0]?.value || 0,
    videoViews: post.media_type === 'VIDEO' ? post.insights?.data?.find((i: any) => i.name === 'video_views')?.values[0]?.value || 0 : 0
  }));
}

async function fetchFacebookPosts(accessToken: string, pageId: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,created_time,permalink_url,shares,reactions.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique)&limit=100`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error('Failed to fetch Facebook posts');

  const data = await response.json();
  
  return data.data.map((post: any) => ({
    id: post.id,
    caption: post.message || '',
    mediaType: 'photo',
    url: post.permalink_url,
    postedAt: post.created_time,
    likes: post.reactions?.summary?.total_count || 0,
    comments: post.comments?.summary?.total_count || 0,
    shares: post.shares?.count || 0,
    saves: 0,
    reach: post.insights?.data?.find((i: any) => i.name === 'post_impressions_unique')?.values[0]?.value || 0,
    impressions: post.insights?.data?.find((i: any) => i.name === 'post_impressions')?.values[0]?.value || 0,
    videoViews: 0
  }));
}

async function fetchTikTokPosts(accessToken: string) {
  const response = await fetch(
    'https://open-api.tiktok.com/video/list/?fields=id,title,create_time,share_url,like_count,comment_count,share_count,view_count',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  
  return data.data.videos.map((post: any) => ({
    id: post.id,
    caption: post.title || '',
    mediaType: 'video',
    url: post.share_url,
    postedAt: new Date(post.create_time * 1000).toISOString(),
    likes: post.like_count || 0,
    comments: post.comment_count || 0,
    shares: post.share_count || 0,
    saves: 0,
    reach: 0,
    impressions: post.view_count || 0,
    videoViews: post.view_count || 0
  }));
}

async function fetchLinkedInPosts(accessToken: string) {
  const response = await fetch(
    'https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:{id})&count=100',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  
  return data.elements.map((post: any) => ({
    id: post.id,
    caption: post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '',
    mediaType: 'article',
    url: `https://www.linkedin.com/feed/update/${post.id}`,
    postedAt: new Date(post.created.time).toISOString(),
    likes: post.numLikes || 0,
    comments: post.numComments || 0,
    shares: post.numShares || 0,
    saves: 0,
    reach: 0,
    impressions: post.numViews || 0,
    videoViews: 0
  }));
}

async function fetchXPosts(accessToken: string) {
  const response = await fetch(
    'https://api.twitter.com/2/users/me/tweets?max_results=100&tweet.fields=created_at,public_metrics,entities',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  
  return data.data.map((post: any) => ({
    id: post.id,
    caption: post.text,
    mediaType: 'text',
    url: `https://twitter.com/i/status/${post.id}`,
    postedAt: post.created_at,
    likes: post.public_metrics.like_count || 0,
    comments: post.public_metrics.reply_count || 0,
    shares: post.public_metrics.retweet_count || 0,
    saves: post.public_metrics.bookmark_count || 0,
    reach: 0,
    impressions: post.public_metrics.impression_count || 0,
    videoViews: 0
  }));
}

async function fetchYouTubePosts(accessToken: string) {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  
  const videosWithStats = await Promise.all(
    data.items.map(async (video: any) => {
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${video.id.videoId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const statsData = await statsResponse.json();
      return { ...video, stats: statsData.items[0].statistics };
    })
  );

  return videosWithStats.map((video: any) => ({
    id: video.id.videoId,
    caption: video.snippet.title,
    mediaType: 'video',
    url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
    postedAt: video.snippet.publishedAt,
    likes: parseInt(video.stats.likeCount || 0),
    comments: parseInt(video.stats.commentCount || 0),
    shares: 0,
    saves: 0,
    reach: 0,
    impressions: parseInt(video.stats.viewCount || 0),
    videoViews: parseInt(video.stats.viewCount || 0)
  }));
}
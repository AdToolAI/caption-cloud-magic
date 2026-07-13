import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withTelemetry } from '../_shared/telemetry.ts';
import { getRedisCache } from "../_shared/redis-cache.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import {
  getMetaConnection,
  ensureFreshToken,
  publishInstagram,
  publishFacebook,
  buildCaption,
  MetaPublishError,
} from '../_shared/meta-publish.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

// Platform character limits
const PLATFORM_LIMITS = {
  Instagram: 2200,
  Facebook: 63206,
  TikTok: 2200,
  LinkedIn: 3000,
  X: 280,
  YouTube: 5000,
};

Deno.serve(withTelemetry('publish-post', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "publish-post" });
  }

  let capturedPostId: string | null = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {


    // Input validation
    const requestSchema = z.object({
      postId: z.string().uuid(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { postId } = validation.data;
    capturedPostId = postId;

    console.log('Publishing post:', postId);


    // Get post data
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      throw new Error('Post not found');
    }

    // Validate caption length
    const limit = PLATFORM_LIMITS[post.platform as keyof typeof PLATFORM_LIMITS];
    if (post.caption && post.caption.length > limit) {
      throw new Error(`Caption exceeds ${limit} character limit for ${post.platform}`);
    }

    let result;
    let externalPostId;

    // Publish to the appropriate platform
    switch (post.platform) {
      case 'Instagram':
        result = await publishToInstagram(post, supabase);
        externalPostId = result.id;
        break;
      
      case 'Facebook':
        result = await publishToFacebook(post, supabase);
        externalPostId = (result as any)?.id;
        break;
      
      case 'TikTok':
        result = await publishToTikTok(post, supabase);
        externalPostId = (result as any)?.share_id;
        break;
      
      case 'LinkedIn':
        result = await publishToLinkedIn(post, supabase);
        externalPostId = (result as any)?.id;
        break;
      
      case 'X':
        result = await publishToX(post, supabase);
        externalPostId = result.data?.id;
        break;
      
      case 'YouTube':
        result = await publishToYouTube(post, supabase);
        externalPostId = (result as any)?.id;
        break;
      
      default:
        throw new Error(`Unsupported platform: ${post.platform}`);
    }

    // Update post status
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        status: 'posted',
        published_at: new Date().toISOString(),
        external_post_id: externalPostId,
        error_message: null,
      })
      .eq('id', postId);

    if (updateError) {
      console.error('Error updating post:', updateError);
    }

    console.log('Post published successfully:', externalPostId);

    // Invalidate posting times cache after successful publish
    const cache = getRedisCache();
    await cache.invalidate(`posting-times:${post.user_id}:*`);
    console.log(`[publish-post] Invalidated posting-times cache for user ${post.user_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        externalPostId,
        platform: post.platform,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Publish error:', error);

    const isMeta = error instanceof MetaPublishError;
    const errorCode = isMeta ? error.code : 'PUBLISH_FAILED';
    const reconnectRequired = isMeta ? error.reconnectRequired : false;
    const userMessage = error?.message
      ? String(error.message).slice(0, 500)
      : 'Failed to publish post';

    // Persist friendly error on the post row
    if (capturedPostId) {
      try {
        await supabase
          .from('posts')
          .update({
            error_message: userMessage,
          })

          .eq('id', capturedPostId);
      } catch (e) {
        console.error('Error updating post error:', e);
      }
    }

    return new Response(
      JSON.stringify({
        error: userMessage,
        code: errorCode,
        reconnectRequired,
        ...(isMeta && error.fbCode ? { fbCode: error.fbCode, fbSubcode: error.fbSubcode, fbTraceId: error.fbTraceId } : {}),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: reconnectRequired ? 401 : 502,
      }
    );
  }
}));


// Platform-specific publishing functions

// ---- Meta helpers: extract media intent from post row ----
function extractMediaUrls(post: any): string[] {
  const arr = Array.isArray(post.media_urls) ? post.media_urls : [];
  return arr.filter((u: any) => typeof u === 'string' && u.length > 0);
}

function pickVideoUrl(post: any): string | null {
  const all = extractMediaUrls(post);
  const v = all.find((u) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u));
  if (v) return v;
  if (post.image_url && /\.(mp4|mov|m4v|webm)(\?|$)/i.test(post.image_url)) return post.image_url;
  return null;
}

function pickHashtags(post: any): string[] {
  const t = post.tags;
  if (Array.isArray(t)) return t.filter((x: any) => typeof x === 'string');
  return [];
}

async function publishToInstagram(post: any, supabase: any) {
  let conn = await getMetaConnection(supabase, post.user_id, 'instagram');
  conn = await ensureFreshToken(supabase, conn);

  const caption = buildCaption(post.caption || '', pickHashtags(post));
  const mediaUrls = extractMediaUrls(post);
  const videoUrl = pickVideoUrl(post);
  const isStory = !!(post.tags && Array.isArray(post.tags) && post.tags.includes('__story__'));

  return await publishInstagram({
    igUserId: conn.account_id,
    accessToken: conn.access_token,
    caption,
    imageUrl: post.image_url || null,
    videoUrl,
    mediaUrls: mediaUrls.length > 1 ? mediaUrls : undefined,
    isStory,
  });
}

async function publishToFacebook(post: any, supabase: any) {
  let conn = await getMetaConnection(supabase, post.user_id, 'facebook');
  conn = await ensureFreshToken(supabase, conn);

  const message = buildCaption(post.caption || '', pickHashtags(post));
  const videoUrl = pickVideoUrl(post);
  // For pure text+link posts, treat image_url as a link if it's not an image/video
  const imageUrl = post.image_url && !/\.(mp4|mov|m4v|webm)(\?|$)/i.test(post.image_url)
    ? post.image_url
    : null;

  return await publishFacebook({
    pageId: conn.account_id,
    accessToken: conn.access_token,
    message,
    imageUrl,
    videoUrl,
    linkUrl: null,
  });
}



async function publishToTikTok(post: any, supabase: any) {
  throw new Error('TikTok publishing requires video upload - not yet implemented');
}

async function publishToLinkedIn(post: any, supabase: any) {
  const { data: connection } = await supabase
    .from('social_connections')
    .select('*')
    .eq('provider', 'linkedin_oidc')
    .eq('user_id', post.user_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    throw new Error('No active LinkedIn connection found');
  }

  const accessToken = atob(connection.access_token);
  const userId = connection.account_id;

  const url = 'https://api.linkedin.com/v2/ugcPosts';
  const body = {
    author: `urn:li:person:${userId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: post.caption,
        },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${JSON.stringify(data)}`);
  }

  return data;
}

async function publishToX(post: any, supabase: any) {
  const API_KEY = Deno.env.get('TWITTER_CONSUMER_KEY')?.trim();
  const API_SECRET = Deno.env.get('TWITTER_CONSUMER_SECRET')?.trim();
  const ACCESS_TOKEN = Deno.env.get('TWITTER_ACCESS_TOKEN')?.trim();
  const ACCESS_TOKEN_SECRET = Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET')?.trim();

  if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
    throw new Error('Twitter credentials not configured');
  }

  const url = 'https://api.x.com/2/tweets';
  const method = 'POST';

  const oauthParams = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0',
  };

  const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(
    Object.entries(oauthParams)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  )}`;

  const signingKey = `${encodeURIComponent(API_SECRET)}&${encodeURIComponent(ACCESS_TOKEN_SECRET)}`;
  const hmacSha1 = createHmac('sha1', signingKey);
  const signature = hmacSha1.update(signatureBaseString).digest('base64');

  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const oauthHeader =
    'OAuth ' +
    Object.entries(signedOAuthParams)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': oauthHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: post.caption }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`X API error: ${responseText}`);
  }

  return JSON.parse(responseText);
}

async function publishToYouTube(post: any, supabase: any) {
  throw new Error('YouTube publishing requires video upload - not yet implemented');
}
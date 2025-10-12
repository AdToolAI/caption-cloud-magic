import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { postId } = await req.json();

    if (!postId) {
      throw new Error('Post ID is required');
    }

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

  } catch (error) {
    console.error('Publish error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Try to update post with error
    try {
      const { postId } = await req.json();
      if (postId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('posts')
          .update({ error_message: errorMessage })
          .eq('id', postId);
      }
    } catch (e) {
      console.error('Error updating post error:', e);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Platform-specific publishing functions

async function publishToInstagram(post: any, supabase: any) {
  // Get Instagram connection
  const { data: connection } = await supabase
    .from('social_connections')
    .select('*')
    .eq('provider', 'instagram')
    .eq('user_id', post.user_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    throw new Error('No active Instagram connection found');
  }

  const accessToken = atob(connection.access_token);
  const accountId = connection.account_id;

  // Create media container
  const containerUrl = `https://graph.facebook.com/v18.0/${accountId}/media`;
  const containerParams = new URLSearchParams({
    caption: post.caption,
    access_token: accessToken,
  });

  if (post.image_url) {
    containerParams.append('image_url', post.image_url);
  }

  const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
    method: 'POST',
  });

  const containerData = await containerResponse.json();
  if (!containerResponse.ok) {
    throw new Error(`Instagram API error: ${JSON.stringify(containerData)}`);
  }

  // Publish the container
  const publishUrl = `https://graph.facebook.com/v18.0/${accountId}/media_publish`;
  const publishParams = new URLSearchParams({
    creation_id: containerData.id,
    access_token: accessToken,
  });

  const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
    method: 'POST',
  });

  const publishData = await publishResponse.json();
  if (!publishResponse.ok) {
    throw new Error(`Instagram publish error: ${JSON.stringify(publishData)}`);
  }

  return publishData;
}

async function publishToFacebook(post: any, supabase: any) {
  const { data: connection } = await supabase
    .from('social_connections')
    .select('*')
    .eq('provider', 'facebook')
    .eq('user_id', post.user_id)
    .eq('status', 'active')
    .single();

  if (!connection) {
    throw new Error('No active Facebook connection found');
  }

  const accessToken = atob(connection.access_token);
  const pageId = connection.account_id;

  const url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
  const params = new URLSearchParams({
    message: post.caption,
    access_token: accessToken,
  });

  if (post.image_url) {
    params.append('link', post.image_url);
  }

  const response = await fetch(`${url}?${params}`, {
    method: 'POST',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Facebook API error: ${JSON.stringify(data)}`);
  }

  return data;
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
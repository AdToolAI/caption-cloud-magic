import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================

type Provider = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube' | 'linkedin';

interface MediaItem {
  type: 'image' | 'video';
  path: string;
  mime: string;
  size: number;
}

interface PublishPayload {
  text: string;
  media?: MediaItem[];
  channels: Provider[];
}

interface PublishResult {
  provider: Provider;
  ok: boolean;
  external_id?: string;
  permalink?: string;
  error_code?: string;
  error_message?: string;
}

interface CachedResponse {
  response: any;
  expiresAt: number;
}

// ============================================================================
// INSTAGRAM PROVIDER
// ============================================================================

async function graphPost(path: string, params: Record<string, string>) {
  const url = `https://graph.facebook.com/v18.0${path}`;
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || 'Graph API error');
  }
  return await res.json();
}

async function graphGet(path: string, token: string) {
  const url = `https://graph.facebook.com/v18.0${path}?access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || 'Graph API GET error');
  }
  return await res.json();
}

async function publishToInstagram(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[Instagram] Starting publish for user:', userId);

    const { data: secrets, error: secretsError } = await supabase
      .from('app_secrets')
      .select('ig_user_id, ig_page_access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (secretsError || !secrets?.ig_page_access_token || !secrets?.ig_user_id) {
      console.error('[Instagram] Missing credentials:', secretsError);
      return {
        provider: 'instagram',
        ok: false,
        error_code: 'MISSING_CREDENTIALS',
        error_message: 'Instagram not connected',
      };
    }

    if (!media || media.length === 0) {
      return {
        provider: 'instagram',
        ok: false,
        error_code: 'MEDIA_REQUIRED',
        error_message: 'Instagram requires at least one image',
      };
    }

    // Create container
    const containerId = await graphPost(`/${secrets.ig_user_id}/media`, {
      image_url: media[0].path,
      caption: text,
      access_token: secrets.ig_page_access_token,
    });

    // Wait for processing
    const start = Date.now();
    while (Date.now() - start < 120000) {
      const status = await graphGet(`/${containerId.id}?fields=status_code`, secrets.ig_page_access_token);
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR') throw new Error('Container creation failed');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Publish
    const publishResult = await graphPost(`/${secrets.ig_user_id}/media_publish`, {
      creation_id: containerId.id,
      access_token: secrets.ig_page_access_token,
    });

    const postMeta = await graphGet(`/${publishResult.id}?fields=id,permalink`, secrets.ig_page_access_token);

    console.log('[Instagram] Success:', publishResult.id);
    return {
      provider: 'instagram',
      ok: true,
      external_id: publishResult.id,
      permalink: postMeta.permalink,
    };
  } catch (error: any) {
    console.error('[Instagram] Error:', error);
    return {
      provider: 'instagram',
      ok: false,
      error_code: 'INSTAGRAM_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
}

// ============================================================================
// LINKEDIN PROVIDER
// ============================================================================

async function publishToLinkedIn(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[LinkedIn] Starting publish for user:', userId);

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .maybeSingle();

    if (connectionError || !connection) {
      return {
        provider: 'linkedin',
        ok: false,
        error_code: 'NO_CONNECTION',
        error_message: 'LinkedIn not connected',
      };
    }

    const expiresAt = new Date(connection.expires_at);
    if (expiresAt <= new Date()) {
      return {
        provider: 'linkedin',
        ok: false,
        error_code: 'TOKEN_EXPIRED',
        error_message: 'LinkedIn token expired',
      };
    }

    const accessToken = await decryptToken(connection.access_token_hash);
    const accountId = connection.account_id;

    let mediaAssets: string[] = [];

    // Handle image upload
    if (media && media.length > 0) {
      const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: accountId,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        }),
      });

      if (!registerResponse.ok) throw new Error('Failed to register asset');
      
      const registerData = await registerResponse.json();
      const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
      
      const imageResponse = await fetch(media[0].path);
      const imageBlob = await imageResponse.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: imageBlob,
      });

      if (!uploadResponse.ok) throw new Error('Failed to upload image');
      mediaAssets.push(registerData.value.asset);
    }

    // Create post
    const postPayload: any = {
      author: accountId,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: mediaAssets.length > 0 ? 'IMAGE' : 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    if (mediaAssets.length > 0) {
      postPayload.specificContent['com.linkedin.ugc.ShareContent'].media = [
        { status: 'READY', media: mediaAssets[0] },
      ];
    }

    const postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postPayload),
    });

    if (!postResponse.ok) throw new Error('Failed to create post');

    const postData = await postResponse.json();
    const postUrn = postData.id;

    console.log('[LinkedIn] Success:', postUrn);
    return {
      provider: 'linkedin',
      ok: true,
      external_id: postUrn,
      permalink: `https://www.linkedin.com/feed/update/${postUrn}`,
    };
  } catch (error: any) {
    console.error('[LinkedIn] Error:', error);
    return {
      provider: 'linkedin',
      ok: false,
      error_code: 'LINKEDIN_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
}

// ============================================================================
// X (TWITTER) PROVIDER
// ============================================================================

async function publishToX(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[X] Starting publish for user:', userId);

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .eq('is_active', true)
      .maybeSingle();

    if (connectionError || !connection) {
      return {
        provider: 'x',
        ok: false,
        error_code: 'NO_CONNECTION',
        error_message: 'X not connected',
      };
    }

    const accessToken = await decryptToken(connection.access_token_hash);

    // Upload media if present
    let mediaIds: string[] = [];
    if (media && media.length > 0) {
      for (const m of media) {
        const mediaResponse = await fetch(m.path);
        const mediaBlob = await mediaResponse.blob();
        const mediaBuffer = await mediaBlob.arrayBuffer();
        const mediaBase64 = btoa(String.fromCharCode(...new Uint8Array(mediaBuffer)));

        const uploadResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            media_data: mediaBase64,
            media_category: m.type === 'video' ? 'tweet_video' : 'tweet_image',
          }),
        });

        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadData.error || 'Media upload failed');
        mediaIds.push(uploadData.media_id_string);
      }
    }

    // Create tweet
    const tweetPayload: any = { text };
    if (mediaIds.length > 0) {
      tweetPayload.media = { media_ids: mediaIds };
    }

    const tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetPayload),
    });

    const tweetData = await tweetResponse.json();
    if (!tweetResponse.ok) throw new Error(tweetData.detail || 'Tweet creation failed');

    const tweetId = tweetData.data.id;
    const username = connection.account_username || 'user';

    console.log('[X] Success:', tweetId);
    return {
      provider: 'x',
      ok: true,
      external_id: tweetId,
      permalink: `https://twitter.com/${username}/status/${tweetId}`,
    };
  } catch (error: any) {
    console.error('[X] Error:', error);
    return {
      provider: 'x',
      ok: false,
      error_code: 'X_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
}

// ============================================================================
// STUB PROVIDERS
// ============================================================================

async function publishToFacebook(): Promise<PublishResult> {
  return {
    provider: 'facebook',
    ok: false,
    error_code: 'NOT_IMPLEMENTED',
    error_message: 'Facebook not yet implemented',
  };
}

async function publishToTikTok(): Promise<PublishResult> {
  return {
    provider: 'tiktok',
    ok: false,
    error_code: 'NOT_IMPLEMENTED',
    error_message: 'TikTok not yet implemented',
  };
}

async function publishToYouTube(): Promise<PublishResult> {
  return {
    provider: 'youtube',
    ok: false,
    error_code: 'NOT_IMPLEMENTED',
    error_message: 'YouTube not yet implemented',
  };
}

// ============================================================================
// IDEMPOTENCY CACHE
// ============================================================================

const idempotencyCache = new Map<string, CachedResponse>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (value.expiresAt < now) {
      idempotencyCache.delete(key);
    }
  }
}, 60000);

function createIdempotencyKey(payload: PublishPayload, userId: string): string {
  const data = JSON.stringify({ ...payload, userId });
  const encoder = new TextEncoder();
  const dataArray = encoder.encode(data);

  let hash = 0;
  for (let i = 0; i < dataArray.length; i++) {
    hash = ((hash << 5) - hash) + dataArray[i];
    hash = hash & hash;
  }

  return hash.toString(36);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Orchestrator] Incoming publish request');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: PublishPayload = await req.json();

    if (!payload.text || !payload.channels || payload.channels.length === 0) {
      return new Response(
        JSON.stringify({ error: 'text and channels are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency check
    const idempotencyKey = createIdempotencyKey(payload, user.id);
    const cached = idempotencyCache.get(idempotencyKey);

    if (cached && cached.expiresAt > Date.now()) {
      console.log('[Orchestrator] Returning cached response');
      return new Response(
        JSON.stringify(cached.response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save job
    const { data: job, error: jobError } = await supabase
      .from('publish_jobs')
      .insert({
        user_id: user.id,
        text_content: payload.text,
        media: payload.media || [],
        channels: payload.channels,
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Failed to create publish job');
    }

    console.log('[Orchestrator] Job created:', job.id);

    // Publish to all channels
    const publishTasks = payload.channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'instagram':
            return await publishToInstagram(user.id, payload.text, payload.media, supabase);
          case 'linkedin':
            return await publishToLinkedIn(user.id, payload.text, payload.media, supabase);
          case 'x':
            return await publishToX(user.id, payload.text, payload.media, supabase);
          case 'facebook':
            return await publishToFacebook();
          case 'tiktok':
            return await publishToTikTok();
          case 'youtube':
            return await publishToYouTube();
          default:
            return {
              provider: channel,
              ok: false,
              error_code: 'UNKNOWN_PROVIDER',
              error_message: 'Provider not supported',
            };
        }
      } catch (error: any) {
        console.error(`[Orchestrator] ${channel} error:`, error);
        return {
          provider: channel,
          ok: false,
          error_code: 'PROVIDER_ERROR',
          error_message: error.message || 'Unknown error',
        };
      }
    });

    const results = await Promise.allSettled(publishTasks);

    const publishResults: PublishResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const provider = payload.channels[index];
        return {
          provider,
          ok: false,
          error_code: 'PROMISE_REJECTED',
          error_message: result.reason?.message || 'Unknown rejection',
        };
      }
    });

    // Save results
    const resultsToInsert = publishResults.map((r) => ({
      job_id: job.id,
      provider: r.provider,
      ok: r.ok,
      external_id: r.external_id || null,
      permalink: r.permalink || null,
      error_code: r.error_code || null,
      error_message: r.error_message || null,
    }));

    const { error: resultsError } = await supabase.from('publish_results').insert(resultsToInsert);

    // Build response with optional warning
    const response: {
      job_id: string;
      results: PublishResult[];
      warning?: string;
    } = {
      job_id: job.id,
      results: publishResults,
    };

    if (resultsError) {
      console.error('[Orchestrator] Failed to save results:', resultsError);
      response.warning = 'Results could not be saved to database';
    }

    idempotencyCache.set(idempotencyKey, {
      response,
      expiresAt: Date.now() + 60000,
    });

    const successCount = publishResults.filter((r) => r.ok).length;
    console.log(`[Orchestrator] Completed: ${successCount}/${publishResults.length} successful`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Orchestrator] Fatal error:', error);

    // Extract requested channels from payload (if possible)
    let requestedChannels: Provider[] = [];
    try {
      const body = await req.clone().json();
      requestedChannels = body.channels || [];
    } catch {
      // Payload couldn't be parsed, use empty array
    }

    // Mark all requested channels as failed
    const fallbackResults: PublishResult[] = requestedChannels.map((channel) => ({
      provider: channel,
      ok: false,
      error_code: 'ORCHESTRATOR_ERROR',
      error_message: 'Critical orchestrator error occurred',
    }));

    return new Response(
      JSON.stringify({
        job_id: null,
        results: fallbackResults,
        orchestrator_error: {
          code: 'CRITICAL_ERROR',
          message: error.message || 'Unknown error',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// PROVIDER PUBLISH FUNCTIONS (extracted from /publish)
// ============================================================================

type Provider = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube' | 'linkedin';

interface MediaItem {
  type: 'image' | 'video';
  path: string;
  mime: string;
  size: number;
}

interface PublishResult {
  provider: Provider;
  ok: boolean;
  external_id?: string;
  permalink?: string;
  error_code?: string;
  error_message?: string;
}

// Instagram Provider
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

    const { data: secrets } = await supabase
      .from('app_secrets')
      .select('ig_user_id, ig_page_access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (!secrets?.ig_page_access_token || !secrets?.ig_user_id) {
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

    const containerId = await graphPost(`/${secrets.ig_user_id}/media`, {
      image_url: media[0].path,
      caption: text,
      access_token: secrets.ig_page_access_token,
    });

    const start = Date.now();
    while (Date.now() - start < 120000) {
      const status = await graphGet(`/${containerId.id}?fields=status_code`, secrets.ig_page_access_token);
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR') throw new Error('Container creation failed');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const publishResult = await graphPost(`/${secrets.ig_user_id}/media_publish`, {
      creation_id: containerId.id,
      access_token: secrets.ig_page_access_token,
    });

    const postMeta = await graphGet(`/${publishResult.id}?fields=id,permalink`, secrets.ig_page_access_token);

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

// X Provider
async function refreshXToken(connection: any, supabase: any): Promise<any | null> {
  try {
    const refreshToken = await decryptToken(connection.refresh_token_hash);
    const clientId = Deno.env.get('X_CLIENT_ID');
    const clientSecret = Deno.env.get('X_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[X] Missing X_CLIENT_ID or X_CLIENT_SECRET');
      return null;
    }

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) return null;

    const tokenData = await tokenResponse.json();
    const { encryptToken } = await import('../_shared/crypto.ts');
    const newAccessTokenHash = await encryptToken(tokenData.access_token);
    const newRefreshTokenHash = tokenData.refresh_token 
      ? await encryptToken(tokenData.refresh_token)
      : connection.refresh_token_hash;

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await supabase
      .from('social_connections')
      .update({
        access_token_hash: newAccessTokenHash,
        refresh_token_hash: newRefreshTokenHash,
        expires_at: expiresAt,
      })
      .eq('id', connection.id);

    return { access_token_hash: newAccessTokenHash };
  } catch (error: any) {
    console.error('[X] Refresh error:', error);
    return null;
  }
}

async function publishToX(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[X] Starting publish for user:', userId);

    const { data: connection } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .eq('is_active', true)
      .maybeSingle();

    if (!connection) {
      return {
        provider: 'x',
        ok: false,
        error_code: 'NO_CONNECTION',
        error_message: 'X not connected',
      };
    }

    let accessToken = await decryptToken(connection.access_token_hash);

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

    const tweetPayload: any = { text };
    if (mediaIds.length > 0) {
      tweetPayload.media = { media_ids: mediaIds };
    }

    let tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetPayload),
    });

    if (tweetResponse.status === 401 && connection.refresh_token_hash) {
      const refreshed = await refreshXToken(connection, supabase);
      if (refreshed) {
        accessToken = await decryptToken(refreshed.access_token_hash);
        tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tweetPayload),
        });
      }
    }

    const tweetData = await tweetResponse.json();
    if (!tweetResponse.ok) throw new Error(tweetData.detail || 'Tweet creation failed');

    const tweetId = tweetData.data.id;
    const permalink = `https://x.com/i/web/status/${tweetId}`;

    return {
      provider: 'x',
      ok: true,
      external_id: tweetId,
      permalink,
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

// LinkedIn Provider
async function publishToLinkedIn(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[LinkedIn] Starting publish for user:', userId);

    const { data: connection } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'linkedin')
      .eq('is_active', true)
      .maybeSingle();

    if (!connection) {
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

      if (!registerResponse.ok) {
        if (registerResponse.status === 403) {
          return {
            provider: 'linkedin',
            ok: true,
            error_code: 'LI_403',
            error_message: 'Publishing limited; UGC only / API restricted',
          };
        }
        throw new Error('Failed to register asset');
      }
      
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

    if (!postResponse.ok) {
      if (postResponse.status === 403) {
        return {
          provider: 'linkedin',
          ok: true,
          error_code: 'LI_403',
          error_message: 'Publishing limited; UGC only / API restricted',
        };
      }
      throw new Error('Failed to create post');
    }

    const postData = await postResponse.json();
    const postUrn = postData.id;

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

// Stub providers (Facebook, TikTok, YouTube) - return mock success
async function publishStubProvider(provider: Provider): Promise<PublishResult> {
  console.log(`[${provider}] Mock publish - full implementation pending`);
  return {
    provider,
    ok: true,
    external_id: `mock_${Date.now()}`,
    permalink: `https://${provider}.com/post/mock`,
    error_code: 'STUB_PROVIDER',
    error_message: `${provider} publishing not yet implemented`,
  };
}

// ============================================================================
// QUEUE PROCESSOR
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[process-queue-delayed] Starting...');

    // Fetch pending jobs with channel_offsets
    const { data: jobs, error: jobsError } = await supabase
      .from('publish_jobs')
      .select('*')
      .not('channel_offsets', 'is', null)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (jobsError) {
      console.error('[process-queue-delayed] Error fetching jobs:', jobsError);
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      console.log('[process-queue-delayed] No jobs to process');
      return new Response(
        JSON.stringify({ processed: 0, message: 'No pending jobs' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;

    for (const job of jobs) {
      const channel_offsets = job.channel_offsets || {};
      const scheduledAt = new Date(job.scheduled_at || job.created_at).getTime();
      const now = Date.now();

      // Check which providers are ready
      const readyProviders: Provider[] = [];
      
      for (const provider of job.channels) {
        const offset = (channel_offsets[provider] || 0) * 1000; // seconds to ms
        const effectiveTime = scheduledAt + offset;
        
        if (now >= effectiveTime) {
          readyProviders.push(provider);
        }
      }

      if (readyProviders.length === 0) {
        console.log(`[process-queue-delayed] Job ${job.id} - no ready providers yet`);
        continue;
      }

      console.log(`[process-queue-delayed] Job ${job.id} - processing ${readyProviders.length} providers:`, readyProviders);

      // Publish to ready providers
      for (const provider of readyProviders) {
        try {
          // Check if already published
          const { data: existingResult } = await supabase
            .from('publish_results')
            .select('id')
            .eq('job_id', job.id)
            .eq('provider', provider)
            .maybeSingle();

          if (existingResult) {
            console.log(`[process-queue-delayed] Job ${job.id} - ${provider} already published`);
            continue;
          }

          // Call actual provider function
          let result: PublishResult;

          switch (provider) {
            case 'instagram':
              result = await publishToInstagram(job.user_id, job.text_content, job.media, supabase);
              break;
            case 'x':
              result = await publishToX(job.user_id, job.text_content, job.media, supabase);
              break;
            case 'linkedin':
              result = await publishToLinkedIn(job.user_id, job.text_content, job.media, supabase);
              break;
            case 'facebook':
            case 'tiktok':
            case 'youtube':
              result = await publishStubProvider(provider);
              break;
            default:
              result = {
                provider,
                ok: false,
                error_code: 'UNKNOWN_PROVIDER',
                error_message: `Provider ${provider} not supported`,
              };
          }

          const jobStartTime = Date.now();
          console.log(`[process-queue-delayed] Job ${job.id} - ${provider} result:`, result);
          
          // Save result
          await supabase.from('publish_results').insert({
            job_id: job.id,
            provider: result.provider,
            ok: result.ok,
            external_id: result.external_id,
            permalink: result.permalink,
            error_code: result.error_code,
            error_message: result.error_message,
          });

          // Log to publish_logs for monitoring
          try {
            await supabase.from('publish_logs').insert({
              user_id: job.user_id,
              provider: result.provider,
              status: result.ok ? 'ok' : 'error',
              duration_ms: Date.now() - jobStartTime,
              job_id: job.id,
              error_code: result.error_code,
              error_message: result.error_message,
            });
          } catch (logError) {
            console.warn('[process-queue-delayed] Failed to log publish result:', logError);
          }
        } catch (error) {
          console.error(`[process-queue-delayed] Error publishing to ${provider}:`, error);
          
          await supabase.from('publish_results').insert({
            job_id: job.id,
            provider,
            ok: false,
            error_code: 'PUBLISH_EXCEPTION',
            error_message: error instanceof Error ? error.message : String(error),
          });

          // Log error to publish_logs
          try {
            await supabase.from('publish_logs').insert({
              user_id: job.user_id,
              provider,
              status: 'error',
              duration_ms: 0,
              job_id: job.id,
              error_code: 'PUBLISH_EXCEPTION',
              error_message: error instanceof Error ? error.message : String(error),
            });
          } catch (logError) {
            console.warn('[process-queue-delayed] Failed to log error:', logError);
          }
        }
      }

      // Check if all providers done
      const { data: results } = await supabase
        .from('publish_results')
        .select('provider')
        .eq('job_id', job.id);

      const doneProviders = results?.map(r => r.provider) || [];
      const allDone = job.channels.every((p: Provider) => doneProviders.includes(p));

      if (allDone) {
        console.log(`[process-queue-delayed] Job ${job.id} - all providers complete, marking as published`);
        await supabase
          .from('publish_jobs')
          .update({ status: 'published' })
          .eq('id', job.id);
      } else {
        console.log(`[process-queue-delayed] Job ${job.id} - ${doneProviders.length}/${job.channels.length} providers done, marking as processing`);
        await supabase
          .from('publish_jobs')
          .update({ status: 'processing' })
          .eq('id', job.id);
      }

      processedCount++;
    }

    console.log(`[process-queue-delayed] Completed - processed ${processedCount} jobs`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        processed: processedCount,
        message: `Processed ${processedCount} delayed publishing jobs`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[process-queue-delayed] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

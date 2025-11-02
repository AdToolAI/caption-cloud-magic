import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken, encryptToken } from '../_shared/crypto.ts';
import { withTelemetry } from '../_shared/telemetry.ts';

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
  channel_offsets?: Record<Provider, number>; // Zeitversatz in Sekunden
  youtubeConfig?: any; // YouTube-spezifische Konfiguration
}

interface PublishResult {
  provider: Provider;
  ok: boolean;
  external_id?: string;
  permalink?: string;
  error_code?: string;
  error_message?: string;
  transform_report?: any; // Transform-Report (optional)
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
  
  // Log parameters being sent (but hide access_token)
  const logParams = { ...params };
  if (logParams.access_token) {
    logParams.access_token = '***REDACTED***';
  }
  console.log('[Instagram API] POST', path, logParams);
  
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) {
    const errorData = await res.json();
    console.error('[Instagram API] Error Response:', JSON.stringify(errorData, null, 2));
    
    // Extract detailed error info
    const errorMessage = errorData.error?.message || 'Graph API error';
    const errorCode = errorData.error?.code || 'UNKNOWN';
    const errorType = errorData.error?.type || 'UNKNOWN';
    
    throw new Error(`${errorType} (${errorCode}): ${errorMessage}`);
  }
  return await res.json();
}

async function graphGet(path: string, token: string) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `https://graph.facebook.com/v18.0${path}${separator}access_token=${token}`;
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

    // Get Instagram connection from social_connections (not app_secrets!)
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('account_id, access_token_hash')
      .eq('user_id', userId)
      .eq('provider', 'instagram')
      .maybeSingle();

    if (connectionError || !connection?.access_token_hash || !connection?.account_id) {
      console.error('[Instagram] Missing credentials:', connectionError);
      return {
        provider: 'instagram',
        ok: false,
        error_code: 'MISSING_CREDENTIALS',
        error_message: 'Instagram not connected',
      };
    }

    // Decrypt token
    const accessToken = await decryptToken(connection.access_token_hash);

    if (!media || media.length === 0) {
      return {
        provider: 'instagram',
        ok: false,
        error_code: 'MEDIA_REQUIRED',
        error_message: 'Instagram requires at least one image or video',
      };
    }

    const firstMedia = media[0];
    const isVideo = firstMedia.type === 'video';

    console.log(`[Instagram] Publishing ${isVideo ? 'Reel (video)' : 'image post'}`);

    // Create container with appropriate media type
    const containerParams: Record<string, string> = {
      caption: text,
      access_token: accessToken,
    };

    if (isVideo) {
      // Instagram requires 'REELS' for all video content
      containerParams.media_type = 'REELS';
      
      // Ensure video URL is properly formatted
      const videoUrl = firstMedia.path;
      console.log('[Instagram] Video URL:', videoUrl);
      
      // Check if URL is accessible
      try {
        const headResponse = await fetch(videoUrl, { method: 'HEAD' });
        console.log('[Instagram] Video URL accessible:', headResponse.ok, 'Status:', headResponse.status);
        console.log('[Instagram] Content-Type:', headResponse.headers.get('content-type'));
        console.log('[Instagram] Content-Length:', headResponse.headers.get('content-length'));
      } catch (e) {
        console.error('[Instagram] Video URL not accessible:', e);
      }
      
      containerParams.video_url = videoUrl;
    } else {
      // Image post
      containerParams.image_url = firstMedia.path;
    }

    const containerId = await graphPost(`/${connection.account_id}/media`, containerParams);

    console.log(`[Instagram] Container created: ${containerId.id}, waiting for processing...`);

    // Wait for processing (videos take longer than images)
    const maxWaitTime = isVideo ? 300000 : 120000; // 5 min for video, 2 min for image
    const start = Date.now();
    
    while (Date.now() - start < maxWaitTime) {
      const status = await graphGet(`/${containerId.id}?fields=status_code`, accessToken);
      
      if (status.status_code === 'FINISHED') {
        console.log('[Instagram] Processing finished');
        break;
      }
      
      if (status.status_code === 'ERROR') {
        throw new Error('Container processing failed');
      }
      
      if (status.status_code === 'IN_PROGRESS') {
        console.log('[Instagram] Still processing...');
      }
      
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Poll every 3 seconds
    }

    // Publish
    const publishResult = await graphPost(`/${connection.account_id}/media_publish`, {
      creation_id: containerId.id,
      access_token: accessToken,
    });

    const postMeta = await graphGet(`/${publishResult.id}?fields=id,permalink`, accessToken);

    console.log('[Instagram] published', { 
      external_id: publishResult.id, 
      permalink: postMeta.permalink,
      type: isVideo ? 'reel' : 'image'
    });
    
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
      .maybeSingle();

    if (connectionError || !connection) {
      return {
        provider: 'linkedin',
        ok: false,
        error_code: 'NO_CONNECTION',
        error_message: 'LinkedIn not connected',
      };
    }

    const expiresAt = new Date(connection.token_expires_at);
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

      if (!registerResponse.ok) {
        const registerError = await registerResponse.json();
        if (registerResponse.status === 403) {
          console.log('[LinkedIn] 403 detected - UGC restriction');
          return {
            provider: 'linkedin',
            ok: true,
            external_id: undefined,
            permalink: undefined,
            error_code: 'LI_403',
            error_message: 'Publishing limited; UGC only / API restricted',
          };
        }
        throw new Error(registerError.message || 'Failed to register asset');
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

    if (!postResponse.ok) {
      const postError = await postResponse.json();
      if (postResponse.status === 403) {
        console.log('[LinkedIn] 403 detected - UGC restriction');
        return {
          provider: 'linkedin',
          ok: true,
          external_id: undefined,
          permalink: undefined,
          error_code: 'LI_403',
          error_message: 'Publishing limited; UGC only / API restricted',
        };
      }
      throw new Error(postError.message || 'Failed to create post');
    }

    const postData = await postResponse.json();
    const postUrn = postData.id;

    console.log('[LinkedIn] published', { external_id: postUrn, permalink: `https://www.linkedin.com/feed/update/${postUrn}` });
    return {
      provider: 'linkedin',
      ok: true,
      external_id: postUrn,
      permalink: `https://www.linkedin.com/feed/update/${postUrn}`,
    };
  } catch (error: any) {
    console.error('[LinkedIn] Error:', error);
    
    // Spezialbehandlung für 403 in catch-block
    if (error.message?.includes('403') || error.message?.includes('ACCESS_DENIED')) {
      console.log('[LinkedIn] 403 detected - UGC restriction');
      return {
        provider: 'linkedin',
        ok: true,
        external_id: undefined,
        permalink: undefined,
        error_code: 'LI_403',
        error_message: 'Publishing limited; UGC only / API restricted',
      };
    }
    
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

    if (!tokenResponse.ok) {
      console.error('[X] Token refresh failed:', await tokenResponse.text());
      return null;
    }

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
        token_expires_at: expiresAt,
      })
      .eq('id', connection.id);

    console.log('[X] Token refreshed successfully');
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

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .maybeSingle();

    if (connectionError || !connection) {
      return {
        provider: 'x',
        ok: false,
        error_code: 'NO_CONNECTION',
        error_message: 'X not connected',
      };
    }

    let accessToken = await decryptToken(connection.access_token_hash);

    // Upload media if present
    let mediaIds: string[] = [];
    if (media && media.length > 0) {
      console.warn('[X] ⚠️ Media uploads currently disabled due to OAuth 2.0 limitations');
      console.warn('[X] Twitter v1.1 Media Upload API requires OAuth 1.0a authentication');
      console.warn('[X] Current setup only provides OAuth 2.0 tokens from the authorization flow');
      console.warn('[X] Posting text-only. Media will be ignored.');
      console.warn('[X] To enable media uploads:');
      console.warn('[X]   1. Configure Twitter App with OAuth 1.0a credentials');
      console.warn('[X]   2. Store oauth_token and oauth_token_secret in social_connections');
      console.warn('[X]   3. Implement OAuth 1.0a signature generation for media uploads');
      
      // Skip media upload - OAuth 2.0 Bearer tokens are not supported by v1.1 Media Upload API
      // This results in 403 Forbidden errors
    }

    // Create tweet
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

    // Token refresh bei 401
    if (tweetResponse.status === 401 && connection.refresh_token_hash) {
      console.log('[X] Token expired (401), attempting refresh');
      const refreshed = await refreshXToken(connection, supabase);
      
      if (refreshed) {
        accessToken = await decryptToken(refreshed.access_token_hash);
        
        // Retry tweet creation
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

    if (!tweetResponse.ok) {
      const errorText = await tweetResponse.text();
      console.error('[X] Tweet creation failed:', errorText);
      throw new Error(`Tweet creation failed: ${tweetResponse.status} ${errorText}`);
    }

    const tweetData = await tweetResponse.json();

    const tweetId = tweetData.data.id;
    const permalink = `https://x.com/i/web/status/${tweetId}`;

    console.log('[X] published', { external_id: tweetId, permalink });
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

// ============================================================================
// STUB PROVIDERS
// ============================================================================

async function publishToFacebook(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[Facebook] Starting publish for user:', userId);

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'facebook')
      .maybeSingle();

    if (connectionError || !connection) {
      console.log('[Facebook] No connection - mocking success');
      return {
        provider: 'facebook',
        ok: true,
        external_id: 'mock_fb_' + Date.now(),
        permalink: undefined,
        error_code: 'FB_MOCK',
        error_message: 'Facebook not connected - simulated success for MVP',
      };
    }

    const accessToken = await decryptToken(connection.access_token_hash);
    const pageId = connection.account_id;

    // Check if video
    if (media && media.length > 0 && media[0].type === 'video') {
      console.log('[Facebook] Video upload detected');
      
      // Download video from Supabase Storage
      const videoPath = media[0].path.replace(/^.*\/media-assets\//, '');
      const { data: videoData, error: downloadError } = await supabase.storage
        .from('media-assets')
        .download(videoPath);

      if (downloadError || !videoData) {
        console.error('[Facebook] Video download failed:', downloadError);
        throw new Error('Failed to download video from storage');
      }

      const videoBytes = await videoData.arrayBuffer();
      const videoSize = videoBytes.byteLength;
      
      console.log('[Facebook] Video downloaded, size:', (videoSize / 1024 / 1024).toFixed(2), 'MB');

      // Step 1: Initialize resumable upload
      const initResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/videos?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_phase: 'start',
            file_size: videoSize,
          }),
        }
      );

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        console.error('[Facebook] Upload init failed:', errorText);
        throw new Error(`Failed to initialize video upload: ${initResponse.status}`);
      }

      const initData = await initResponse.json();
      const uploadSessionId = initData.upload_session_id;
      
      console.log('[Facebook] Upload session started:', uploadSessionId);

      // Step 2: Upload video in chunks (for simplicity, upload as single chunk if < 100MB)
      const chunkSize = Math.min(videoSize, 100 * 1024 * 1024); // 100MB max chunk
      let startOffset = 0;

      while (startOffset < videoSize) {
        const endOffset = Math.min(startOffset + chunkSize, videoSize);
        const chunk = videoBytes.slice(startOffset, endOffset);

        const formData = new FormData();
        formData.append('upload_phase', 'transfer');
        formData.append('start_offset', startOffset.toString());
        formData.append('upload_session_id', uploadSessionId);
        formData.append('video_file_chunk', new Blob([chunk], { type: 'video/mp4' }));

        const uploadResponse = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}/videos?access_token=${accessToken}`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('[Facebook] Chunk upload failed:', errorText);
          throw new Error(`Failed to upload video chunk: ${uploadResponse.status}`);
        }

        console.log(`[Facebook] Uploaded chunk: ${startOffset}-${endOffset} / ${videoSize}`);
        startOffset = endOffset;
      }

      // Step 3: Finalize upload
      const finishResponse = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}/videos?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upload_phase: 'finish',
            upload_session_id: uploadSessionId,
            description: text,
          }),
        }
      );

      if (!finishResponse.ok) {
        const errorText = await finishResponse.text();
        console.error('[Facebook] Upload finish failed:', errorText);
        throw new Error(`Failed to finalize video upload: ${finishResponse.status}`);
      }

      const finishData = await finishResponse.json();
      
      console.log('[Facebook] Video published', { 
        external_id: finishData.id, 
        permalink: `https://facebook.com/${finishData.id}` 
      });

      return {
        provider: 'facebook',
        ok: true,
        external_id: finishData.id,
        permalink: finishData.id ? `https://facebook.com/${finishData.id}` : undefined,
      };
    }

    // Text or Image post
    let postEndpoint = `/${pageId}/feed`;
    const params: Record<string, string> = {
      message: text,
      access_token: accessToken,
    };

    if (media && media.length > 0 && media[0].type === 'image') {
      // Photo Post
      postEndpoint = `/${pageId}/photos`;
      params.url = media[0].path;
      params.caption = text;
      delete params.message;
    }

    const postResponse = await graphPost(postEndpoint, params);
    
    console.log('[Facebook] published', { 
      external_id: postResponse.id, 
      permalink: `https://facebook.com/${postResponse.id}` 
    });
    
    return {
      provider: 'facebook',
      ok: true,
      external_id: postResponse.id,
      permalink: postResponse.id ? `https://facebook.com/${postResponse.id}` : undefined,
    };
  } catch (error: any) {
    console.error('[Facebook] Error:', error);
    return {
      provider: 'facebook',
      ok: false,
      error_code: 'FB_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
}

async function publishToTikTok(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any
): Promise<PublishResult> {
  try {
    console.log('[TikTok] Starting publish for user:', userId);

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'tiktok')
      .maybeSingle();

    if (connectionError || !connection) {
      console.log('[TikTok] No connection found');
      return {
        provider: 'tiktok',
        ok: false,
        error_code: 'TT_NO_CONNECTION',
        error_message: 'TikTok account not connected',
      };
    }

    const accessToken = atob(connection.access_token_hash);

    // TikTok requires video for posts
    if (!media || media.length === 0 || media[0].type !== 'video') {
      console.log('[TikTok] No video provided - TikTok requires video content');
      return {
        provider: 'tiktok',
        ok: false,
        error_code: 'TT_NO_VIDEO',
        error_message: 'TikTok requires a video to post',
      };
    }

    const videoMedia = media[0];
    console.log('[TikTok] Downloading video from storage:', videoMedia.path);

    // Download video from Supabase Storage
    const { data: videoData, error: downloadError } = await supabase.storage
      .from('media-assets')
      .download(videoMedia.path);

    if (downloadError || !videoData) {
      console.error('[TikTok] Video download failed:', downloadError);
      throw new Error('Failed to download video from storage');
    }

    const videoBytes = await videoData.arrayBuffer();
    const videoSize = videoBytes.byteLength;
    console.log('[TikTok] Video downloaded, size:', (videoSize / 1024 / 1024).toFixed(2), 'MB');

    // Step 1: Initialize upload
    console.log('[TikTok] Initializing upload...');
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_info: {
          title: text.slice(0, 150), // TikTok title max 150 chars
          description: text,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1
        }
      })
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error('[TikTok] Init failed:', errorText);
      throw new Error(`TikTok upload init failed: ${initResponse.status}`);
    }

    const initData = await initResponse.json();
    
    if (initData.error?.code !== 'ok' || !initData.data) {
      console.error('[TikTok] Init error:', initData);
      throw new Error(initData.error?.message || 'Upload init failed');
    }

    const { publish_id, upload_url } = initData.data;
    console.log('[TikTok] Upload initialized, publish_id:', publish_id);

    // Step 2: Upload video
    console.log('[TikTok] Uploading video...');
    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`
      },
      body: videoBytes
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[TikTok] Upload failed:', errorText);
      throw new Error(`Video upload failed: ${uploadResponse.status}`);
    }

    console.log('[TikTok] ✅ Video uploaded successfully');

    return {
      provider: 'tiktok',
      ok: true,
      external_id: publish_id,
      permalink: undefined, // TikTok doesn't provide direct permalink until video is processed
      error_code: undefined,
      error_message: undefined,
    };
  } catch (error: any) {
    console.error('[TikTok] Error:', error);
    return {
      provider: 'tiktok',
      ok: false,
      error_code: 'TT_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
}

async function publishToYouTube(
  userId: string,
  text: string,
  media: MediaItem[] | undefined,
  supabase: any,
  youtubeConfig?: any
): Promise<PublishResult> {
  try {
    console.log('[YouTube] Starting publish for user:', userId);

    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'youtube')
      .maybeSingle();

    if (connectionError || !connection) {
      console.log('[YouTube] No connection - mocking success');
      return {
        provider: 'youtube',
        ok: true,
        external_id: 'mock_yt_' + Date.now(),
        permalink: undefined,
        error_code: 'YT_MOCK',
        error_message: 'YouTube not connected - simulated success for MVP',
      };
    }

    // Video erforderlich
    if (!media || media.length === 0 || media[0].type !== 'video') {
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'VIDEO_REQUIRED',
        error_message: 'YouTube requires a video file',
      };
    }

    // Token-Refresh-Logik mit Fehlerbehandlung
    let accessToken: string;
    
    // Defensive check for token_expires_at
    if (!connection.token_expires_at) {
      console.error('[YouTube] No token expiry date found');
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_TOKEN_INVALID',
        error_message: 'YouTube connection expired. Please reconnect in Performance Tracker → Connections tab.',
      };
    }
    
    const tokenExpiry = new Date(connection.token_expires_at);
    
    // Check if date is valid
    if (isNaN(tokenExpiry.getTime())) {
      console.error('[YouTube] Invalid token expiry date:', connection.token_expires_at);
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_TOKEN_INVALID',
        error_message: 'YouTube connection expired. Please reconnect in Performance Tracker → Connections tab.',
      };
    }
    
    try {
      if (tokenExpiry < new Date()) {
        console.log('[YouTube] Token expired, refreshing...');
        
        // Check if refresh_token_hash exists
        if (!connection.refresh_token_hash) {
          console.error('[YouTube] No refresh token available');
          return {
            provider: 'youtube',
            ok: false,
            error_code: 'YT_NO_REFRESH_TOKEN',
            error_message: 'No refresh token found. Please reconnect YouTube.',
          };
        }
        
        console.log('[YouTube] Attempting to decrypt refresh_token...');
        console.log('[YouTube] refresh_token_hash length:', connection.refresh_token_hash?.length);
        
        let refreshToken: string;
        try {
          refreshToken = await decryptToken(connection.refresh_token_hash);
          console.log('[YouTube] Refresh token decrypted successfully');
        } catch (decryptErr: any) {
          console.error('[YouTube] Refresh token decryption failed:', {
            error: decryptErr.message,
            stack: decryptErr.stack,
            hash_length: connection.refresh_token_hash?.length,
            hash_present: !!connection.refresh_token_hash
          });
          return {
            provider: 'youtube',
            ok: false,
            error_code: 'YT_DECRYPT_FAILED',
            error_message: `Token decryption failed: ${decryptErr.message}. Please reconnect YouTube.`,
          };
        }
        
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      
      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.json();
        console.error('[YouTube] Token refresh failed:', errorData);
        throw new Error('Token refresh failed - please reconnect YouTube');
      }
      
      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
      
      // Update connection in DB
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000);
      await supabase
        .from('social_connections')
        .update({
          access_token_hash: await encryptToken(accessToken),
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connection.id);
      
      console.log('[YouTube] Token refreshed successfully');
      } else {
        console.log('[YouTube] Decrypting access token...');
        try {
          accessToken = await decryptToken(connection.access_token_hash);
          console.log('[YouTube] Using existing token (expires:', tokenExpiry.toISOString(), ')');
        } catch (decryptErr: any) {
          console.error('[YouTube] Access token decryption failed:', decryptErr.message);
          throw new Error('Token decryption failed - invalid token format');
        }
      }
    } catch (error: any) {
      console.error('[YouTube] Token handling error:', error.message);
      console.log('[YouTube] Please reconnect your YouTube account in Performance Tracker');
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_TOKEN_INVALID',
        error_message: 'YouTube connection expired. Please reconnect in Performance Tracker → Connections tab.',
      };
    }
    
    // Validate video file
    if (!media || media.length === 0) {
      console.error('[YouTube] No media provided for video upload');
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_NO_MEDIA',
        error_message: 'YouTube benötigt eine Videodatei. Bitte laden Sie ein Video hoch.',
      };
    }

    const videoFile = media[0];
    if (videoFile.type !== 'video') {
      console.error('[YouTube] Media is not a video:', videoFile.type);
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_INVALID_MEDIA',
        error_message: 'YouTube benötigt eine Videodatei. Bitte laden Sie ein Video hoch, kein Bild.',
      };
    }

    if (videoFile.size < 1024) {
      console.error('[YouTube] Video file too small:', videoFile.size);
      return {
        provider: 'youtube',
        ok: false,
        error_code: 'YT_FILE_TOO_SMALL',
        error_message: `Videodatei ist zu klein (${videoFile.size} Bytes). Bitte laden Sie ein gültiges Video hoch.`,
      };
    }

    console.log('[YouTube] Video validated:', {
      path: videoFile.path,
      size: videoFile.size,
      mime: videoFile.mime
    });
    
    // Titel = erste 100 Zeichen (YouTube erlaubt max 100)
    const title = text.substring(0, 100) || 'Untitled Video';
    const description = text;

    // Upload-Request (resumable upload) mit erweiterten Metadaten
    const metadataResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          categoryId: youtubeConfig?.categoryId || '22', // Default: People & Blogs
          tags: youtubeConfig?.tags || [],
        },
        status: {
          privacyStatus: youtubeConfig?.privacyStatus || 'unlisted',
          selfDeclaredMadeForKids: youtubeConfig?.madeForKids ?? false, // PFLICHT!
          embeddable: youtubeConfig?.embeddable ?? true,
          publicStatsViewable: youtubeConfig?.publicStatsViewable ?? true,
          license: youtubeConfig?.license || 'youtube',
        },
      }),
    });

    if (!metadataResponse.ok) {
      const errorData = await metadataResponse.json();
      console.error('[YouTube API] Metadata upload error:', JSON.stringify(errorData, null, 2));
      
      const errorMessage = errorData.error?.message || 'Failed to initiate upload';
      const errorCode = errorData.error?.code || 'UNKNOWN';
      
      throw new Error(`YouTube API Error (${errorCode}): ${errorMessage}`);
    }

    const uploadUrl = metadataResponse.headers.get('location');
    if (!uploadUrl) throw new Error('No upload URL returned');

    // Video-Datei hochladen
    const videoResponse = await fetch(media[0].path);
    const videoBlob = await videoResponse.blob();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': media[0].mime,
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[YouTube] Video upload failed:', uploadResponse.status, errorText);
      throw new Error(`Video upload failed: ${uploadResponse.status}`);
    }
    
    const uploadData = await uploadResponse.json();
    const videoId = uploadData.id;

    // Upload-Status prüfen
    try {
      const statusResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${videoId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const video = statusData.items?.[0];
        console.log('[YouTube] Upload Status:', video?.status?.uploadStatus);
        console.log('[YouTube] Processing:', video?.processingDetails?.processingStatus);
      }
    } catch (statusError) {
      console.warn('[YouTube] Status check failed (non-critical):', statusError);
    }

    console.log('[YouTube] published', { 
      external_id: videoId, 
      permalink: `https://youtu.be/${videoId}`,
      privacy: youtubeConfig?.privacyStatus || 'unlisted',
      madeForKids: youtubeConfig?.madeForKids ?? false
    });
    
    return {
      provider: 'youtube',
      ok: true,
      external_id: videoId,
      permalink: `https://youtu.be/${videoId}`,
    };
  } catch (error: any) {
    console.error('[YouTube] Error:', error);
    console.error('[YouTube] Stack:', error.stack);
    
    return {
      provider: 'youtube',
      ok: false,
      error_code: error.message?.includes('Token refresh') ? 'TOKEN_EXPIRED' : 'YT_ERROR',
      error_message: error.message || 'Failed to publish',
    };
  }
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

Deno.serve(withTelemetry('publish', async (req) => {
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

    // Rate limit check: Max 4 concurrent publishes per user
    const { count } = await supabase
      .from('active_publishes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count !== null && count >= 4) {
      console.log('[Orchestrator] Rate limit exceeded:', user.id, 'active jobs:', count);
      return new Response(
        JSON.stringify({ 
          error: 'TOO_MANY_CONCURRENT_JOBS', 
          message: 'Max 4 gleichzeitige Publishes erreicht. Bitte warten Sie, bis vorherige Jobs abgeschlossen sind.' 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        channel_offsets: payload.channel_offsets || {}, // NEU: Zeitversatz speichern
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error('Failed to create publish job');
    }

    console.log('[Orchestrator] Job created:', job.id);

    // Register active publish for rate limiting
    await supabase.from('active_publishes').insert({
      user_id: user.id,
      job_id: job.id,
    });

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
            return await publishToFacebook(user.id, payload.text, payload.media, supabase);
          case 'tiktok':
            return await publishToTikTok(user.id, payload.text, payload.media, supabase);
          case 'youtube':
            return await publishToYouTube(user.id, payload.text, payload.media, supabase, payload.youtubeConfig);
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
      transform_report: r.transform_report || null, // NEU: Transform-Report
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

    // Log publish results for monitoring
    for (const result of publishResults) {
      const startTime = Date.now();
      try {
        await supabase.from('publish_logs').insert({
          user_id: user.id,
          provider: result.provider,
          status: result.ok ? 'ok' : 'error',
          duration_ms: 0, // Duration not tracked for immediate publishes
          job_id: job.id,
          error_code: result.error_code,
          error_message: result.error_message,
        });
      } catch (logError) {
        console.warn('[Orchestrator] Failed to log publish result:', logError);
      }
    }

    // Remove from active publishes
    await supabase.from('active_publishes').delete().eq('job_id', job.id);

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
}));

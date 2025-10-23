import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../../_shared/crypto.ts';
import type { ProviderPublisher, PublishResult, MediaItem } from './index.ts';

async function uploadMedia(
  accessToken: string,
  mediaUrl: string,
  mediaType: string
): Promise<string> {
  const mediaResponse = await fetch(mediaUrl);
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
      media_category: mediaType === 'video' ? 'tweet_video' : 'tweet_image',
    }),
  });

  const uploadData = await uploadResponse.json();

  if (!uploadResponse.ok) {
    console.error('[X Provider] Media upload error:', uploadData);
    throw new Error(uploadData.error || 'Media upload failed');
  }

  return uploadData.media_id_string;
}

export const xProvider: ProviderPublisher = {
  name: 'x',

  async publish({ userId, text, media }): Promise<PublishResult> {
    try {
      console.log('[X Provider] Starting publish for user:', userId);

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get X connection
      const { data: connection, error: connectionError } = await supabase
        .from('social_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'x')
        .eq('is_active', true)
        .single();

      if (connectionError || !connection) {
        console.error('[X Provider] No active connection:', connectionError);
        return {
          provider: 'x',
          ok: false,
          error_code: 'NO_CONNECTION',
          error_message: 'X (Twitter) not connected. Please connect your account.',
        };
      }

      const accessToken = await decryptToken(connection.access_token_hash);

      // Upload media if present
      let mediaIds: string[] = [];
      if (media && media.length > 0) {
        console.log('[X Provider] Uploading media...');
        mediaIds = await Promise.all(
          media.map((m) => uploadMedia(accessToken, m.path, m.type))
        );
      }

      // Create tweet (v2)
      const tweetPayload: any = { text };
      if (mediaIds.length > 0) {
        tweetPayload.media = { media_ids: mediaIds };
      }

      console.log('[X Provider] Creating tweet...');
      const tweetResponse = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetPayload),
      });

      const tweetData = await tweetResponse.json();

      if (!tweetResponse.ok) {
        console.error('[X Provider] Tweet creation error:', tweetData);
        throw new Error(tweetData.detail || tweetData.title || 'Tweet creation failed');
      }

      const tweetId = tweetData.data.id;
      const username = connection.account_username || 'user';
      const permalink = `https://twitter.com/${username}/status/${tweetId}`;

      console.log('[X Provider] Success:', tweetId);
      return {
        provider: 'x',
        ok: true,
        external_id: tweetId,
        permalink: permalink,
      };
    } catch (error: any) {
      console.error('[X Provider] Error:', error);
      return {
        provider: 'x',
        ok: false,
        error_code: error.code || 'X_ERROR',
        error_message: error.message || 'Failed to publish to X (Twitter)',
      };
    }
  },
};

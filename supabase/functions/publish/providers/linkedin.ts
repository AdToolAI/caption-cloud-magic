import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../../_shared/crypto.ts';
import type { ProviderPublisher, PublishResult, MediaItem } from './index.ts';

async function registerImageAsset(
  accountId: string,
  accessToken: string
): Promise<{ uploadUrl: string; asset: string }> {
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
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    }),
  });

  if (!registerResponse.ok) {
    const error = await registerResponse.text();
    throw new Error(`Failed to register asset: ${error}`);
  }

  const registerData = await registerResponse.json();
  return {
    uploadUrl: registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl,
    asset: registerData.value.asset,
  };
}

async function uploadImage(uploadUrl: string, imageUrl: string): Promise<void> {
  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: imageBlob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload image to LinkedIn');
  }
}

export const linkedinProvider: ProviderPublisher = {
  name: 'linkedin',

  async publish({ userId, text, media }): Promise<PublishResult> {
    try {
      console.log('[LinkedIn Provider] Starting publish for user:', userId);

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get LinkedIn connection
      const { data: connection, error: connectionError } = await supabase
        .from('social_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'linkedin')
        .eq('is_active', true)
        .single();

      if (connectionError || !connection) {
        console.error('[LinkedIn Provider] No active connection:', connectionError);
        return {
          provider: 'linkedin',
          ok: false,
          error_code: 'NO_CONNECTION',
          error_message: 'LinkedIn not connected. Please connect your account.',
        };
      }

      // Check token expiration
      const expiresAt = new Date(connection.expires_at);
      if (expiresAt <= new Date()) {
        return {
          provider: 'linkedin',
          ok: false,
          error_code: 'TOKEN_EXPIRED',
          error_message: 'LinkedIn token expired. Please reconnect your account.',
        };
      }

      const accessToken = await decryptToken(connection.access_token_hash);
      const accountId = connection.account_id;

      let mediaAssets: string[] = [];

      // Handle image upload if media provided
      if (media && media.length > 0) {
        console.log('[LinkedIn Provider] Uploading image...');
        const { uploadUrl, asset } = await registerImageAsset(accountId, accessToken);
        await uploadImage(uploadUrl, media[0].path);
        mediaAssets.push(asset);
      }

      // Create UGC post
      const postPayload: any = {
        author: accountId,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text,
            },
            shareMediaCategory: mediaAssets.length > 0 ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      if (mediaAssets.length > 0) {
        postPayload.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            media: mediaAssets[0],
          },
        ];
      }

      console.log('[LinkedIn Provider] Creating post...');
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
        const error = await postResponse.text();
        console.error('[LinkedIn Provider] Post creation failed:', error);
        throw new Error(`Failed to create LinkedIn post: ${error}`);
      }

      const postData = await postResponse.json();
      const postUrn = postData.id;
      const postId = postUrn.split(':').pop();
      const permalink = `https://www.linkedin.com/feed/update/${postUrn}`;

      console.log('[LinkedIn Provider] Success:', postUrn);
      return {
        provider: 'linkedin',
        ok: true,
        external_id: postUrn,
        permalink: permalink,
      };
    } catch (error: any) {
      console.error('[LinkedIn Provider] Error:', error);
      return {
        provider: 'linkedin',
        ok: false,
        error_code: error.code || 'LINKEDIN_ERROR',
        error_message: error.message || 'Failed to publish to LinkedIn',
      };
    }
  },
};

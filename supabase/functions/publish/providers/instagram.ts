import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ProviderPublisher, PublishResult, MediaItem } from './index.ts';

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

async function createContainer(
  igUserId: string,
  imageUrl: string,
  caption: string,
  accessToken: string
): Promise<string> {
  const result = await graphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  return result.id;
}

async function waitUntilFinished(
  creationId: string,
  accessToken: string,
  timeoutMs = 120000,
  intervalMs = 2000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await graphGet(`/${creationId}?fields=status_code`, accessToken);
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') throw new Error('Container creation failed');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout waiting for container');
}

async function publishContainer(
  igUserId: string,
  creationId: string,
  accessToken: string
): Promise<string> {
  const result = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: accessToken,
  });
  return result.id;
}

async function getPostMeta(postId: string, accessToken: string) {
  return await graphGet(`/${postId}?fields=id,permalink`, accessToken);
}

export const instagramProvider: ProviderPublisher = {
  name: 'instagram',

  async publish({ userId, text, media }): Promise<PublishResult> {
    try {
      console.log('[Instagram Provider] Starting publish for user:', userId);

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get Instagram credentials from app_secrets
      const { data: secrets, error: secretsError } = await supabase
        .from('app_secrets')
        .select('ig_user_id, ig_page_access_token')
        .eq('user_id', userId)
        .single();

      if (secretsError || !secrets?.ig_page_access_token || !secrets?.ig_user_id) {
        console.error('[Instagram Provider] Missing credentials:', secretsError);
        return {
          provider: 'instagram',
          ok: false,
          error_code: 'MISSING_CREDENTIALS',
          error_message: 'Instagram not connected. Please connect your account.',
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

      const imageUrl = media[0].path;
      const caption = text;

      // Create container
      console.log('[Instagram Provider] Creating container...');
      const containerId = await createContainer(
        secrets.ig_user_id,
        imageUrl,
        caption,
        secrets.ig_page_access_token
      );

      // Wait for processing
      console.log('[Instagram Provider] Waiting for container to finish...');
      await waitUntilFinished(containerId, secrets.ig_page_access_token);

      // Publish
      console.log('[Instagram Provider] Publishing container...');
      const postId = await publishContainer(
        secrets.ig_user_id,
        containerId,
        secrets.ig_page_access_token
      );

      // Get permalink
      const postMeta = await getPostMeta(postId, secrets.ig_page_access_token);

      console.log('[Instagram Provider] Success:', postId);
      return {
        provider: 'instagram',
        ok: true,
        external_id: postId,
        permalink: postMeta.permalink,
      };
    } catch (error: any) {
      console.error('[Instagram Provider] Error:', error);
      return {
        provider: 'instagram',
        ok: false,
        error_code: error.code || 'INSTAGRAM_ERROR',
        error_message: error.message || 'Failed to publish to Instagram',
      };
    }
  },
};

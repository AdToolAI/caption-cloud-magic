import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  videoUrl: string;
  caption: string;
  hashtags?: string[];
  aspectRatio?: string; // e.g., "9:16", "1:1", "16:9"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pageId = Deno.env.get('IG_PAGE_ID');
    const accessToken = Deno.env.get('IG_PAGE_ACCESS_TOKEN');

    if (!pageId || !accessToken) {
      throw new Error('Instagram credentials not configured');
    }

    const { videoUrl, caption, hashtags, aspectRatio }: PublishRequest = await req.json();

    console.log('Publishing to Instagram:', { videoUrl, caption, aspectRatio });

    // Build caption with hashtags
    let fullCaption = caption;
    if (hashtags && hashtags.length > 0) {
      fullCaption += '\n\n' + hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    }

    // Step 1: Create media container
    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: videoUrl,
          caption: fullCaption,
          access_token: accessToken,
          share_to_feed: true,
        }),
      }
    );

    if (!containerResponse.ok) {
      const error = await containerResponse.text();
      console.error('Failed to create media container:', error);
      throw new Error(`Instagram API error: ${error}`);
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    console.log('Media container created:', containerId);

    // Step 2: Wait for container to be ready (poll status)
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isReady && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      const statusResponse = await fetch(
        `https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );

      const statusData = await statusResponse.json();
      console.log('Container status:', statusData);

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
      } else if (statusData.status_code === 'ERROR') {
        throw new Error('Instagram media processing failed');
      }

      attempts++;
    }

    if (!isReady) {
      throw new Error('Instagram media processing timeout');
    }

    // Step 3: Publish the media
    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      const error = await publishResponse.text();
      console.error('Failed to publish media:', error);
      throw new Error(`Instagram publish error: ${error}`);
    }

    const publishData = await publishResponse.json();

    console.log('Successfully published to Instagram:', publishData);

    return new Response(
      JSON.stringify({
        success: true,
        postId: publishData.id,
        message: 'Successfully published to Instagram'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Instagram publish error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

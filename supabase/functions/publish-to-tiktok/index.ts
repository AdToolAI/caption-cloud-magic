const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  videoUrl: string;
  caption: string;
  hashtags?: string[];
  privacyLevel?: 'PUBLIC' | 'PRIVATE' | 'FRIENDS';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('TIKTOK_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('TikTok credentials not configured');
    }

    const { videoUrl, caption, hashtags, privacyLevel = 'PUBLIC' }: PublishRequest = await req.json();

    console.log('Publishing to TikTok:', { videoUrl, caption, privacyLevel });

    // Build caption with hashtags
    let fullCaption = caption;
    if (hashtags && hashtags.length > 0) {
      fullCaption += ' ' + hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    }

    // Step 1: Initialize upload
    const initResponse = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: fullCaption.substring(0, 150), // TikTok max title length
            privacy_level: privacyLevel,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      console.error('Failed to initialize TikTok upload:', error);
      throw new Error(`TikTok API error: ${error}`);
    }

    const initData = await initResponse.json();

    if (initData.error?.code) {
      throw new Error(`TikTok error: ${initData.error.message}`);
    }

    console.log('Successfully initiated TikTok upload:', initData);

    return new Response(
      JSON.stringify({
        success: true,
        publishId: initData.data?.publish_id,
        message: 'Successfully initiated TikTok upload. Video will be published shortly.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('TikTok publish error:', error);
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

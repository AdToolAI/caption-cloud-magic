import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function uploadMedia(accessToken: string, mediaUrl: string, mediaType: string): Promise<string> {
  // Download media
  const mediaResponse = await fetch(mediaUrl);
  const mediaBlob = await mediaResponse.blob();
  const mediaBuffer = await mediaBlob.arrayBuffer();
  const mediaBase64 = btoa(String.fromCharCode(...new Uint8Array(mediaBuffer)));

  // Upload to Twitter (v1.1)
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
    console.error('Media upload error:', uploadData);
    throw new Error(uploadData.error || 'Media upload failed');
  }

  return uploadData.media_id_string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const { connectionId, text, media } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get connection
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('provider', 'x')
      .single();

    if (connectionError || !connection) {
      throw new Error('Connection not found');
    }

    const accessToken = await decryptToken(connection.access_token_hash);

    // Upload media if present
    let mediaIds: string[] = [];
    if (media && media.length > 0) {
      mediaIds = await Promise.all(
        media.map((m: any) => uploadMedia(accessToken, m.fileUrl, m.type))
      );
    }

    // Create tweet (v2)
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

    if (!tweetResponse.ok) {
      console.error('Tweet creation error:', tweetData);
      throw new Error(tweetData.detail || tweetData.title || 'Tweet creation failed');
    }

    return new Response(
      JSON.stringify({ success: true, tweet: tweetData.data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('X publish error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

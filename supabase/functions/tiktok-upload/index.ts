import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Parse multipart/form-data
    const formData = await req.formData();
    const videoFile = formData.get('video') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string || '';

    if (!videoFile || !title) {
      throw new Error('Video file and title are required');
    }

    console.log('TikTok upload started:', { title, fileSize: videoFile.size });

    // 2. Auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // 3. Get TikTok connection
    const { data: connection } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'tiktok')
      .maybeSingle();

    if (!connection) {
      throw new Error('TikTok account not connected');
    }

    const accessToken = atob(connection.access_token_hash);

    // 4. Step 1: Initialize upload
    const videoBytes = await videoFile.arrayBuffer();
    const chunkSize = videoBytes.byteLength;
    
    console.log('Initializing TikTok upload...');
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_info: {
          title,
          description,
          privacy_level: 'SELF_ONLY', // Draft mode
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: chunkSize,
          chunk_size: chunkSize,
          total_chunk_count: 1
        }
      })
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`TikTok upload init failed: ${errorText}`);
    }

    const initData = await initResponse.json();
    const { publish_id, upload_url } = initData.data;

    console.log('Upload initialized, uploading video...');
    // 5. Step 2: Upload video
    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${chunkSize - 1}/${chunkSize}`
      },
      body: videoBytes
    });

    if (!uploadResponse.ok) {
      throw new Error('Video upload failed');
    }

    console.log('Video uploaded successfully');

    // 6. Log upload in database
    await supabase
      .from('tiktok_uploads')
      .insert({
        user_id: user.id,
        video_title: title,
        video_description: description,
        tiktok_video_id: publish_id,
        status: 'draft_uploaded',
        file_size_bytes: chunkSize
      });

    return new Response(
      JSON.stringify({
        success: true,
        publishId: publish_id,
        status: 'draft_uploaded',
        message: 'Video uploaded as draft. You can now publish it via TikTok app.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('TikTok upload error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

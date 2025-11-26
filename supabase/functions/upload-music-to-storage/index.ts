import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { originalUrl, projectId } = await req.json();

    if (!originalUrl) {
      return new Response(
        JSON.stringify({ error: 'originalUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[upload-music-to-storage] Downloading from:', originalUrl);

    // Download audio from Jamendo
    const audioResponse = await fetch(originalUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBlob = await audioResponse.blob();
    const audioArrayBuffer = await audioBlob.arrayBuffer();
    const audioData = new Uint8Array(audioArrayBuffer);

    console.log('[upload-music-to-storage] Downloaded', audioData.length, 'bytes');

    // Generate filename
    const timestamp = Date.now();
    const filename = `${projectId || 'music'}-${timestamp}.mp3`;
    const storagePath = `background-music/${filename}`;

    console.log('[upload-music-to-storage] Uploading to:', storagePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('background-music')
      .upload(storagePath, audioData, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload-music-to-storage] Upload error:', uploadError);
      throw uploadError;
    }

    console.log('[upload-music-to-storage] Upload successful:', uploadData);

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('background-music')
      .getPublicUrl(storagePath);

    const storageUrl = publicUrlData.publicUrl;

    console.log('[upload-music-to-storage] Public URL:', storageUrl);

    return new Response(
      JSON.stringify({ storageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload-music-to-storage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

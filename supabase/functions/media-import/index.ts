import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
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

    const { url, type } = await req.json();

    if (!url || !type) {
      throw new Error('Missing url or type');
    }

    // Check storage quota
    const { data: storage, error: storageError } = await supabase
      .from('user_storage')
      .select('quota_mb, used_mb')
      .eq('user_id', user.id)
      .single();

    if (storageError && storageError.code !== 'PGRST116') {
      throw new Error('Failed to check storage quota');
    }

    const quotaMb = storage?.quota_mb || 2048;
    const usedMb = storage?.used_mb || 0;

    // Download file
    console.log(`[Import] Downloading from ${url}`);
    const downloadResponse = await fetch(url, {
      signal: AbortSignal.timeout(30000) // 30s timeout
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download file: ${downloadResponse.statusText}`);
    }

    const blob = await downloadResponse.blob();
    const sizeBytes = blob.size;
    const sizeMb = sizeBytes / (1024 * 1024);

    // Check if would exceed quota
    if (usedMb + sizeMb > quotaMb) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'QUOTA_EXCEEDED',
          message: `Speicherlimit erreicht. ${usedMb}/${quotaMb} MB genutzt.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload to storage
    const filename = `${Date.now()}_${Math.random()}.${type === 'video' ? 'mp4' : 'jpg'}`;
    const storagePath = `${user.id}/${filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media-assets')
      .upload(storagePath, blob, {
        contentType: blob.type,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Extract metadata (simplified - in production would use ffprobe for video)
    const width = 1920; // Default
    const height = 1080; // Default
    const duration = type === 'video' ? 60 : undefined;

    // Create media_assets entry
    const { data: asset, error: assetError } = await supabase
      .from('media_assets')
      .insert({
        user_id: user.id,
        source: 'url',
        original_url: url,
        storage_path: storagePath,
        type,
        mime: blob.type,
        size_bytes: sizeBytes,
        width,
        height,
        duration_sec: duration
      })
      .select()
      .single();

    if (assetError) {
      throw new Error(`Failed to create asset: ${assetError.message}`);
    }

    // Update storage usage
    await supabase
      .from('user_storage')
      .update({
        used_mb: usedMb + sizeMb,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    console.log(`[Import] User ${user.id} | ${sizeMb.toFixed(2)}MB | ${url}`);

    return new Response(
      JSON.stringify({
        ok: true,
        asset_id: asset.id,
        storage_path: storagePath,
        width,
        height,
        duration,
        size_bytes: sizeBytes
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

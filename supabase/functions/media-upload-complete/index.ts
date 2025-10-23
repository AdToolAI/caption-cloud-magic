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

    const { path, type, size, width, height, duration } = await req.json();

    if (!path || !type || !size) {
      throw new Error('Missing required fields: path, type, size');
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
    const sizeMb = size / (1024 * 1024);

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

    // Create media_assets entry
    const { data: asset, error: assetError } = await supabase
      .from('media_assets')
      .insert({
        user_id: user.id,
        source: 'upload',
        storage_path: path,
        type,
        mime: type === 'video' ? 'video/mp4' : 'image/jpeg',
        size_bytes: size,
        width: width || 1920,
        height: height || 1080,
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

    console.log(`[Upload Complete] User ${user.id} | ${sizeMb.toFixed(2)}MB | ${path}`);

    return new Response(
      JSON.stringify({
        ok: true,
        asset_id: asset.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upload complete error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

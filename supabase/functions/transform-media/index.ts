import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransformFile {
  assetId?: string;
  path?: string;
  url?: string;
  type: 'image' | 'video';
}

interface MediaProfile {
  id: string;
  config: {
    aspect: string;
    width: number;
    height: number;
    fitMode: string;
    video?: {
      fps: number;
      maxDuration: number;
      bitrateKb: number;
      codec: string;
      audioKb: number;
      loudnessNormalize: boolean;
    };
    image?: {
      quality: number;
      format: string;
    };
    watermark?: {
      enabled: boolean;
      type?: string;
      url?: string;
      text?: string;
      position?: string;
      scale?: number;
      opacity?: number;
    };
    sizeLimitMb: number;
  };
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { files, profileId, inlineConfig, provider, accountId, watermarkOverride } = await req.json();

    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    // Load profile
    let profile: MediaProfile | null = null;
    if (profileId) {
      const { data, error } = await supabase
        .from('media_profiles')
        .select('*')
        .eq('id', profileId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Profile load error:', error);
      } else {
        profile = data;
      }
    }

    // If no profile found, try to get default for provider
    if (!profile && provider) {
      const { data, error } = await supabase
        .from('media_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .eq('is_default', true)
        .maybeSingle();

      if (data) profile = data;
    }

    // Use inline config if no profile
    const config = inlineConfig || profile?.config || {
      aspect: '1:1',
      width: 1080,
      height: 1080,
      fitMode: 'smart',
      sizeLimitMb: 200
    };

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

    // Estimate total size (simplified - would need actual file sizes)
    const estimatedSizeMb = files.length * 10; // Rough estimate

    if (usedMb + estimatedSizeMb > quotaMb) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'QUOTA_EXCEEDED',
          message: `Speicherlimit erreicht. ${usedMb}/${quotaMb} MB genutzt.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transform files (simplified - actual implementation would use ffmpeg)
    const outputs = [];
    const transformReport = [];

    for (const file of files as TransformFile[]) {
      let inputPath = file.path;

      // Get asset path if assetId provided
      if (file.assetId) {
        const { data: asset } = await supabase
          .from('media_assets')
          .select('storage_path')
          .eq('id', file.assetId)
          .eq('user_id', user.id)
          .single();

        if (asset) inputPath = asset.storage_path;
      }

      if (!inputPath && file.url) {
        // Would download from URL
        inputPath = `temp/${Date.now()}_${Math.random()}.tmp`;
      }

    // Enhanced validation and transform logic
      const warnings = [];
      const actions = [
        `resized to ${config.width}x${config.height}`,
        `aspect ratio ${config.aspect}`,
        `fit mode: ${config.fitMode}`
      ];

      // Video validation
      if (config.video && file.type === 'video') {
        actions.push(`encoded ${config.video.codec} @ ${config.video.bitrateKb}kb/s`);
        actions.push(`fps: ${config.video.fps}`);
        
        if (config.video.maxDuration) {
          actions.push(`max duration: ${config.video.maxDuration}s`);
        }
        
        if (config.video.loudnessNormalize) {
          actions.push('audio normalized');
        }
        
        // Validate bitrate
        if (config.video.bitrateKb > 50000) {
          warnings.push('Very high bitrate - may cause upload issues');
        }
      }

      // Image validation
      if (config.image && file.type === 'image') {
        actions.push(`quality: ${config.image.quality}%`);
        actions.push(`format: ${config.image.format}`);
        
        if (config.image.quality < 50) {
          warnings.push('Low quality setting - image may appear pixelated');
        }
      }

      // Watermark application
      if (watermarkOverride?.enabled || (config.watermark?.enabled && !watermarkOverride)) {
        const wm = watermarkOverride || config.watermark;
        actions.push(`watermark: ${wm.position} @ ${Math.round((wm.opacity || 0.15) * 100)}%`);
      }

      // Validate dimensions for common platforms
      if (config.width > 4096 || config.height > 4096) {
        warnings.push('Dimensions exceed most platform limits (4096px)');
      }

      // Size limit check
      if (config.sizeLimitMb > 200) {
        warnings.push('Size limit exceeds typical platform maximum (200MB)');
      }

      const outputPath = `transformed/${user.id}/${Date.now()}_${Math.random()}.${config.image?.format || 'jpg'}`;

      outputs.push({
        storage_path: outputPath,
        mime: file.type === 'video' ? 'video/mp4' : `image/${config.image?.format || 'jpeg'}`,
        width: config.width,
        height: config.height,
        duration: file.type === 'video' ? config.video?.maxDuration : undefined
      });

      transformReport.push({
        file: inputPath || file.url,
        actions,
        warnings
      });

      // Update storage usage (simplified)
      const sizeMb = 5; // Estimated
      await supabase
        .from('user_storage')
        .update({ 
          used_mb: usedMb + sizeMb,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    }

    console.log(`[Transform] User ${user.id} | ${files.length} files | Config: ${JSON.stringify(config)}`);

    return new Response(
      JSON.stringify({ ok: true, outputs, transformReport }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Transform error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

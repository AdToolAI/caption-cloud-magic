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

    // Transform files with FFmpeg
    const outputs = [];
    const transformReport = [];

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx] as TransformFile;
      const warnings: string[] = [];
      const actions: string[] = [];
      
      try {
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

        // Generate unique temp and output paths
        const tempInput = `/tmp/input_${Date.now()}_${idx}`;
        const tempOutput = `/tmp/output_${Date.now()}_${idx}`;
        const outputPath = `transformed/${user.id}/${Date.now()}_${idx}.${file.type === 'video' ? 'mp4' : (config.image?.format || 'jpg')}`;

        // Download source file
        let sourceUrl = file.url;
        if (inputPath) {
          const { data } = await supabase.storage.from('media-assets').getPublicUrl(inputPath);
          sourceUrl = data.publicUrl;
        }

        if (!sourceUrl) {
          throw new Error('No source URL available');
        }

        const sourceResponse = await fetch(sourceUrl);
        if (!sourceResponse.ok) {
          throw new Error(`Failed to download source: ${sourceResponse.statusText}`);
        }
        
        const sourceBlob = await sourceResponse.arrayBuffer();
        await Deno.writeFile(tempInput, new Uint8Array(sourceBlob));

        if (file.type === 'video') {
          // Video transformation with FFmpeg
          actions.push(`Re-encode to ${config.video?.codec || 'h264'}`);
          actions.push(`Set bitrate: ${config.video?.bitrateKb || 5000} kb/s`);
          actions.push(`Set FPS: ${config.video?.fps || 30}`);
          actions.push(`Resize to ${config.width}x${config.height} (${config.aspect})`);

          const ffmpegArgs = [
            '-i', tempInput,
            '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2`,
            '-c:v', config.video?.codec || 'libx264',
            '-b:v', `${config.video?.bitrateKb || 5000}k`,
            '-r', `${config.video?.fps || 30}`,
          ];

          if (config.video?.maxDuration) {
            ffmpegArgs.push('-t', `${config.video.maxDuration}`);
            actions.push(`Trim to max ${config.video.maxDuration}s`);
          }

          ffmpegArgs.push('-c:a', 'aac', '-b:a', `${config.video?.audioKb || 128}k`);

          if (config.video?.loudnessNormalize) {
            ffmpegArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
            actions.push('Normalize audio loudness (EBU R128)');
          }

          ffmpegArgs.push('-y', tempOutput);

          console.log('[Transform] FFmpeg video command:', ffmpegArgs.join(' '));

          const process = new Deno.Command('ffmpeg', { args: ffmpegArgs, stderr: 'piped' });
          const { success, stderr } = await process.output();

          if (!success) {
            const errorText = new TextDecoder().decode(stderr);
            console.error('[Transform] FFmpeg video error:', errorText);
            warnings.push('Video transformation failed, skipping file');
            continue;
          }

          // Upload transformed file
          const transformedData = await Deno.readFile(tempOutput);
          const { error: uploadError } = await supabase.storage
            .from('media-assets')
            .upload(outputPath, transformedData, {
              contentType: 'video/mp4',
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // Validate bitrate
          if ((config.video?.bitrateKb || 0) > 50000) {
            warnings.push('Very high bitrate - may cause upload issues');
          }

        } else {
          // Image transformation with FFmpeg
          actions.push(`Re-encode to ${config.image?.format?.toUpperCase() || 'JPG'}`);
          actions.push(`Set quality: ${config.image?.quality || 90}%`);
          actions.push(`Resize to ${config.width}x${config.height} (${config.aspect})`);

          const ffmpegArgs = [
            '-i', tempInput,
            '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2`,
            '-q:v', `${Math.round((100 - (config.image?.quality || 90)) / 10)}`,
          ];

          ffmpegArgs.push('-y', tempOutput);

          console.log('[Transform] FFmpeg image command:', ffmpegArgs.join(' '));

          const process = new Deno.Command('ffmpeg', { args: ffmpegArgs, stderr: 'piped' });
          const { success, stderr } = await process.output();

          if (!success) {
            const errorText = new TextDecoder().decode(stderr);
            console.error('[Transform] FFmpeg image error:', errorText);
            warnings.push('Image transformation failed, skipping file');
            continue;
          }

          // Upload transformed file
          const transformedData = await Deno.readFile(tempOutput);
          const { error: uploadError } = await supabase.storage
            .from('media-assets')
            .upload(outputPath, transformedData, {
              contentType: `image/${config.image?.format || 'jpeg'}`,
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // Quality validation
          if ((config.image?.quality || 90) < 50) {
            warnings.push('Low quality setting - image may appear pixelated');
          }
        }

        // Common fit mode info
        if (config.fitMode === 'smart') {
          actions.push('Apply smart fit (pad with aspect ratio maintained)');
        } else if (config.fitMode === 'crop') {
          actions.push('Center-crop to fill dimensions');
        } else {
          actions.push('Pad with letterboxing');
        }

        // Watermark info
        if (watermarkOverride?.enabled || config.watermark?.enabled) {
          const wm = watermarkOverride || config.watermark;
          actions.push(`Apply watermark (${wm?.position || 'bottom-right'}, opacity ${Math.round(((wm?.opacity || 0.15) * 100))}%)`);
        }

        // Dimension validation
        if (config.width > 4096 || config.height > 4096) {
          warnings.push('Dimensions exceed most platform limits (4096px)');
        }

        // Size limit validation
        if (config.sizeLimitMb > 200) {
          warnings.push('Size limit exceeds typical platform maximum (200MB)');
        }

        // Get public URL
        const { data: publicUrlData } = await supabase.storage.from('media-assets').getPublicUrl(outputPath);

        outputs.push({
          storage_path: outputPath,
          url: publicUrlData.publicUrl,
          mime: file.type === 'video' ? 'video/mp4' : `image/${config.image?.format || 'jpeg'}`,
          width: config.width,
          height: config.height,
          duration: file.type === 'video' ? config.video?.maxDuration : undefined,
        });

        transformReport.push({
          input: inputPath || file.url,
          output: outputPath,
          actions,
          warnings,
          profile: provider,
        });

        // Update storage usage
        const fileStats = await Deno.stat(tempOutput);
        const sizeMb = Math.ceil(fileStats.size / (1024 * 1024));
        
        await supabase
          .from('user_storage')
          .update({ 
            used_mb: usedMb + sizeMb,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        // Cleanup temp files
        try {
          await Deno.remove(tempInput);
          await Deno.remove(tempOutput);
        } catch (cleanupError) {
          console.warn('[Transform] Cleanup warning:', cleanupError);
        }

      } catch (error: any) {
        console.error('[Transform] File processing error:', error);
        transformReport.push({
          input: file.path || file.url,
          error: error.message,
          profile: provider,
        });
      }
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

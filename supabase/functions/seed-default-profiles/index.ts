import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform presets definition
const PLATFORM_PRESETS: Record<string, Record<string, any>> = {
  instagram: {
    'feed-1-1': {
      name: 'Feed 1:1',
      config: {
        aspect: '1:1',
        width: 1080,
        height: 1080,
        fitMode: 'cover',
        sizeLimitMb: 30,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] },
        safeMargins: { top: 50, bottom: 50, left: 50, right: 50 }
      }
    },
    'feed-4-5': {
      name: 'Feed 4:5',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 30,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'story-9-16': {
      name: 'Story/Reel 9:16',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 100,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 90,
          minDurationSec: 3,
          targetFps: 30,
          targetBitrateMbps: 5,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 128
        },
        safeMargins: { top: 250, bottom: 250, left: 0, right: 0 }
      }
    }
  },
  tiktok: {
    'video-9-16': {
      name: 'TikTok Video 9:16',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 287,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 600,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 10,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 128
        },
        safeMargins: { top: 200, bottom: 300, left: 0, right: 0 }
      }
    }
  },
  youtube: {
    'short-9-16': {
      name: 'YouTube Short 9:16',
      config: {
        aspect: '9:16',
        width: 1080,
        height: 1920,
        fitMode: 'cover',
        sizeLimitMb: 256,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 60,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 8,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 192
        }
      }
    },
    'standard-16-9': {
      name: 'Standard Video 16:9',
      config: {
        aspect: '16:9',
        width: 1920,
        height: 1080,
        fitMode: 'cover',
        sizeLimitMb: 256,
        type: 'video',
        formats: { videoOut: ['mp4'] },
        video: {
          maxDurationSec: 43200,
          minDurationSec: 1,
          targetFps: 30,
          targetBitrateMbps: 10,
          codec: 'h264',
          audioCodec: 'aac',
          audioKbps: 192
        }
      }
    }
  },
  x: {
    'image-16-9': {
      name: 'Image 16:9',
      config: {
        aspect: '16:9',
        width: 1200,
        height: 675,
        fitMode: 'cover',
        sizeLimitMb: 5,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'image-4-5': {
      name: 'Image 4:5',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 5,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  },
  facebook: {
    'post-1-1': {
      name: 'Post 1:1',
      config: {
        aspect: '1:1',
        width: 1200,
        height: 1200,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'post-4-5': {
      name: 'Post 4:5',
      config: {
        aspect: '4:5',
        width: 1080,
        height: 1350,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  },
  linkedin: {
    'post-1-1': {
      name: 'Post 1:1',
      config: {
        aspect: '1:1',
        width: 1200,
        height: 1200,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    },
    'post-16-9': {
      name: 'Post 16:9',
      config: {
        aspect: '16:9',
        width: 1200,
        height: 675,
        fitMode: 'cover',
        sizeLimitMb: 10,
        type: 'image',
        formats: { imageOut: ['jpg', 'png'] }
      }
    }
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: 'workspace_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: existing } = await supabase
      .from('media_profiles')
      .select('id')
      .eq('workspace_id', workspace_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ message: 'Profiles already seeded', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profiles = [];
    for (const [platform, presets] of Object.entries(PLATFORM_PRESETS)) {
      let isFirst = true;
      for (const [_presetKey, preset] of Object.entries(presets)) {
        profiles.push({
          workspace_id,
          platform,
          type: preset.config.type,
          name: `${platform} - ${preset.name}`,
          config: preset.config,
          is_default: isFirst
        });
        isFirst = false;
      }
    }

    const { error: insertError } = await supabase
      .from('media_profiles')
      .insert(profiles);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ message: 'Default profiles seeded', count: profiles.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error seeding profiles:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

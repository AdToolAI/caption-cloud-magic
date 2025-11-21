import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[Cleanup] Starting scheduled cleanup...');

    const stats = {
      videos_deleted: 0,
      variants_deleted: 0,
      renders_archived: 0,
      storage_freed_mb: 0
    };

    // 1. Delete original videos older than 30 days (if optimized version exists)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: oldVideos } = await supabaseAdmin
      .from('video_creations')
      .select('id, output_video_url, user_id')
      .lt('created_at', thirtyDaysAgo.toISOString())
      .eq('status', 'completed');

    if (oldVideos) {
      for (const video of oldVideos) {
        // Check if optimized version exists
        const { data: variants } = await supabaseAdmin
          .from('video_variants')
          .select('id')
          .eq('video_creation_id', video.id)
          .limit(1);

        if (variants && variants.length > 0) {
          // Delete original from storage
          if (video.output_video_url) {
            const path = video.output_video_url.split('/').pop();
            if (path) {
              const { error: storageError } = await supabaseAdmin.storage
                .from('universal-videos')
                .remove([path]);

              if (!storageError) {
                stats.videos_deleted++;
                stats.storage_freed_mb += 10; // Estimate 10MB per original
              }
            }
          }

          // Update video record to remove original URL
          await supabaseAdmin
            .from('video_creations')
            .update({ output_video_url: null })
            .eq('id', video.id);
        }
      }
    }

    // 2. Delete unused variants older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: oldVariants } = await supabaseAdmin
      .from('video_variants')
      .select('*')
      .lt('created_at', ninetyDaysAgo.toISOString());

    if (oldVariants) {
      for (const variant of oldVariants) {
        // Delete from storage
        if (variant.file_url) {
          const path = variant.file_url.split('/').pop();
          if (path) {
            const { error: storageError } = await supabaseAdmin.storage
              .from('universal-videos')
              .remove([path]);

            if (!storageError) {
              stats.variants_deleted++;
              stats.storage_freed_mb += variant.file_size_mb || 5;
            }
          }
        }

        // Delete variant record
        await supabaseAdmin
          .from('video_variants')
          .delete()
          .eq('id', variant.id);
      }
    }

    // 3. Archive old render queue jobs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: oldJobs } = await supabaseAdmin
      .from('render_queue')
      .select('id')
      .lt('created_at', sevenDaysAgo.toISOString())
      .in('status', ['completed', 'failed']);

    if (oldJobs) {
      const { error: deleteError } = await supabaseAdmin
        .from('render_queue')
        .delete()
        .in('id', oldJobs.map(j => j.id));

      if (!deleteError) {
        stats.renders_archived = oldJobs.length;
      }
    }

    // 4. Update storage usage for all users
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id, storage_used_mb');

    if (users) {
      for (const user of users) {
        // Calculate actual storage usage
        const { data: userVideos } = await supabaseAdmin
          .from('video_creations')
          .select('id')
          .eq('user_id', user.id);

        const { data: userVariants } = await supabaseAdmin
          .from('video_variants')
          .select('file_size_mb')
          .in('video_creation_id', (userVideos || []).map(v => v.id));

        const totalUsageMb = (userVariants || []).reduce((sum, v) => sum + (v.file_size_mb || 0), 0);

        // Update profile
        await supabaseAdmin
          .from('profiles')
          .update({ storage_used_mb: Math.round(totalUsageMb) })
          .eq('id', user.id);
      }
    }

    console.log('[Cleanup] Completed:', stats);

    return new Response(JSON.stringify({
      ok: true,
      stats,
      message: `Cleanup completed: ${stats.videos_deleted} videos, ${stats.variants_deleted} variants, ${stats.renders_archived} renders archived, ${stats.storage_freed_mb.toFixed(2)} MB freed`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Cleanup failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

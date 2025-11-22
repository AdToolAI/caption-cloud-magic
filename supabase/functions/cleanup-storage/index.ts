import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🗑️ Starting storage cleanup job...');

    const stats = {
      deleted_drafts: 0,
      deleted_failed_renders: 0,
      deleted_archived_renders: 0,
      deleted_orphaned_files: 0,
      freed_mb: 0
    };

    // 1. Delete draft projects older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: oldDrafts, error: draftsError } = await supabase
      .from('content_projects')
      .select('id, user_id, file_size_mb')
      .eq('status', 'draft')
      .lt('updated_at', thirtyDaysAgo.toISOString());

    if (!draftsError && oldDrafts) {
      for (const draft of oldDrafts) {
        // Delete associated storage files
        const { data: files } = await supabase
          .from('storage_files')
          .select('bucket_name, file_path, file_size_mb')
          .eq('project_id', draft.id);

        if (files) {
          for (const file of files) {
            await supabase.storage
              .from(file.bucket_name)
              .remove([file.file_path]);
            
            stats.freed_mb += file.file_size_mb || 0;
          }

          // Delete storage_files records
          await supabase
            .from('storage_files')
            .delete()
            .eq('project_id', draft.id);
        }

        // Delete project
        await supabase
          .from('content_projects')
          .delete()
          .eq('id', draft.id);

        stats.deleted_drafts++;
        stats.freed_mb += draft.file_size_mb || 0;
      }
    }

    console.log(`✅ Deleted ${stats.deleted_drafts} old draft projects`);

    // 2. Delete failed renders older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: failedRenders, error: failedError } = await supabase
      .from('render_queue')
      .select('id, project_id')
      .eq('status', 'failed')
      .lt('created_at', sevenDaysAgo.toISOString());

    if (!failedError && failedRenders) {
      for (const render of failedRenders) {
        await supabase
          .from('render_queue')
          .delete()
          .eq('id', render.id);

        stats.deleted_failed_renders++;
      }
    }

    console.log(`✅ Deleted ${stats.deleted_failed_renders} failed renders`);

    // 3. Delete archived renders older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: archivedProjects, error: archivedError } = await supabase
      .from('content_projects')
      .select('id, user_id, file_size_mb')
      .eq('status', 'archived')
      .lt('updated_at', ninetyDaysAgo.toISOString());

    if (!archivedError && archivedProjects) {
      for (const project of archivedProjects) {
        // Delete associated files
        const { data: files } = await supabase
          .from('storage_files')
          .select('bucket_name, file_path, file_size_mb')
          .eq('project_id', project.id);

        if (files) {
          for (const file of files) {
            await supabase.storage
              .from(file.bucket_name)
              .remove([file.file_path]);
            
            stats.freed_mb += file.file_size_mb || 0;
          }

          await supabase
            .from('storage_files')
            .delete()
            .eq('project_id', project.id);
        }

        await supabase
          .from('content_projects')
          .delete()
          .eq('id', project.id);

        stats.deleted_archived_renders++;
        stats.freed_mb += project.file_size_mb || 0;
      }
    }

    console.log(`✅ Deleted ${stats.deleted_archived_renders} archived renders`);

    // 4. Find orphaned files (files without project references)
    const { data: orphanedFiles, error: orphanedError } = await supabase
      .from('storage_files')
      .select('id, bucket_name, file_path, file_size_mb, user_id, project_id')
      .not('project_id', 'is', null);

    if (!orphanedError && orphanedFiles) {
      for (const file of orphanedFiles) {
        // Check if project still exists
        const { data: project } = await supabase
          .from('content_projects')
          .select('id')
          .eq('id', file.project_id)
          .single();

        if (!project) {
          // Project doesn't exist, delete file
          await supabase.storage
            .from(file.bucket_name)
            .remove([file.file_path]);

          await supabase
            .from('storage_files')
            .delete()
            .eq('id', file.id);

          stats.deleted_orphaned_files++;
          stats.freed_mb += file.file_size_mb || 0;
        }
      }
    }

    console.log(`✅ Deleted ${stats.deleted_orphaned_files} orphaned files`);

    // 5. Recalculate storage for all affected users
    console.log('📊 Recalculating storage usage...');
    
    const { error: recalcError } = await supabase.functions.invoke('calculate-storage-usage', {
      body: { user_id: null } // Calculate for all users
    });

    if (recalcError) {
      console.error('Error recalculating storage:', recalcError);
    }

    console.log(`✅ Cleanup complete! Freed ${stats.freed_mb.toFixed(2)}MB`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          ...stats,
          freed_mb: Math.round(stats.freed_mb * 100) / 100
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in cleanup job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

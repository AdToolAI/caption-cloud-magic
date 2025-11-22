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

    const { user_id } = await req.json();

    console.log(`📊 Calculating storage usage for user: ${user_id || 'all users'}`);

    // If specific user, calculate only for that user
    if (user_id) {
      const { data: files, error: filesError } = await supabase
        .from('storage_files')
        .select('file_size_mb')
        .eq('user_id', user_id);

      if (filesError) throw filesError;

      const totalUsedMb = files.reduce((sum, file) => sum + (file.file_size_mb || 0), 0);

      // Update user quota
      const { error: updateError } = await supabase
        .from('user_storage_quotas')
        .upsert({
          user_id,
          used_mb: Math.round(totalUsedMb),
          last_calculated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (updateError) throw updateError;

      // Get quota info
      const { data: quota } = await supabase
        .from('user_storage_quotas')
        .select('*')
        .eq('user_id', user_id)
        .single();

      const usagePercent = quota ? (quota.used_mb / quota.quota_mb) * 100 : 0;

      // Check for warnings
      let warning = null;
      if (usagePercent >= 100) {
        warning = 'QUOTA_EXCEEDED';
      } else if (usagePercent >= 90) {
        warning = 'QUOTA_90_PERCENT';
      } else if (usagePercent >= 80) {
        warning = 'QUOTA_80_PERCENT';
      }

      console.log(`✅ User ${user_id}: ${totalUsedMb.toFixed(2)}MB used (${usagePercent.toFixed(1)}%)`);

      return new Response(
        JSON.stringify({
          success: true,
          user_id,
          used_mb: Math.round(totalUsedMb),
          quota_mb: quota?.quota_mb || 0,
          usage_percent: Math.round(usagePercent),
          warning
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate for all users
    const { data: allUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id');

    if (usersError) throw usersError;

    let processedCount = 0;
    const warnings: Array<{ user_id: string; warning: string; usage_percent: number }> = [];

    for (const user of allUsers) {
      const { data: files } = await supabase
        .from('storage_files')
        .select('file_size_mb')
        .eq('user_id', user.id);

      const totalUsedMb = files?.reduce((sum, file) => sum + (file.file_size_mb || 0), 0) || 0;

      await supabase
        .from('user_storage_quotas')
        .upsert({
          user_id: user.id,
          used_mb: Math.round(totalUsedMb),
          last_calculated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      const { data: quota } = await supabase
        .from('user_storage_quotas')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const usagePercent = quota ? (quota.used_mb / quota.quota_mb) * 100 : 0;

      if (usagePercent >= 80) {
        warnings.push({
          user_id: user.id,
          warning: usagePercent >= 100 ? 'EXCEEDED' : usagePercent >= 90 ? '90%' : '80%',
          usage_percent: Math.round(usagePercent)
        });
      }

      processedCount++;
    }

    console.log(`✅ Calculated storage for ${processedCount} users, ${warnings.length} warnings`);

    return new Response(
      JSON.stringify({
        success: true,
        processed_users: processedCount,
        warnings_count: warnings.length,
        warnings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error calculating storage:', error);
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

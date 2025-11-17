import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestJobConfig {
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input_data: Record<string, any>;
  result_data?: Record<string, any>;
  error_message?: string;
  retry_count: number;
  created_at: string;
  completed_at?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = await req.json();

    if (action === 'delete') {
      // Delete all test jobs for this user
      const { error: deleteError } = await supabaseClient
        .from('ai_jobs')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw deleteError;
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'All test jobs deleted'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'count') {
      // Get current job counts
      const { data: jobs, error: countError } = await supabaseClient
        .from('ai_jobs')
        .select('status')
        .eq('user_id', user.id);

      if (countError) {
        console.error('Count error:', countError);
        throw countError;
      }

      const counts = {
        pending: jobs?.filter(j => j.status === 'pending').length || 0,
        processing: jobs?.filter(j => j.status === 'processing').length || 0,
        completed: jobs?.filter(j => j.status === 'completed').length || 0,
        failed: jobs?.filter(j => j.status === 'failed').length || 0,
      };

      return new Response(
        JSON.stringify({ counts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create test jobs
    const now = new Date();
    const testJobs: TestJobConfig[] = [];

    // Pending jobs (2-3)
    const pendingCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pendingCount; i++) {
      testJobs.push({
        job_type: ['campaign', 'caption', 'hooks', 'carousel'][Math.floor(Math.random() * 4)],
        status: 'pending',
        input_data: {
          topic: `Test Topic ${i + 1}`,
          platform: ['instagram', 'facebook', 'tiktok'][Math.floor(Math.random() * 3)],
          style: 'professional',
          count: 5
        },
        retry_count: 0,
        created_at: new Date(now.getTime() - Math.random() * 300000).toISOString()
      });
    }

    // Processing jobs (1-2)
    const processingCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < processingCount; i++) {
      testJobs.push({
        job_type: ['campaign', 'reel_script', 'hooks'][Math.floor(Math.random() * 3)],
        status: 'processing',
        input_data: {
          topic: `Processing Topic ${i + 1}`,
          platform: 'instagram',
          duration: 30
        },
        retry_count: 0,
        created_at: new Date(now.getTime() - Math.random() * 600000).toISOString()
      });
    }

    // Completed jobs (5-10 from today)
    const completedCount = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < completedCount; i++) {
      const createdAt = new Date(now.getTime() - Math.random() * 86400000); // Within last 24h
      const completedAt = new Date(createdAt.getTime() + 30000 + Math.random() * 300000);
      testJobs.push({
        job_type: ['campaign', 'caption', 'hooks', 'carousel', 'reel_script'][Math.floor(Math.random() * 5)],
        status: 'completed',
        input_data: {
          topic: `Completed Topic ${i + 1}`,
          platform: 'instagram'
        },
        result_data: {
          posts_count: 5 + Math.floor(Math.random() * 10),
          success: true
        },
        retry_count: 0,
        created_at: createdAt.toISOString(),
        completed_at: completedAt.toISOString()
      });
    }

    // Failed jobs (1-2)
    const failedCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < failedCount; i++) {
      const createdAt = new Date(now.getTime() - Math.random() * 86400000);
      const completedAt = new Date(createdAt.getTime() + 10000 + Math.random() * 50000);
      testJobs.push({
        job_type: ['campaign', 'caption'][Math.floor(Math.random() * 2)],
        status: 'failed',
        input_data: {
          topic: `Failed Topic ${i + 1}`,
          platform: 'instagram'
        },
        error_message: 'API rate limit exceeded',
        retry_count: 3,
        created_at: createdAt.toISOString(),
        completed_at: completedAt.toISOString()
      });
    }

    // Insert all jobs
    const jobsToInsert = testJobs.map(job => ({
      user_id: user.id,
      ...job
    }));

    const { data: insertedJobs, error: insertError } = await supabaseClient
      .from('ai_jobs')
      .insert(jobsToInsert)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    console.log(`Created ${insertedJobs.length} test jobs for user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        jobs_created: insertedJobs.length,
        breakdown: {
          pending: pendingCount,
          processing: processingCount,
          completed: completedCount,
          failed: failedCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in create-test-jobs:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchVideoRequest {
  template_id: string;
  job_name: string;
  csv_data: Array<Record<string, any>>; // Array of row objects from CSV
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

    const { template_id, job_name, csv_data }: BatchVideoRequest = await req.json();

    if (!template_id || !csv_data || csv_data.length === 0) {
      throw new Error('Missing required fields: template_id, csv_data');
    }

    console.log('[Batch] Starting batch job:', {
      template_id,
      job_name,
      video_count: csv_data.length,
      user_id: user.id
    });

    // Validate template exists
    const { data: template, error: templateError } = await supabase
      .from('video_templates')
      .select('id, name, customizable_fields')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Validate CSV data has required fields
    const requiredFields = template.customizable_fields
      .filter((f: any) => f.required)
      .map((f: any) => f.key);

    const missingFields: string[] = [];
    csv_data.forEach((row, index) => {
      requiredFields.forEach((field: string) => {
        if (!row[field]) {
          missingFields.push(`Row ${index + 1}: missing ${field}`);
        }
      });
    });

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'VALIDATION_ERROR',
          message: 'Some rows have missing required fields',
          details: missingFields.slice(0, 10) // First 10 errors
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user credits (50 per video)
    const totalCost = csv_data.length * 50;
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < totalCost) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'INSUFFICIENT_CREDITS',
          message: `Du brauchst ${totalCost} Credits für ${csv_data.length} Videos (du hast ${wallet?.balance || 0})`
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create batch job
    const { data: batchJob, error: batchError } = await supabase
      .from('batch_jobs')
      .insert({
        user_id: user.id,
        template_id,
        job_name,
        total_videos: csv_data.length,
        csv_data,
        status: 'pending'
      })
      .select()
      .single();

    if (batchError) {
      console.error('[Batch] Error creating batch job:', batchError);
      throw new Error('Failed to create batch job');
    }

    console.log('[Batch] Batch job created:', batchJob.id);

    // Create individual video_creations for each CSV row
    const creationIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < csv_data.length; i++) {
      const row = csv_data[i];
      try {
        // Create video_creation record
        const { data: creation, error: creationError } = await supabase
          .from('video_creations')
          .insert({
            user_id: user.id,
            template_id,
            customizations: row,
            status: 'pending',
            batch_job_id: batchJob.id
          })
          .select()
          .single();

        if (creationError) throw creationError;
        creationIds.push(creation.id);

        // Invoke create-video-from-template for each video
        const renderResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-video-from-template`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              template_id,
              customizations: row
            })
          }
        );

        if (!renderResponse.ok) {
          const errorText = await renderResponse.text();
          console.error(`[Batch] Video ${i + 1} failed:`, errorText);
          errors.push({ index: i, error: errorText });
          
          // Update video_creation status to failed
          await supabase
            .from('video_creations')
            .update({ status: 'failed', error_message: errorText })
            .eq('id', creation.id);
        }
      } catch (error) {
        console.error(`[Batch] Error creating video ${i + 1}:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ index: i, error: errorMsg });
      }
    }

    // Update batch job status
    await supabase
      .from('batch_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        error_log: errors,
        failed_videos: errors.length
      })
      .eq('id', batchJob.id);

    // Deduct credits
    await supabase
      .from('wallets')
      .update({
        balance: wallet.balance - totalCost,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    console.log(`[Batch] Job ${batchJob.id}: ${creationIds.length}/${csv_data.length} videos queued`);

    return new Response(
      JSON.stringify({
        ok: true,
        batch_job_id: batchJob.id,
        creation_ids: creationIds,
        total_cost: totalCost,
        queued_videos: creationIds.length,
        failed_videos: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined // First 5 errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Batch] Error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

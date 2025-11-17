import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchVideoRequest {
  template_id: string;
  batch_data: Array<Record<string, string | number>>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { template_id, batch_data }: BatchVideoRequest = await req.json();

    if (!template_id || !batch_data || !Array.isArray(batch_data)) {
      throw new Error('Invalid request: template_id and batch_data array required');
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('video_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Check user credits (batch cost = 50 * number of videos)
    const totalCost = 50 * batch_data.length;
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
          message: `Batch benötigt ${totalCost} Credits, verfügbar: ${wallet?.balance || 0}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const creationIds: string[] = [];

    // Create video creation records for each item
    for (const customizations of batch_data) {
      const { data: creation, error: creationError } = await supabase
        .from('video_creations')
        .insert({
          user_id: user.id,
          template_id,
          customizations,
          status: 'pending'
        })
        .select()
        .single();

      if (creationError || !creation) {
        console.error('Failed to create video:', creationError);
        continue;
      }

      creationIds.push(creation.id);

      // Call create-video-from-template for each
      const { error: renderError } = await supabase.functions.invoke('create-video-from-template', {
        body: {
          template_id,
          customizations
        }
      });

      if (renderError) {
        console.error('Render error:', renderError);
      }
    }

    // Deduct total credits
    await supabase
      .from('wallets')
      .update({ balance: wallet.balance - totalCost })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        ok: true,
        creation_ids: creationIds,
        total_cost: totalCost
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Batch creation error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

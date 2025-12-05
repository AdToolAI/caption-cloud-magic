import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SORA_MODELS = {
  'sora-2-standard': '96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331',
  'sora-2-pro': '4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f',
};

const CREDITS_PER_SECOND = { 'sora-2-standard': 25, 'sora-2-pro': 53 };
const DELAY_BETWEEN_SCENES_MS = 12000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const { projectId, model, aspectRatio, sceneIds } = await req.json();
    if (!projectId || !model || !aspectRatio) throw new Error('Missing required fields');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    let query = supabaseAdmin.from('sora_long_form_scenes').select('*').eq('project_id', projectId).in('status', ['pending', 'failed']).order('scene_order');
    if (sceneIds?.length) query = query.in('id', sceneIds);

    const { data: scenes, error: fetchError } = await query;
    if (fetchError) throw new Error(`Failed to fetch scenes: ${fetchError.message}`);
    if (!scenes?.length) return new Response(JSON.stringify({ success: true, message: 'No scenes', started: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 8), 0);
    const creditsPerSecond = CREDITS_PER_SECOND[model as keyof typeof CREDITS_PER_SECOND] || 25;
    const totalCreditsNeeded = totalDuration * creditsPerSecond;
    const featureCode = model === 'sora-2-pro' ? 'sora_longform_pro' : 'sora_longform_standard';

    console.log(`📊 Credits: ${totalDuration}s × ${creditsPerSecond} = ${totalCreditsNeeded}`);

    const { data: reservationData, error: reservationError } = await supabaseClient.functions.invoke('credit-reserve', {
      body: { feature_code: featureCode, estimated_cost: totalCreditsNeeded, metadata: { project_id: projectId, model, total_duration: totalDuration } }
    });

    if (reservationError || !reservationData?.success) {
      return new Response(JSON.stringify({ error: reservationData?.error || 'Nicht genügend Credits', code: 'INSUFFICIENT_CREDITS', required_credits: totalCreditsNeeded }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const reservationId = reservationData.reservation_id;
    console.log(`✅ Reserved: ${reservationData.reserved_amount} (ID: ${reservationId})`);

    await supabaseAdmin.from('sora_long_form_projects').update({ status: 'generating' }).eq('id', projectId);

    const webhookUrl = `${SUPABASE_URL}/functions/v1/sora-scene-webhook`;
    const results: any[] = [];
    let failedDuration = 0, successCount = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (i > 0) { console.log(`⏳ Waiting 12s...`); await delay(DELAY_BETWEEN_SCENES_MS); }

      let retryCount = 0, success = false;
      while (!success && retryCount < 3) {
        try {
          const input: any = { prompt: scene.prompt, seconds: scene.duration || 8, aspect_ratio: aspectRatio === '9:16' ? 'portrait' : aspectRatio === '1:1' ? 'square' : 'landscape' };
          if (scene.reference_image_url) input.input_reference = scene.reference_image_url;

          const prediction = await replicate.predictions.create({ version: SORA_MODELS[model as keyof typeof SORA_MODELS], input, webhook: webhookUrl, webhook_events_filter: ['completed', 'failed'] });
          await supabaseAdmin.from('sora_long_form_scenes').update({ status: 'generating', replicate_prediction_id: prediction.id }).eq('id', scene.id);
          results.push({ sceneId: scene.id, status: 'started', predictionId: prediction.id });
          successCount++; success = true;
          console.log(`✅ Scene ${scene.scene_order}: ${prediction.id}`);
        } catch (error: any) {
          retryCount++;
          if (error?.response?.status === 429 || error?.message?.includes('429')) { await delay(60000); continue; }
          if (retryCount >= 3) {
            await supabaseAdmin.from('sora_long_form_scenes').update({ status: 'failed' }).eq('id', scene.id);
            results.push({ sceneId: scene.id, status: 'failed', error: error?.message });
            failedDuration += (scene.duration || 8);
          }
        }
      }
    }

    const actualCredits = (totalDuration - failedDuration) * creditsPerSecond;
    if (failedDuration > 0 && successCount === 0) {
      await supabaseClient.functions.invoke('credit-refund', { body: { reservation_id: reservationId, reason: 'All scenes failed' } });
      await supabaseAdmin.from('sora_long_form_projects').update({ status: 'failed' }).eq('id', projectId);
    } else {
      await supabaseClient.functions.invoke('credit-commit', { body: { reservation_id: reservationId, actual_cost: actualCredits } });
    }

    return new Response(JSON.stringify({ success: true, started: successCount, failed: scenes.length - successCount, total_credits_used: actualCredits, credits_refunded: failedDuration * creditsPerSecond, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

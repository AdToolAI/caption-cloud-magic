import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sora 2 Model Version IDs
const SORA_MODELS = {
  'sora-2-standard': '96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331',
  'sora-2-pro': '4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f',
};

// Pricing per second (same as AI Video Studio)
const MODEL_PRICING: Record<string, Record<string, number>> = {
  'sora-2-standard': { EUR: 0.25, USD: 0.25 },
  'sora-2-pro': { EUR: 0.53, USD: 0.53 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const { projectId, model, aspectRatio } = await req.json();
    if (!projectId || !model || !aspectRatio) throw new Error('Missing required fields');

    console.log(`[Chain] Starting chain generation for project ${projectId}`);

    // Get all pending/failed scenes ordered by scene_order
    const { data: scenes, error: fetchError } = await supabaseAdmin
      .from('sora_long_form_scenes')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['pending', 'failed'])
      .order('scene_order');

    if (fetchError) throw new Error(`Failed to fetch scenes: ${fetchError.message}`);
    if (!scenes?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No scenes to generate', started: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Calculate total cost
    const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 8), 0);
    
    // Get user's AI Video Wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.log('[Chain] No AI Video wallet found for user', user.id);
      return new Response(JSON.stringify({ 
        error: 'Kein AI Video Guthaben gefunden. Bitte kaufe zuerst Credits.',
        code: 'NO_WALLET',
        needsPurchase: true 
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const currency = wallet.currency || 'EUR';
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['sora-2-standard'];
    const costPerSecond = pricing[currency] || pricing['EUR'];
    const totalCost = totalDuration * costPerSecond;
    const currencySymbol = currency === 'USD' ? '$' : '€';

    console.log(`[Chain] Cost: ${totalDuration}s × ${currencySymbol}${costPerSecond} = ${currencySymbol}${totalCost.toFixed(2)}`);

    // Check balance
    if (wallet.balance_euros < totalCost) {
      console.log(`[Chain] Insufficient credits: need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);
      return new Response(JSON.stringify({ 
        error: `Nicht genügend Guthaben. Benötigt: ${currencySymbol}${totalCost.toFixed(2)}, Vorhanden: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
        code: 'INSUFFICIENT_CREDITS',
        needsPurchase: true,
        required: totalCost,
        available: wallet.balance_euros,
        currency
      }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Deduct total cost upfront
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc('deduct_ai_video_credits', {
      p_user_id: user.id,
      p_amount: totalCost,
      p_generation_id: projectId
    });

    if (deductError || newBalance === null) {
      console.error('[Chain] Failed to deduct credits:', deductError);
      throw new Error('Fehler beim Abbuchen der Credits');
    }

    console.log(`[Chain] Deducted ${currencySymbol}${totalCost.toFixed(2)}. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Update project status and store chain metadata
    const sceneIds = scenes.map(s => s.id);
    await supabaseAdmin.from('sora_long_form_projects').update({ 
      status: 'generating',
      // Store chain info in script field as JSON (temporary, can add dedicated columns later)
    }).eq('id', projectId);

    // Start ONLY the first scene
    const firstScene = scenes[0];
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const webhookUrl = `${SUPABASE_URL}/functions/v1/sora-chain-webhook`;

    const replicateAspectRatio = aspectRatio === '9:16' ? 'portrait' : aspectRatio === '1:1' ? 'square' : 'landscape';
    
    const input: Record<string, any> = {
      prompt: firstScene.prompt,
      duration: firstScene.duration || 8,
      aspect_ratio: replicateAspectRatio,
    };

    // Use reference image if provided for first scene (Image-to-Video)
    if (firstScene.reference_image_url) {
      input.image_url = firstScene.reference_image_url;
      console.log(`[Chain] 🖼️ Scene 1 using I2V with reference: ${firstScene.reference_image_url}`);
    } else {
      console.log(`[Chain] 📝 Scene 1 using T2V (no reference image)`);
    }

    console.log(`[Chain] Starting Scene 1/${scenes.length}: ${firstScene.prompt.substring(0, 50)}...`);

    try {
      const prediction = await replicate.predictions.create({
        version: SORA_MODELS[model as keyof typeof SORA_MODELS],
        input,
        webhook: webhookUrl,
        webhook_events_filter: ['completed']
      });

      // Update first scene status
      await supabaseAdmin.from('sora_long_form_scenes').update({
        status: 'generating',
        replicate_prediction_id: prediction.id,
      }).eq('id', firstScene.id);

      // Store remaining scene IDs for chain continuation
      const remainingSceneIds = sceneIds.slice(1);
      
      // Store chain metadata in a way the webhook can access
      // We'll use the project's script field temporarily
      await supabaseAdmin.from('sora_long_form_projects').update({
        script: JSON.stringify({
          chain_active: true,
          remaining_scene_ids: remainingSceneIds,
          model,
          aspect_ratio: aspectRatio,
          cost_per_second: costPerSecond,
          currency,
          user_id: user.id,
        })
      }).eq('id', projectId);

      console.log(`[Chain] ✅ Scene 1 started: ${prediction.id}`);
      console.log(`[Chain] Remaining scenes: ${remainingSceneIds.length}`);

      return new Response(JSON.stringify({
        success: true,
        started: 1,
        total: scenes.length,
        cost: totalCost,
        currency,
        newBalance,
        message: `Szene 1/${scenes.length} wird generiert. Weitere Szenen folgen automatisch.`,
        predictionId: prediction.id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (replicateError: any) {
      console.error('[Chain] Replicate error:', replicateError);

      // Refund all credits on first scene failure
      await supabaseAdmin.rpc('refund_ai_video_credits', {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: projectId
      });

      await supabaseAdmin.from('sora_long_form_projects').update({ status: 'failed' }).eq('id', projectId);
      await supabaseAdmin.from('sora_long_form_scenes').update({ status: 'failed' }).eq('id', firstScene.id);

      if (replicateError?.response?.status === 502) {
        return new Response(JSON.stringify({
          error: 'Sora 2 ist aktuell nicht verfügbar. Deine Credits wurden zurückerstattet.',
          code: 'SERVICE_UNAVAILABLE'
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      throw replicateError;
    }

  } catch (error) {
    console.error('[Chain] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

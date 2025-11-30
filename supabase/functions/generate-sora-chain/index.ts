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

// Helper to extract last frame from a video using Replicate
async function extractLastFrame(
  videoUrl: string, 
  replicate: Replicate, 
  supabase: any, 
  projectId: string, 
  sceneOrder: number
): Promise<string | null> {
  try {
    console.log(`[Chain] 🎬 Extracting last frame from scene ${sceneOrder}: ${videoUrl}`);
    
    const output = await replicate.run(
      "fofr/video-splitter:c5c86fe2dfe3f2acf2ed8ac42ae0b7ec9a7ad011e5e20ef252a0e478c36cab34",
      {
        input: {
          video: videoUrl,
          output_type: "jpg",
          extract_last_frame: true,
        }
      }
    );
    
    if (!output || (Array.isArray(output) && output.length === 0)) {
      console.error(`[Chain] ⚠️ No frame extracted from scene ${sceneOrder}`);
      return null;
    }
    
    const frameUrl = Array.isArray(output) ? output[output.length - 1] : output;
    console.log(`[Chain] ✅ Frame extracted from scene ${sceneOrder}: ${frameUrl}`);
    
    // Try to upload to Supabase Storage for persistence
    try {
      const frameResponse = await fetch(frameUrl);
      const frameBlob = await frameResponse.blob();
      const frameBuffer = await frameBlob.arrayBuffer();
      const fileName = `${projectId}/scene-${sceneOrder}-frame.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('sora-frames')
        .upload(fileName, frameBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });
        
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('sora-frames')
          .getPublicUrl(fileName);
        console.log(`[Chain] ✅ Frame stored in Supabase: ${publicUrl}`);
        return publicUrl;
      } else {
        console.warn(`[Chain] ⚠️ Storage upload failed, using Replicate URL:`, uploadError);
      }
    } catch (storageError) {
      console.warn(`[Chain] ⚠️ Storage upload failed, using Replicate URL:`, storageError);
    }
    
    return frameUrl;
  } catch (error) {
    console.error(`[Chain] ❌ Frame extraction failed for scene ${sceneOrder}:`, error);
    return null;
  }
}

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

    // Get ALL scenes ordered by scene_order (not just pending/failed)
    const { data: allScenes, error: fetchError } = await supabaseAdmin
      .from('sora_long_form_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_order');

    if (fetchError) throw new Error(`Failed to fetch scenes: ${fetchError.message}`);
    if (!allScenes?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No scenes found', started: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Filter to pending/failed scenes only
    const scenesToGenerate = allScenes.filter(s => s.status === 'pending' || s.status === 'failed');
    
    if (scenesToGenerate.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Alle Szenen bereits fertig', started: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Calculate total cost for REMAINING scenes only
    const totalDuration = scenesToGenerate.reduce((sum, s) => sum + (s.duration || 8), 0);
    
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

    console.log(`[Chain] Cost for ${scenesToGenerate.length} remaining scenes: ${totalDuration}s × ${currencySymbol}${costPerSecond} = ${currencySymbol}${totalCost.toFixed(2)}`);

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

    // Update project status
    await supabaseAdmin.from('sora_long_form_projects').update({ 
      status: 'generating',
    }).eq('id', projectId);

    // Get the first scene to generate
    const firstSceneToGenerate = scenesToGenerate[0];
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const webhookUrl = `${SUPABASE_URL}/functions/v1/sora-chain-webhook`;

    const replicateAspectRatio = aspectRatio === '9:16' ? 'portrait' : aspectRatio === '1:1' ? 'square' : 'landscape';
    
    const input: Record<string, any> = {
      prompt: firstSceneToGenerate.prompt,
      duration: firstSceneToGenerate.duration || 8,
      aspect_ratio: replicateAspectRatio,
    };

    // 🖼️ INTELLIGENT RESUME: Find frame reference from previous completed scene
    let referenceImageUrl: string | null = null;
    
    if (firstSceneToGenerate.scene_order > 0) {
      // Find the previous completed scene
      const previousCompletedScene = allScenes.find(s => 
        s.scene_order === firstSceneToGenerate.scene_order - 1 && 
        s.status === 'completed' &&
        s.generated_video_url
      );
      
      if (previousCompletedScene) {
        console.log(`[Chain] 🔄 Resume mode: Extracting frame from completed Scene ${previousCompletedScene.scene_order}`);
        referenceImageUrl = await extractLastFrame(
          previousCompletedScene.generated_video_url,
          replicate,
          supabaseAdmin,
          projectId,
          previousCompletedScene.scene_order
        );
      } else {
        console.log(`[Chain] ⚠️ No previous completed scene found for resume`);
      }
    } else if (firstSceneToGenerate.reference_image_url) {
      // Scene 1 with user-provided reference image
      referenceImageUrl = firstSceneToGenerate.reference_image_url;
      console.log(`[Chain] 🖼️ Scene 1 using user-provided reference: ${referenceImageUrl}`);
    }

    // Apply reference image if available
    if (referenceImageUrl) {
      input.image_url = referenceImageUrl;
      console.log(`[Chain] 🖼️ Scene ${firstSceneToGenerate.scene_order} using I2V with reference`);
    } else {
      console.log(`[Chain] 📝 Scene ${firstSceneToGenerate.scene_order} using T2V (no reference image)`);
    }

    console.log(`[Chain] Starting Scene ${firstSceneToGenerate.scene_order}/${allScenes.length}: ${firstSceneToGenerate.prompt.substring(0, 50)}...`);

    try {
      const prediction = await replicate.predictions.create({
        version: SORA_MODELS[model as keyof typeof SORA_MODELS],
        input,
        webhook: webhookUrl,
        webhook_events_filter: ['completed']
      });

      // SOFORT nach prediction speichern (vor weiteren Operationen)
      const { error: updateError } = await supabaseAdmin.from('sora_long_form_scenes').update({
        status: 'generating',
        replicate_prediction_id: prediction.id,
      }).eq('id', firstSceneToGenerate.id);
      
      if (updateError) {
        console.error('[Chain] Failed to save prediction_id:', updateError);
      } else {
        console.log(`[Chain] ✅ Saved prediction_id ${prediction.id} to scene ${firstSceneToGenerate.id}`);
      }

      // Store remaining scene IDs for chain continuation
      const remainingSceneIds = scenesToGenerate.slice(1).map(s => s.id);
      
      // Store chain metadata
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

      const completedCount = allScenes.filter(s => s.status === 'completed').length;
      console.log(`[Chain] ✅ Scene ${firstSceneToGenerate.scene_order} started: ${prediction.id}`);
      console.log(`[Chain] Already completed: ${completedCount}, Remaining: ${remainingSceneIds.length}`);

      return new Response(JSON.stringify({
        success: true,
        started: 1,
        startedScene: firstSceneToGenerate.scene_order,
        total: allScenes.length,
        alreadyCompleted: completedCount,
        remaining: scenesToGenerate.length,
        cost: totalCost,
        currency,
        newBalance,
        isResume: completedCount > 0,
        message: completedCount > 0 
          ? `Fortsetzen ab Szene ${firstSceneToGenerate.scene_order}/${allScenes.length}. ${completedCount} Szene(n) bereits fertig.`
          : `Szene 1/${allScenes.length} wird generiert. Weitere Szenen folgen automatisch.`,
        predictionId: prediction.id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (replicateError: any) {
      console.error('[Chain] Replicate error:', replicateError);
      const errorMessage = replicateError?.message || replicateError?.toString() || '';

      // Refund credits for remaining scenes
      await supabaseAdmin.rpc('refund_ai_video_credits', {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: projectId
      });
      console.log(`[Chain] ✅ Refunded ${currencySymbol}${totalCost.toFixed(2)} due to error`);

      await supabaseAdmin.from('sora_long_form_projects').update({ status: 'draft' }).eq('id', projectId);
      await supabaseAdmin.from('sora_long_form_scenes').update({ status: 'failed' }).eq('id', firstSceneToGenerate.id);

      // Sora/OpenAI Billing Limit erreicht
      if (errorMessage.includes('billing') || errorMessage.includes('Billing') || 
          errorMessage.includes('limit') || errorMessage.includes('credits') ||
          errorMessage.includes('insufficient') || errorMessage.includes('payment')) {
        console.error('[Chain] ⚠️ Sora Billing/Credit limit detected');
        return new Response(JSON.stringify({
          error: 'Sora 2 Dienst ist temporär nicht verfügbar. Deine Credits wurden automatisch zurückerstattet. Bitte versuche es in einigen Minuten erneut.',
          code: 'SORA_BILLING_LIMIT'
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Service nicht verfügbar (502)
      if (replicateError?.response?.status === 502 || replicateError?.status === 502) {
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

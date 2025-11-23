import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sora 2 Customer Pricing per second (250% margin)
// Multi-currency support: EUR and USD
const MODEL_PRICING: Record<string, Record<string, number>> = {
  'sora-2-standard': { EUR: 0.25, USD: 0.25 }, // Standard pricing
  'sora-2-pro': { EUR: 0.53, USD: 0.53 },      // Pro pricing
};

interface GenerateRequest {
  prompt: string;
  model: 'sora-2-standard' | 'sora-2-pro';
  duration: number; // 5-30 seconds
  aspectRatio: '16:9' | '9:16' | '1:1';
  resolution: '1080p' | '720p';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Create admin client for database operations (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request
    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration, aspectRatio, resolution } = body;

    // Map aspect ratio for Replicate (9:16 → portrait, 16:9/1:1 → landscape)
    const replicateAspectRatio = aspectRatio === '9:16' ? 'portrait' : 'landscape';

    // Validate duration
    if (duration < 5 || duration > 30) {
      throw new Error("Duration must be between 5 and 30 seconds");
    }

    // Get wallet currency (moved here before cost calculation)
    const { data: walletPreview, error: walletPreviewError } = await supabaseClient
      .from('ai_video_wallets')
      .select('currency')
      .eq('user_id', user.id)
      .single();

    const currency = walletPreview?.currency || 'EUR';

    // Calculate cost based on model and currency
    const modelPricing = MODEL_PRICING[model] || MODEL_PRICING['sora-2-standard'];
    const costPerSecond = modelPricing[currency] || modelPricing['EUR'];
    const totalCost = duration * costPerSecond;

    // Check rate limit (max 10 videos per hour per user)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabaseAdmin
      .from('ai_video_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if (countError) throw countError;

    if (count && count >= 10) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Max 10 videos per hour.',
          retryAfter: 3600 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check wallet balance with currency
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.log('[generate-ai-video] ERROR: No wallet found for user', user.id);
      return new Response(
        JSON.stringify({ 
          error: "No AI Video wallet found. Please purchase credits first.",
          code: "NO_WALLET",
          needsPurchase: true 
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Currency-aware balance check
    const currencySymbol = wallet.currency === 'USD' ? '$' : '€';
    if (wallet.balance_euros < totalCost) {
      console.log(`[generate-ai-video] ERROR: Insufficient credits - Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);
      return new Response(
        JSON.stringify({ 
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: totalCost,
          available: wallet.balance_euros,
          currency: wallet.currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-ai-video] Currency: ${wallet.currency}, Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Create generation record (use admin client to bypass RLS)
    const { data: generation, error: genError } = await supabaseAdmin
      .from('ai_video_generations')
      .insert({
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: 'pending'
      })
      .select()
      .single();

    if (genError) throw genError;

    // Deduct credits using RPC (returns new balance as NUMERIC)
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      {
        p_user_id: user.id,
        p_amount: totalCost,
        p_generation_id: generation.id
      }
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error('[generate-ai-video] Deduct credits error:', deductError);
      // Rollback generation
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-ai-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Sora 2 Model Version IDs from Replicate
    const SORA_2_STANDARD = '96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331';
    const SORA_2_PRO = '4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f';

    const modelVersion = model === 'sora-2-pro' ? SORA_2_PRO : SORA_2_STANDARD;
    const modelName = model === 'sora-2-pro' ? 'openai/sora-2-pro' : 'openai/sora-2';

    console.log(`[generate-ai-video] Using model: ${modelName}:${modelVersion}`);

    // Get webhook URL
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/replicate-webhook`;

    // Start video generation on Replicate with webhook
    const prediction = await replicate.predictions.create({
      version: modelVersion,
      input: {
        prompt,
        duration,
        aspect_ratio: replicateAspectRatio,
        resolution,
      },
      webhook: webhookUrl,
      webhook_events_filter: ['start', 'completed']
    });

    console.log(`[generate-ai-video] Replicate prediction started: ${prediction.id}`);
    console.log(`[generate-ai-video] Webhook configured: ${webhookUrl}`);

    // Update generation status with Replicate job ID
    await supabaseAdmin
      .from('ai_video_generations')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        artlist_job_id: prediction.id, // Replicate prediction ID
      })
      .eq('id', generation.id);

    console.log(`[generate-ai-video] Started generation ${generation.id} for user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        generationId: generation.id,
        cost: totalCost,
        currency: wallet.currency,
        newBalance: newBalance,
        status: 'processing'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Error generating AI video:", error);

    // Handle Replicate validation errors (422)
    if (error?.response?.status === 422) {
      return new Response(
        JSON.stringify({
          error: "Der Videoanbieter hat die Eingabe abgelehnt. Bitte versuchen Sie es mit anderen Einstellungen.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

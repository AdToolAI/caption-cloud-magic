import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COST_PER_SECOND = 0.61; // Euro

interface GenerateRequest {
  prompt: string;
  model: 'sora-2';
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

    // Parse request
    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration, aspectRatio, resolution } = body;

    // Validate duration
    if (duration < 5 || duration > 30) {
      throw new Error("Duration must be between 5 and 30 seconds");
    }

    // Calculate cost
    const totalCost = duration * COST_PER_SECOND;

    // Check rate limit (max 10 videos per hour per user)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabaseClient
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

    // Check wallet balance
    const { data: wallet, error: walletError } = await supabaseClient
      .from('ai_video_wallets')
      .select('balance_euros')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ 
          error: "No AI Video wallet found. Please purchase credits first.",
          needsPurchase: true 
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (wallet.balance_euros < totalCost) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient credits. Need ${totalCost.toFixed(2)}€, have ${wallet.balance_euros.toFixed(2)}€`,
          needsPurchase: true,
          required: totalCost,
          available: wallet.balance_euros
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create generation record
    const { data: generation, error: genError } = await supabaseClient
      .from('ai_video_generations')
      .insert({
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: COST_PER_SECOND,
        total_cost_euros: totalCost,
        status: 'pending'
      })
      .select()
      .single();

    if (genError) throw genError;

    // Deduct credits using service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: deductResult, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id
      }
    );

    if (deductError || !deductResult[0]?.success) {
      // Rollback generation
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      
      throw new Error("Failed to deduct credits");
    }

    // TODO: Call Artlist.io API here
    // For now, simulate with a placeholder
    
    // Update generation status
    await supabaseAdmin
      .from('ai_video_generations')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        artlist_job_id: 'ARTLIST_JOB_PLACEHOLDER' // TODO: Real job ID from Artlist.io
      })
      .eq('id', generation.id);

    console.log(`[generate-ai-video] Started generation ${generation.id} for user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        generationId: generation.id,
        cost: totalCost,
        newBalance: deductResult[0].new_balance,
        status: 'processing'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error generating AI video:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

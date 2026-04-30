import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Customer pricing per upscale (≥30% margin over Replicate cost)
// clarity-upscaler: ~$0.012-0.025 per run depending on size
// We charge based on factor:
const UPSCALE_PRICING: Record<number, Record<string, number>> = {
  2: { EUR: 0.03, USD: 0.03 },
  4: { EUR: 0.06, USD: 0.06 },
};

interface UpscaleRequest {
  imageUrl: string;
  imageId?: string;        // Optional: link upscaled to original via parent_id
  factor: 2 | 4;
  prompt?: string;         // Optional refinement prompt for clarity-upscaler
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as UpscaleRequest;
    const { imageUrl, imageId, factor, prompt } = body;

    if (!imageUrl?.trim()) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!UPSCALE_PRICING[factor]) {
      return new Response(
        JSON.stringify({ error: "Invalid factor. Use 2 or 4." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wallet check
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          error: "No AI Credits wallet found. Please purchase credits first.",
          code: "NO_WALLET",
          needsPurchase: true
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currency = wallet.currency || 'EUR';
    const cost = UPSCALE_PRICING[factor][currency] || UPSCALE_PRICING[factor].EUR;
    const currencySymbol = currency === 'USD' ? '$' : '€';

    if (wallet.balance_euros < cost) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${cost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: cost,
          available: wallet.balance_euros,
          currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // clarity-upscaler is a high-quality, prompt-aware upscaler
    // https://replicate.com/philz1337x/clarity-upscaler
    const modelRef = 'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e';

    const replicateInput: Record<string, any> = {
      image: imageUrl,
      scale_factor: factor,
      dynamic: 6,
      creativity: 0.35,
      resemblance: 0.6,
      sharpen: 0,
      handfix: 'disabled',
      output_format: 'jpg',
      num_inference_steps: 18,
    };
    if (prompt && prompt.trim()) {
      replicateInput.prompt = prompt.trim();
    }

    console.log(`[upscale-image] User=${user.id} Factor=${factor}x Cost=${currencySymbol}${cost.toFixed(2)}`);

    let output: any;
    try {
      output = await replicate.run(modelRef as any, { input: replicateInput });
    } catch (replicateError: any) {
      console.error('[upscale-image] Replicate error:', replicateError);
      return new Response(
        JSON.stringify({
          error: `Upscale failed: ${replicateError.message || 'Unknown error'}`,
          code: "REPLICATE_ERROR"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract URL
    let outputUrl: string | null = null;
    if (typeof output === 'string') {
      outputUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      outputUrl = typeof output[0] === 'string' ? output[0] : null;
    } else if (output && typeof output === 'object' && 'url' in output) {
      outputUrl = typeof (output as any).url === 'function' ? (output as any).url().toString() : (output as any).url;
    }

    if (!outputUrl) {
      return new Response(
        JSON.stringify({ error: "No image returned from upscaler", code: "NO_OUTPUT" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download upscaled image and save to storage
    const imageRes = await fetch(outputUrl);
    if (!imageRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch upscaled image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const storagePath = `${user.id}/picture-studio/upscaled-${factor}x-${Date.now()}.jpg`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('background-projects')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[upscale-image] Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: `Storage error: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('background-projects')
      .getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    // Look up parent metadata if imageId provided (to inherit prompt/style)
    let parentMeta: { prompt?: string; style?: string; aspect_ratio?: string; album_id?: string | null } = {};
    if (imageId) {
      const { data: parent } = await supabaseAdmin
        .from('studio_images')
        .select('prompt, style, aspect_ratio, album_id')
        .eq('id', imageId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (parent) parentMeta = parent;
    }

    // Insert upscaled record
    const { data: studioImage, error: insertError } = await supabaseAdmin
      .from('studio_images')
      .insert({
        user_id: user.id,
        url: publicUrl,
        storage_path: storagePath,
        prompt: parentMeta.prompt || prompt || 'Upscaled image',
        style: parentMeta.style || 'realistic',
        aspect_ratio: parentMeta.aspect_ratio || '1:1',
        album_id: parentMeta.album_id || null,
        parent_id: imageId || null,
        upscale_factor: factor,
      })
      .select()
      .single();

    if (insertError) {
      console.warn('[upscale-image] studio_images insert warning:', insertError);
    }

    // Deduct credits
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: cost, p_generation_id: studioImage?.id || null }
    );

    if (deductError) {
      console.error('[upscale-image] Deduct error:', deductError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        image: {
          id: studioImage?.id,
          url: publicUrl,
          previewUrl: publicUrl,
          factor,
          parentId: imageId || null,
        },
        cost,
        currency,
        newBalance: newBalance ?? (wallet.balance_euros - cost),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[upscale-image] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

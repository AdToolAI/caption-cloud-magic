import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Customer pricing per image (≥30% margin over Replicate cost)
// Seedream 4: ~$0.030 → €0.04
// Imagen 4 Ultra: ~$0.060 → €0.08
// Nano Banana 2: ~$0.067-0.151 → €0.20 (worst-case calculated)
const IMAGE_PRICING: Record<string, Record<string, number>> = {
  fast: { EUR: 0.04, USD: 0.04 },
  pro: { EUR: 0.08, USD: 0.08 },
  ultra: { EUR: 0.20, USD: 0.20 },
};

const REPLICATE_MODELS: Record<string, `${string}/${string}` | `${string}/${string}:${string}`> = {
  fast: 'bytedance/seedream-4',
  pro: 'google/imagen-4-ultra',
  ultra: 'google/nano-banana',
};

interface GenerateRequest {
  prompt: string;
  tier: 'fast' | 'pro' | 'ultra';
  aspectRatio?: string;
  referenceImageUrl?: string;     // Subject reference (image-to-image)
  styleReferenceUrl?: string;     // Style reference (Phase C)
  style?: string;
  brandKit?: {
    name?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    mood?: string;
  } | null;
}

const STYLE_MODIFIERS: Record<string, string> = {
  realistic: 'photorealistic, 8k, ultra-detailed, natural lighting, professional photography',
  cinematic: 'cinematic composition, dramatic lighting, anamorphic lens flare, movie still, color graded',
  watercolor: 'delicate watercolor painting, soft washes, paper texture, artistic brushstrokes',
  'neon-cyberpunk': 'neon-lit cyberpunk, vibrant glowing lights, futuristic cityscape, synthwave colors',
  anime: 'anime art style, cel-shaded, vibrant colors, Studio Ghibli inspired',
  'oil-painting': 'classical oil painting, rich textures, impasto technique, museum quality',
  'pop-art': 'pop art style, bold colors, halftone dots, Andy Warhol inspired',
  minimalist: 'minimalist design, clean lines, negative space, simple elegant composition',
  vintage: 'vintage photograph, film grain, sepia tones, retro 1970s aesthetic',
  fantasy: 'epic fantasy art, magical atmosphere, ethereal lighting, detailed world-building',
  'product-photo': 'professional product photography, studio lighting, clean background, commercial quality',
  abstract: 'abstract art, geometric shapes, bold color palette, contemporary art',
  sketch: 'detailed pencil sketch, cross-hatching, hand-drawn illustration',
  '3d-render': '3D rendered, octane render, volumetric lighting, subsurface scattering',
  noir: 'film noir style, high contrast black and white, dramatic shadows, moody atmosphere',
  pastel: 'soft pastel colors, dreamy atmosphere, gentle lighting, ethereal mood',
  comic: 'comic book art style, bold outlines, vibrant panel art, dynamic composition',
  surreal: 'surrealist art, dreamlike imagery, impossible geometry, Salvador Dalí inspired',
  architectural: 'architectural visualization, clean lines, modern design, dramatic perspective',
  editorial: 'editorial fashion photography, high-end magazine style, bold composition',
};

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

    const body = await req.json() as GenerateRequest;
    const { prompt, tier, aspectRatio = '1:1', referenceImageUrl, styleReferenceUrl, style = 'realistic', brandKit } = body;

    if (!prompt?.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!IMAGE_PRICING[tier]) {
      return new Response(
        JSON.stringify({ error: "Invalid tier. Use fast, pro, or ultra." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wallet currency + balance
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
    const cost = IMAGE_PRICING[tier][currency] || IMAGE_PRICING[tier].EUR;
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

    // Build enhanced prompt
    const styleModifier = STYLE_MODIFIERS[style] || STYLE_MODIFIERS.realistic;
    const enhancedPrompt = `${prompt.trim()}. Style: ${styleModifier}.`;

    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const modelRef = REPLICATE_MODELS[tier];

    // Per-model input shape
    const replicateInput: Record<string, any> = { prompt: enhancedPrompt };

    if (tier === 'fast') {
      // Seedream 4
      replicateInput.aspect_ratio = aspectRatio;
      replicateInput.size = '2K';
      if (referenceImageUrl) replicateInput.image_input = [referenceImageUrl];
    } else if (tier === 'pro') {
      // Imagen 4 Ultra
      replicateInput.aspect_ratio = aspectRatio;
      replicateInput.output_format = 'jpg';
      replicateInput.safety_filter_level = 'block_only_high';
    } else {
      // Nano Banana (ultra)
      replicateInput.aspect_ratio = aspectRatio;
      replicateInput.output_format = 'jpg';
      if (referenceImageUrl) replicateInput.image_input = [referenceImageUrl];
    }

    console.log(`[generate-image-replicate] Tier=${tier} Cost=${currencySymbol}${cost.toFixed(2)} Model=${modelRef}`);

    let output: any;
    try {
      output = await replicate.run(modelRef as any, { input: replicateInput });
    } catch (replicateError: any) {
      console.error('[generate-image-replicate] Replicate error:', replicateError);
      return new Response(
        JSON.stringify({
          error: `Image generation failed: ${replicateError.message || 'Unknown error'}`,
          code: "REPLICATE_ERROR"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract image URL (Replicate output can be string | string[] | ReadableStream)
    let imageUrl: string | null = null;
    if (typeof output === 'string') {
      imageUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      imageUrl = typeof output[0] === 'string' ? output[0] : null;
    } else if (output && typeof output === 'object' && 'url' in output) {
      imageUrl = typeof (output as any).url === 'function' ? (output as any).url().toString() : (output as any).url;
    }

    if (!imageUrl) {
      console.error('[generate-image-replicate] No image URL in output:', output);
      return new Response(
        JSON.stringify({ error: "No image returned from model", code: "NO_OUTPUT" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image and store in background-projects bucket (RLS path: {user_id}/...)
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch generated image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const fileExt = 'jpg';
    const storagePath = `${user.id}/picture-studio/${tier}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('background-projects')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[generate-image-replicate] Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: `Storage error: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('background-projects')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    // Insert into studio_images so it shows up in album/library
    const { data: studioImage, error: insertError } = await supabaseAdmin
      .from('studio_images')
      .insert({
        user_id: user.id,
        url: publicUrl,
        storage_path: storagePath,
        prompt: prompt.trim(),
        style,
        aspect_ratio: aspectRatio,
      })
      .select()
      .single();

    if (insertError) {
      console.warn('[generate-image-replicate] studio_images insert warning:', insertError);
    }

    // Deduct credits AFTER successful generation
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: cost, p_generation_id: studioImage?.id || null }
    );

    if (deductError) {
      console.error('[generate-image-replicate] Deduct error:', deductError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        image: {
          id: studioImage?.id,
          url: publicUrl,
          previewUrl: publicUrl,
        },
        cost,
        currency,
        newBalance: newBalance ?? wallet.balance_euros - cost,
        tier,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[generate-image-replicate] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

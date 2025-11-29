import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sora 2 Image-to-Video model versions
const SORA_2_I2V_VERSIONS = {
  'sora-2-standard': 'openai/sora-2-i2v:96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331',
  'sora-2-pro': 'openai/sora-2-pro-i2v:4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f',
};

// Cost per second in EUR
const COST_PER_SECOND = {
  'sora-2-standard': 0.25,
  'sora-2-pro': 0.53,
};

interface EnhanceRequest {
  scene_id: string;
  project_id: string;
  image_url: string;
  prompt: string;
  duration: 4 | 8 | 12;
  model: 'sora-2-standard' | 'sora-2-pro';
  aspect_ratio: '16:9' | '9:16' | '1:1';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY not configured");
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: EnhanceRequest = await req.json();
    const { scene_id, project_id, image_url, prompt, duration, model, aspect_ratio } = body;

    // Validate duration (Sora 2 only supports 4, 8, 12 seconds)
    if (![4, 8, 12].includes(duration)) {
      return new Response(JSON.stringify({ 
        error: "INVALID_DURATION",
        message: "Sora 2 unterstützt nur 4, 8 oder 12 Sekunden Dauer"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate cost
    const costPerSecond = COST_PER_SECOND[model];
    const totalCost = duration * costPerSecond;

    console.log(`Enhancement request: scene=${scene_id}, model=${model}, duration=${duration}s, cost=${totalCost}€`);

    // Check user's AI Video wallet balance
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ 
        error: "NO_WALLET",
        message: "Kein AI Video Guthaben gefunden. Bitte laden Sie zuerst Credits auf."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (wallet.balance_euros < totalCost) {
      return new Response(JSON.stringify({ 
        error: "INSUFFICIENT_CREDITS",
        message: `Nicht genügend Guthaben. Benötigt: ${totalCost.toFixed(2)}€, Verfügbar: ${wallet.balance_euros.toFixed(2)}€`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map aspect ratio for Replicate
    const replicateAspectRatio = aspect_ratio === '16:9' ? '16:9' : 
                                  aspect_ratio === '9:16' ? '9:16' : '1:1';

    // Get model version
    const modelVersion = SORA_2_I2V_VERSIONS[model];

    // Create webhook URL
    const webhookUrl = `${SUPABASE_URL}/functions/v1/director-cut-sora-webhook`;

    console.log(`Creating Replicate prediction with model: ${modelVersion}`);

    // Call Replicate API
    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: modelVersion.split(':')[1],
        input: {
          prompt: prompt,
          image: image_url,
          seconds: duration,
          aspect_ratio: replicateAspectRatio,
          resolution: "720p",
        },
        webhook: webhookUrl,
        webhook_events_filter: ["completed", "start"],
      }),
    });

    if (!replicateResponse.ok) {
      const errorText = await replicateResponse.text();
      console.error("Replicate API error:", replicateResponse.status, errorText);
      return new Response(JSON.stringify({ 
        error: "REPLICATE_ERROR",
        message: "Fehler bei der KI-Generierung. Bitte versuchen Sie es später erneut."
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prediction = await replicateResponse.json();
    console.log("Replicate prediction created:", prediction.id);

    // Create enhancement record in database
    const { data: enhancement, error: insertError } = await supabaseAdmin
      .from("director_cut_enhancements")
      .insert({
        user_id: user.id,
        project_id,
        scene_id,
        original_frame_url: image_url,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio,
        cost_euros: totalCost,
        replicate_prediction_id: prediction.id,
        status: "processing",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error("Failed to create enhancement record");
    }

    // Deduct credits immediately
    const { error: deductError } = await supabaseAdmin.rpc("deduct_ai_video_credits", {
      p_user_id: user.id,
      p_amount: totalCost,
      p_generation_id: enhancement.id,
    });

    if (deductError) {
      console.error("Credit deduction error:", deductError);
      // Rollback enhancement record
      await supabaseAdmin.from("director_cut_enhancements").delete().eq("id", enhancement.id);
      return new Response(JSON.stringify({ 
        error: "CREDIT_ERROR",
        message: "Fehler beim Abbuchen der Credits"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      enhancement_id: enhancement.id,
      prediction_id: prediction.id,
      cost_euros: totalCost,
      estimated_time_seconds: duration * 15, // Rough estimate
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Enhancement error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

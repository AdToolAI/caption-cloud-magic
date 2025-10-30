import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    
    if (!code) {
      return new Response(
        JSON.stringify({ valid: false, error: "Code is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if promo code exists and is active
    const { data: promoCode, error } = await supabaseClient
      .from("promo_codes")
      .select("id, code, discount_percent, max_redemptions, redemptions_count, active, affiliate_id")
      .eq("code", code.toUpperCase())
      .eq("active", true)
      .single();

    if (error || !promoCode) {
      console.log("Promo code not found or inactive:", code);
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid code" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check if max redemptions reached
    if (promoCode.max_redemptions && promoCode.redemptions_count >= promoCode.max_redemptions) {
      console.log("Promo code max redemptions reached:", code);
      return new Response(
        JSON.stringify({ valid: false, error: "Code has reached maximum uses" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Return valid code with discount info
    return new Response(
      JSON.stringify({
        valid: true,
        discount_percent: promoCode.discount_percent,
        affiliate_id: promoCode.affiliate_id,
        code: promoCode.code
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error validating promo code:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

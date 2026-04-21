import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyEmailRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: VerifyEmailRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[verify-email] Verifying token`);

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Find the verification token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      console.error("[verify-email] Token not found:", tokenError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification link" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      console.log("[verify-email] Token expired");
      return new Response(
        JSON.stringify({ error: "Verification link has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if already verified
    if (tokenData.verified_at) {
      console.log("[verify-email] Already verified");
      return new Response(
        JSON.stringify({ success: true, message: "Email already verified" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update auth.users to set email_confirmed_at using admin API
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      tokenData.user_id,
      { email_confirm: true }
    );

    if (updateAuthError) {
      console.error("[verify-email] Failed to update auth user:", updateAuthError);
      throw new Error("Failed to verify email");
    }

    // Mark token as used
    await supabaseAdmin
      .from("email_verification_tokens")
      .update({ verified_at: new Date().toISOString() })
      .eq("token", token);

    // Update profile email_verified flag + timestamp (anchor for activation drip)
    await supabaseAdmin
      .from("profiles")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      })
      .eq("id", tokenData.user_id);

    console.log(`[verify-email] Email verified successfully for user: ${tokenData.user_id}`);

    // Trigger welcome bonus (idempotent — function checks already_granted internally)
    try {
      const bonusRes = await fetch(`${supabaseUrl}/functions/v1/grant-welcome-bonus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "apikey": supabaseServiceKey,
        },
        body: JSON.stringify({ user_id: tokenData.user_id }),
      });
      const bonusJson = await bonusRes.json().catch(() => ({}));
      console.log(`[verify-email] Welcome bonus result:`, bonusJson);
    } catch (bonusErr) {
      console.error("[verify-email] Welcome bonus call failed (non-fatal):", bonusErr);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email verified successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[verify-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WELCOME_BONUS_AMOUNT_EUR = 10.00;
const WELCOME_BONUS_AMOUNT_USD = 10.00;
const MAX_ACCOUNT_AGE_DAYS = 7;
const DAILY_GRANT_SOFT_CAP = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    // Require email verification (anti-abuse)
    if (!user.email_confirmed_at) {
      return new Response(
        JSON.stringify({
          granted: false,
          reason: "email_not_verified",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Account age check
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
    if (accountAgeDays > MAX_ACCOUNT_AGE_DAYS) {
      return new Response(
        JSON.stringify({ granted: false, reason: "account_too_old" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotency: check if already granted
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("welcome_bonus_granted_at, language")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    if (profile?.welcome_bonus_granted_at) {
      return new Response(
        JSON.stringify({ granted: false, reason: "already_granted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Soft cap on daily grants (anti-abuse)
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { count: todayGrants } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("welcome_bonus_granted_at", since.toISOString());

    if ((todayGrants ?? 0) >= DAILY_GRANT_SOFT_CAP) {
      return new Response(
        JSON.stringify({ granted: false, reason: "daily_cap_reached" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine currency from profile language (EN→USD, DE/ES→EUR)
    const currency = profile?.language === "en" ? "USD" : "EUR";
    const amount = currency === "USD" ? WELCOME_BONUS_AMOUNT_USD : WELCOME_BONUS_AMOUNT_EUR;

    // Upsert wallet with bonus
    const { data: existingWallet } = await supabase
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .maybeSingle();

    let newBalance: number;
    if (existingWallet) {
      const updated = await supabase
        .from("ai_video_wallets")
        .update({
          balance_euros: Number(existingWallet.balance_euros) + amount,
          currency,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("balance_euros")
        .single();
      if (updated.error) throw updated.error;
      newBalance = Number(updated.data.balance_euros);
    } else {
      const inserted = await supabase
        .from("ai_video_wallets")
        .insert({
          user_id: user.id,
          balance_euros: amount,
          currency,
          total_purchased_euros: 0,
          total_spent_euros: 0,
        })
        .select("balance_euros")
        .single();
      if (inserted.error) throw inserted.error;
      newBalance = Number(inserted.data.balance_euros);
    }

    // Log transaction
    await supabase.from("ai_video_transactions").insert({
      user_id: user.id,
      currency,
      type: "bonus",
      amount_euros: amount,
      balance_after: newBalance,
      description: "Welcome Bonus",
      metadata: { source: "welcome_bonus", version: 1 },
    });

    // Mark as granted
    await supabase
      .from("profiles")
      .update({ welcome_bonus_granted_at: new Date().toISOString() })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({
        granted: true,
        amount,
        currency,
        balance: newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("grant-welcome-bonus error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Admin-only: create (or upgrade) a Creator account.
//
// A Creator account gets:
//   - a one-time AI wallet credit (default 100 EUR)
//   - a platform-wide discount on every AI deduction (default 25%)
//   - full platform access (out-of-band plan, no Stripe subscription)
//
// Idempotent: calling it twice never grants the credit twice.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function randomPassword(length = 12): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- AuthN / AuthZ: caller must be a signed-in admin -----------------------
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) return json({ error: "unauthorized" }, 401);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: callerData.user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "forbidden" }, 403);

  // --- Input ----------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }

  const creditEuros = Number.isFinite(Number(body.credit_euros)) && Number(body.credit_euros) > 0
    ? Math.min(Number(body.credit_euros), 1000)
    : 100;
  const discountPercent = Number.isFinite(Number(body.discount_percent))
    ? Math.min(Math.max(Math.round(Number(body.discount_percent)), 0), 100)
    : 25;

  // --- Find or create the auth user ----------------------------------------
  let userId: string | null = null;
  let generatedPassword: string | null = null;

  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = existing?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  if (found) {
    userId = found.id;
    // Reset password so the caller can hand it to the user.
    generatedPassword = randomPassword(12);
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: generatedPassword,
      // Creator accounts are provisioned by an admin: no email confirmation step.
      email_confirm: true,
    });
    if (updateError) {
      return json({ error: "password_reset_failed", details: updateError.message }, 400);
    }
  } else {
    generatedPassword = randomPassword(12);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: generatedPassword,
      // Admin-provisioned account -> already confirmed, can sign in immediately.
      email_confirm: true,
    });
    if (createError || !created?.user) {
      console.error("createUser error:", createError);
      return json({
        error: "create_user_failed",
        details: createError?.message,
        code: createError?.code,
        status: createError?.status,
      }, 400);
    }
    userId = created.user.id;
  }

  // --- Mark the profile as creator -----------------------------------------
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        account_type: "creator",
        ai_discount_percent: discountPercent,
        plan: "basic",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (profileError) {
    return json({ error: "profile_update_failed", details: profileError.message }, 400);
  }

  // --- One-time welcome credit (idempotent) --------------------------------
  const grantKey = `creator_welcome_credit:${userId}`;
  const { data: alreadyGranted } = await admin
    .from("ai_video_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("stripe_checkout_session_id", grantKey)
    .maybeSingle();

  let creditGranted = false;
  if (!alreadyGranted) {
    const { error: creditError } = await admin.rpc("add_ai_video_credits", {
      p_user_id: userId,
      p_currency: "EUR",
      p_base_amount: creditEuros,
      p_bonus_amount: 0,
      p_pack_size: "creator_welcome",
      p_bonus_percent: 0,
      p_stripe_session_id: grantKey,
    });
    if (creditError) {
      return json({ error: "credit_grant_failed", details: creditError.message }, 400);
    }
    creditGranted = true;
  }

  const { data: wallet } = await admin
    .from("ai_video_wallets")
    .select("balance_euros, currency")
    .eq("user_id", userId)
    .maybeSingle();

  return json({
    success: true,
    user_id: userId,
    email,
    created: !found,
    password: generatedPassword, // only returned when the account was just created
    account_type: "creator",
    discount_percent: discountPercent,
    credit_granted: creditGranted,
    balance_euros: wallet?.balance_euros ?? null,
    currency: wallet?.currency ?? "EUR",
  });
});

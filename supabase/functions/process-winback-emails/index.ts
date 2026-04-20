import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderEmail, type Stage, type Lang } from "./templates.ts";
import { sendEmail } from "../_shared/email-send.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("APP_BASE_URL") || "https://useadtool.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAY_14_REWARD_USD = 5;
const COUPON_CODE = "WINBACK20";

interface CandidateUser {
  id: string;
  email: string;
  language: Lang;
  display_name?: string;
}

const normalizeLang = (raw?: string | null): Lang => {
  const v = (raw || "en").toLowerCase().slice(0, 2);
  if (v === "de") return "de";
  if (v === "es") return "es";
  return "en";
};

async function fetchCandidates(
  supabase: ReturnType<typeof createClient>,
  stage: Stage
): Promise<CandidateUser[]> {
  // Day-14: 13–15 days inactive; Day-30: 29–31 days inactive
  const lowerDays = stage === "day_14" ? 15 : 31;
  const upperDays = stage === "day_14" ? 13 : 29;
  const now = Date.now();
  const lowerBound = new Date(now - lowerDays * 86400000).toISOString();
  const upperBound = new Date(now - upperDays * 86400000).toISOString();
  const activeCutoff = new Date(now - 7 * 86400000).toISOString();

  // List auth users (paginated)
  const candidates: CandidateUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(`[winback] listUsers page ${page} error:`, error);
      break;
    }
    if (!data?.users || data.users.length === 0) break;

    for (const u of data.users) {
      if (!u.email || !u.last_sign_in_at) continue;
      const lastSignIn = new Date(u.last_sign_in_at).getTime();
      // Auto-stop: active in last 7 days
      if (lastSignIn > new Date(activeCutoff).getTime()) continue;
      // Window check: between lowerBound and upperBound
      if (lastSignIn < new Date(lowerBound).getTime()) continue;
      if (lastSignIn > new Date(upperBound).getTime()) continue;

      candidates.push({
        id: u.id,
        email: u.email,
        language: "en", // filled below from profiles
      });
    }

    if (data.users.length < perPage) break;
    page++;
    if (page > 50) break; // safety
  }

  if (candidates.length === 0) return [];

  // Filter out users that already have a log entry for this stage
  const userIds = candidates.map((c) => c.id);
  const { data: existingLogs } = await supabase
    .from("winback_email_log")
    .select("user_id")
    .eq("stage", stage)
    .in("user_id", userIds);

  const loggedUserIds = new Set((existingLogs || []).map((r: any) => r.user_id));
  const filtered = candidates.filter((c) => !loggedUserIds.has(c.id));

  if (filtered.length === 0) return [];

  // Fetch language + display_name from profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, language, display_name")
    .in("id", filtered.map((c) => c.id));

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  for (const c of filtered) {
    const p = profileMap.get(c.id);
    c.language = normalizeLang(p?.language);
    c.display_name = p?.display_name;
  }

  return filtered;
}

async function grantDay14Reward(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  try {
    // Get currency or default USD
    const { data: wallet } = await supabase
      .from("ai_video_wallets")
      .select("currency")
      .eq("user_id", userId)
      .maybeSingle();

    const currency = (wallet?.currency as string) || "USD";

    // Upsert wallet with reward
    const { data: existingWallet } = await supabase
      .from("ai_video_wallets")
      .select("balance_euros, total_purchased_euros")
      .eq("user_id", userId)
      .maybeSingle();

    let newBalance: number;
    if (existingWallet) {
      const newBal = Number(existingWallet.balance_euros) + DAY_14_REWARD_USD;
      const { data: updated, error: updErr } = await supabase
        .from("ai_video_wallets")
        .update({
          balance_euros: newBal,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("balance_euros")
        .single();
      if (updErr) throw updErr;
      newBalance = Number(updated.balance_euros);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("ai_video_wallets")
        .insert({
          user_id: userId,
          currency,
          balance_euros: DAY_14_REWARD_USD,
          total_purchased_euros: 0,
        })
        .select("balance_euros")
        .single();
      if (insErr) throw insErr;
      newBalance = Number(inserted.balance_euros);
    }

    // Log bonus transaction
    await supabase.from("ai_video_transactions").insert({
      user_id: userId,
      currency,
      type: "bonus",
      amount_euros: DAY_14_REWARD_USD,
      balance_after: newBalance,
      description: "Win-back reward Day 14",
      metadata: { source: "winback", stage: "day_14" },
    });

    return true;
  } catch (err) {
    console.error(`[winback] grant Day-14 reward failed for ${userId}:`, err);
    return false;
  }
}

async function sendPushIfEnabled(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  url: string
): Promise<void> {
  try {
    await supabase.functions.invoke("send-push-notification", {
      body: { user_id: userId, title, body, url },
    });
  } catch (err) {
    console.error(`[winback] push send failed for ${userId}:`, err);
  }
}

async function processStage(
  supabase: ReturnType<typeof createClient>,
  stage: Stage
): Promise<{ processed: number; sent: number; failed: number }> {
  const candidates = await fetchCandidates(supabase, stage);
  console.log(`[winback] ${stage}: ${candidates.length} candidates`);

  let sent = 0;
  let failed = 0;

  for (const user of candidates) {
    try {
      // Day-14: grant reward BEFORE email so we can mention it accurately
      if (stage === "day_14") {
        const granted = await grantDay14Reward(supabase, user.id);
        if (!granted) {
          failed++;
          continue;
        }
      }

      const { subject, html, ctaUrl, pushTitle, pushBody } = renderEmail({
        stage,
        lang: user.language,
        appUrl: APP_URL,
        couponCode: COUPON_CODE,
        rewardUsd: DAY_14_REWARD_USD,
        userEmail: user.email,
        displayName: user.display_name,
      });

      const result = await sendEmail({
        to: user.email,
        subject,
        html,
        template: `winback_${stage}`,
        category: "marketing",
      });

      if (!result.ok && !result.skipped) {
        console.error(`[winback] send error for ${user.email}:`, result.error);
        failed++;
        continue;
      }

      const messageId = result.resendId ?? null;

      // Insert log (idempotent)
      const { error: logErr } = await supabase
        .from("winback_email_log")
        .insert({
          user_id: user.id,
          stage,
          email_message_id: messageId,
          metadata: { language: user.language, cta_url: ctaUrl },
        });

      if (logErr && !logErr.message?.includes("duplicate")) {
        console.error(`[winback] log insert error for ${user.id}:`, logErr);
      }

      // Push parallel (fire-and-forget)
      sendPushIfEnabled(supabase, user.id, pushTitle, pushBody, ctaUrl).catch(() => {});

      sent++;
    } catch (err) {
      console.error(`[winback] processing error for ${user.email}:`, err);
      failed++;
    }
  }

  return { processed: candidates.length, sent, failed };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Optional cron-secret check
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      console.warn("[winback] invalid cron secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const day14 = await processStage(supabase, "day_14");
    const day30 = await processStage(supabase, "day_30");

    const result = {
      success: true,
      day_14: day14,
      day_30: day30,
      run_at: new Date().toISOString(),
    };

    console.log("[winback] run complete:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[winback] fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

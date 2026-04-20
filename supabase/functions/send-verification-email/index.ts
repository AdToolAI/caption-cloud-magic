import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  type EmailLanguage,
  getSubject,
  renderVerificationEmail,
} from "./templates.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_SECONDS = 60;

interface SendVerificationRequest {
  email: string;
  userId: string;
  language?: string;
  appUrl?: string;
}

const ALLOWED_ORIGINS = new Set<string>([
  "https://useadtool.ai",
  "https://www.useadtool.ai",
  "https://captiongenie.app",
  "https://www.captiongenie.app",
  "https://caption-cloud-magic.lovable.app",
]);

const DEFAULT_APP_URL = "https://useadtool.ai";

function resolveAppUrl(candidate?: string | null): string {
  if (!candidate) return DEFAULT_APP_URL;
  try {
    const u = new URL(candidate);
    const origin = `${u.protocol}//${u.host}`;
    if (ALLOWED_ORIGINS.has(origin)) return origin;
    // Allow lovable.app preview subdomains
    if (u.host.endsWith(".lovable.app")) return origin;
    return DEFAULT_APP_URL;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function normalizeLanguage(lang?: string | null): EmailLanguage {
  const l = (lang || "").toLowerCase().slice(0, 2);
  if (l === "de" || l === "en" || l === "es") return l;
  return "de";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, userId, language: bodyLang, appUrl: bodyAppUrl }: SendVerificationRequest = await req.json();

    if (!email || !userId) {
      return new Response(
        JSON.stringify({ error: "Email and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-verification-email] Sending verification to: ${email}`);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validate user
    const { data: userLookup, error: userLookupError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userLookupError || !userLookup?.user) {
      console.error("[send-verification-email] User not found:", userLookupError);
      return new Response(
        JSON.stringify({ error: "Invalid user" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (userLookup.user.email?.toLowerCase() !== email.toLowerCase()) {
      console.error("[send-verification-email] Email mismatch for user", userId);
      return new Response(
        JSON.stringify({ error: "Email does not match user" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (userLookup.user.email_confirmed_at) {
      console.log("[send-verification-email] Email already confirmed");
      return new Response(
        JSON.stringify({ success: true, alreadyVerified: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine language: explicit body > profiles.language > 'de'
    let language: EmailLanguage = normalizeLanguage(bodyLang);
    if (!bodyLang) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("language")
        .eq("id", userId)
        .maybeSingle();
      language = normalizeLanguage(profile?.language);
    }

    // Backend cooldown: reject if a token was created less than COOLDOWN_SECONDS ago
    const { data: existingToken } = await supabaseAdmin
      .from("email_verification_tokens")
      .select("created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingToken?.created_at) {
      const ageSeconds = (Date.now() - new Date(existingToken.created_at).getTime()) / 1000;
      if (ageSeconds < COOLDOWN_SECONDS) {
        const retryAfter = Math.ceil(COOLDOWN_SECONDS - ageSeconds);
        console.log(`[send-verification-email] Cooldown active, retry in ${retryAfter}s`);
        return new Response(
          JSON.stringify({
            error: "Please wait before requesting another verification email",
            retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
              ...corsHeaders,
            },
          }
        );
      }
    }

    // Generate token
    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { error: tokenError } = await supabaseAdmin
      .from("email_verification_tokens")
      .upsert({
        user_id: userId,
        token: verificationToken,
        email: email,
        expires_at: expiresAt.toISOString(),
        verified_at: null,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (tokenError) {
      console.error("[send-verification-email] Token storage error:", tokenError);
      throw new Error("Failed to store verification token");
    }

    // Prefer client-supplied origin (validated against allow-list), then env, then default.
    const envAppUrl = Deno.env.get("APP_URL") || Deno.env.get("APP_BASE_URL");
    const appUrl = resolveAppUrl(bodyAppUrl) || resolveAppUrl(envAppUrl) || DEFAULT_APP_URL;
    const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;
    console.log(`[send-verification-email] Using appUrl=${appUrl} (bodyAppUrl=${bodyAppUrl ?? "n/a"})`);

    const html = renderVerificationEmail(language, verificationUrl, email);
    const subject = getSubject(language);

    const { data, error } = await resend.emails.send({
      from: "AdTool AI <support@useadtool.ai>",
      to: [email],
      subject,
      html,
    });

    if (error) {
      console.error("[send-verification-email] Resend error:", error);
      throw new Error(error.message);
    }

    console.log(`[send-verification-email] Email sent (lang=${language}): ${data?.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: data?.id, language }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[send-verification-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { VerificationEmail } from "./_templates/VerificationEmail.tsx";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendVerificationRequest {
  email: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, userId }: SendVerificationRequest = await req.json();

    if (!email || !userId) {
      return new Response(
        JSON.stringify({ error: "Email and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-verification-email] Sending verification to: ${email}`);

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Generate a verification token (simple approach: use a signed JWT or random token)
    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store the verification token in database
    const { error: tokenError } = await supabaseAdmin
      .from("email_verification_tokens")
      .upsert({
        user_id: userId,
        token: verificationToken,
        email: email,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (tokenError) {
      console.error("[send-verification-email] Token storage error:", tokenError);
      throw new Error("Failed to store verification token");
    }

    // Build verification URL
    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("APP_BASE_URL") || "https://useadtool.ai";
    const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    // Render the email template
    const html = await renderAsync(
      React.createElement(VerificationEmail, {
        verificationUrl,
        userEmail: email,
      })
    );

    // Send the email via Resend
    const { data, error } = await resend.emails.send({
      from: "AdTool <support@useadtool.ai>",
      to: [email],
      subject: "Bestätige deine E-Mail-Adresse | AdTool",
      html,
    });

    if (error) {
      console.error("[send-verification-email] Resend error:", error);
      throw new Error(error.message);
    }

    console.log(`[send-verification-email] Email sent successfully: ${data?.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: data?.id }),
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

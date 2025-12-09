import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verification Email HTML Template
const generateVerificationHtml = (verificationUrl: string, userEmail: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bestätige deine E-Mail-Adresse - AdTool</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width: 560px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #F5C76A 0%, #d4a853 100%); border-radius: 12px;">
                <span style="font-size: 24px; font-weight: bold; color: #0a0a0f;">AdTool</span>
              </div>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color: #1a1a2e; border-radius: 16px; padding: 40px 32px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="color: #F5C76A; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px 0;">Willkommen bei AdTool! 🎉</h1>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hallo,</p>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                Vielen Dank für deine Registrierung bei AdTool! Um dein Konto zu aktivieren und alle Premium-Features nutzen zu können, bestätige bitte deine E-Mail-Adresse.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${verificationUrl}" style="display: inline-block; background-color: #F5C76A; border-radius: 8px; color: #0a0a0f; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 32px;">
                  E-Mail bestätigen
                </a>
              </div>
              <p style="color: #888888; font-size: 14px; text-align: center; margin: 24px 0 8px 0;">
                Oder kopiere diesen Link in deinen Browser:
              </p>
              <p style="color: #22d3ee; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 16px 0;">
                ${verificationUrl}
              </p>
              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">
              <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
                Diese E-Mail wurde an <strong>${userEmail}</strong> gesendet. Falls du dich nicht bei AdTool registriert hast, kannst du diese E-Mail ignorieren.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 32px;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 8px 0;">© 2024 AdTool. Alle Rechte vorbehalten.</p>
              <p style="color: #666666; font-size: 12px; margin: 0;">
                <a href="https://useadtool.ai" style="color: #888888; text-decoration: underline;">Website</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/support" style="color: #888888; text-decoration: underline;">Support</a>
                &nbsp;•&nbsp;
                <a href="https://useadtool.ai/privacy" style="color: #888888; text-decoration: underline;">Datenschutz</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

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

    // Generate a verification token
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

    // Generate the email HTML
    const html = generateVerificationHtml(verificationUrl, email);

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

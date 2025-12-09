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

// Password Reset Email HTML Template
const generatePasswordResetHtml = (resetUrl: string, userEmail: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Passwort zurücksetzen - AdTool</title>
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
              <h1 style="color: #F5C76A; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px 0;">Passwort zurücksetzen 🔐</h1>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hallo,</p>
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                Du hast angefordert, dein Passwort für dein AdTool-Konto zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu erstellen.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #F5C76A; border-radius: 8px; color: #0a0a0f; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 32px;">
                  Passwort zurücksetzen
                </a>
              </div>
              <p style="color: #888888; font-size: 14px; text-align: center; margin: 24px 0 8px 0;">
                Oder kopiere diesen Link in deinen Browser:
              </p>
              <p style="color: #22d3ee; font-size: 12px; word-break: break-all; text-align: center; margin: 0 0 16px 0;">
                ${resetUrl}
              </p>
              <div style="background-color: rgba(107, 15, 26, 0.2); border-radius: 8px; padding: 16px; border: 1px solid rgba(107, 15, 26, 0.4); margin: 16px 0;">
                <p style="color: #f87171; font-size: 14px; margin: 0; text-align: center;">
                  ⚠️ Dieser Link ist nur 1 Stunde gültig. Falls du keine Passwort-Zurücksetzung angefordert hast, ignoriere diese E-Mail.
                </p>
              </div>
              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;">
              <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 16px 0 0 0;">
                Diese E-Mail wurde an ${userEmail} gesendet. Dein Passwort wird nicht geändert, bis du auf den Link klickst und ein neues Passwort erstellst.
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

interface SendPasswordResetRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: SendPasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[send-password-reset-email] Processing reset for: ${email}`);

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user exists
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);

    if (!user) {
      // Don't reveal if user exists or not for security
      console.log(`[send-password-reset-email] User not found, returning success anyway`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate password reset link using Supabase admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${Deno.env.get("APP_URL") || Deno.env.get("APP_BASE_URL") || "https://useadtool.ai"}/reset-password`
      }
    });

    if (linkError) {
      console.error("[send-password-reset-email] Link generation error:", linkError);
      throw new Error("Failed to generate reset link");
    }

    const resetUrl = linkData.properties?.action_link;

    if (!resetUrl) {
      console.error("[send-password-reset-email] No reset URL generated");
      throw new Error("Failed to generate reset URL");
    }

    console.log(`[send-password-reset-email] Reset URL generated`);

    // Generate the email HTML
    const html = generatePasswordResetHtml(resetUrl, email);

    // Send the email via Resend
    const { data, error } = await resend.emails.send({
      from: "AdTool <support@useadtool.ai>",
      to: [email],
      subject: "Passwort zurücksetzen | AdTool",
      html,
    });

    if (error) {
      console.error("[send-password-reset-email] Resend error:", error);
      throw new Error(error.message);
    }

    console.log(`[send-password-reset-email] Email sent successfully: ${data?.id}`);

    return new Response(
      JSON.stringify({ success: true, messageId: data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[send-password-reset-email] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

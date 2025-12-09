import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "npm:resend@2.0.0";
import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
  Button,
  Section,
  Hr,
} from 'npm:@react-email/components@0.0.22';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Password Reset Email Template
const PasswordResetEmail = ({ resetUrl, userEmail }: { resetUrl: string; userEmail: string }) => (
  React.createElement(Html, null,
    React.createElement(Head, null),
    React.createElement(Preview, null, "Setze dein AdTool-Passwort zurück"),
    React.createElement(Body, { style: { backgroundColor: '#0a0a0f', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' } },
      React.createElement(Container, { style: { margin: '0 auto', padding: '40px 20px', maxWidth: '560px' } },
        // Header
        React.createElement(Section, { style: { textAlign: 'center', marginBottom: '32px' } },
          React.createElement('div', { style: { display: 'inline-block', padding: '12px 24px', background: 'linear-gradient(135deg, #F5C76A 0%, #d4a853 100%)', borderRadius: '12px' } },
            React.createElement(Text, { style: { fontSize: '24px', fontWeight: 'bold', color: '#0a0a0f', margin: '0' } }, "AdTool")
          )
        ),
        // Content
        React.createElement(Section, { style: { backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '40px 32px', border: '1px solid rgba(255, 255, 255, 0.1)' } },
          React.createElement(Heading, { style: { color: '#F5C76A', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 24px 0' } }, "Passwort zurücksetzen 🔐"),
          React.createElement(Text, { style: { color: '#e0e0e0', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px 0' } }, "Hallo,"),
          React.createElement(Text, { style: { color: '#e0e0e0', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px 0' } }, 
            "Du hast angefordert, dein Passwort für dein AdTool-Konto zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort zu erstellen."
          ),
          React.createElement(Section, { style: { textAlign: 'center', margin: '32px 0' } },
            React.createElement(Button, { 
              href: resetUrl,
              style: { backgroundColor: '#F5C76A', borderRadius: '8px', color: '#0a0a0f', fontSize: '16px', fontWeight: 'bold', textDecoration: 'none', padding: '14px 32px' }
            }, "Passwort zurücksetzen")
          ),
          React.createElement(Text, { style: { color: '#888888', fontSize: '14px', textAlign: 'center', margin: '24px 0 8px 0' } }, 
            "Oder kopiere diesen Link in deinen Browser:"
          ),
          React.createElement(Text, { style: { color: '#22d3ee', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center', margin: '0 0 16px 0' } }, resetUrl),
          React.createElement(Section, { style: { backgroundColor: 'rgba(107, 15, 26, 0.2)', borderRadius: '8px', padding: '16px', border: '1px solid rgba(107, 15, 26, 0.4)', margin: '16px 0' } },
            React.createElement(Text, { style: { color: '#f87171', fontSize: '14px', margin: '0', textAlign: 'center' } }, 
              "⚠️ Dieser Link ist nur 1 Stunde gültig. Falls du keine Passwort-Zurücksetzung angefordert hast, ignoriere diese E-Mail."
            )
          ),
          React.createElement(Hr, { style: { borderColor: 'rgba(255, 255, 255, 0.1)', margin: '24px 0' } }),
          React.createElement(Text, { style: { color: '#666666', fontSize: '13px', lineHeight: '1.5', margin: '16px 0 0 0' } }, 
            `Diese E-Mail wurde an ${userEmail} gesendet. Dein Passwort wird nicht geändert, bis du auf den Link klickst und ein neues Passwort erstellst.`
          )
        ),
        // Footer
        React.createElement(Section, { style: { textAlign: 'center', marginTop: '32px' } },
          React.createElement(Text, { style: { color: '#666666', fontSize: '12px', margin: '0 0 8px 0' } }, "© 2024 AdTool. Alle Rechte vorbehalten."),
          React.createElement(Text, { style: { color: '#666666', fontSize: '12px', margin: '0' } },
            React.createElement(Link, { href: "https://useadtool.ai", style: { color: '#888888', textDecoration: 'underline' } }, "Website"),
            " • ",
            React.createElement(Link, { href: "https://useadtool.ai/support", style: { color: '#888888', textDecoration: 'underline' } }, "Support"),
            " • ",
            React.createElement(Link, { href: "https://useadtool.ai/privacy", style: { color: '#888888', textDecoration: 'underline' } }, "Datenschutz")
          )
        )
      )
    )
  )
);

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

    // Render the email template
    const html = await renderAsync(
      React.createElement(PasswordResetEmail, {
        resetUrl,
        userEmail: email,
      })
    );

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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ExpiringToken {
  user_id: string;
  email: string;
  platform: string;
  account_name: string | null;
  expires_at: string;
  days_until_expiry: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("[Token Expiry Notifier] Starting daily check...");

    // Find tokens expiring within 7 days or already expired
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: expiringTokens, error: tokensError } = await supabaseAdmin
      .from("social_connections")
      .select(`
        user_id,
        platform,
        account_name,
        token_expires_at
      `)
      .lt("token_expires_at", sevenDaysFromNow.toISOString())
      .not("token_expires_at", "is", null);

    if (tokensError) {
      console.error("[Token Expiry Notifier] Error fetching tokens:", tokensError);
      throw tokensError;
    }

    console.log(`[Token Expiry Notifier] Found ${expiringTokens?.length || 0} expiring tokens`);

    if (!expiringTokens || expiringTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No expiring tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs
    const userIds = [...new Set(expiringTokens.map(t => t.user_id))];

    // Fetch user emails
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      console.error("[Token Expiry Notifier] Error fetching users:", usersError);
      throw usersError;
    }

    const userEmailMap = new Map(users.users.map(u => [u.id, u.email]));

    // Group tokens by user
    const tokensByUser = new Map<string, ExpiringToken[]>();
    
    for (const token of expiringTokens) {
      const email = userEmailMap.get(token.user_id);
      if (!email) continue;

      const expiresAt = new Date(token.token_expires_at);
      const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      const tokenInfo: ExpiringToken = {
        user_id: token.user_id,
        email,
        platform: token.platform,
        account_name: token.account_name,
        expires_at: token.token_expires_at,
        days_until_expiry: daysUntilExpiry
      };

      if (!tokensByUser.has(token.user_id)) {
        tokensByUser.set(token.user_id, []);
      }
      tokensByUser.get(token.user_id)!.push(tokenInfo);
    }

    // Send emails
    const emailsSent: string[] = [];
    const emailsFailed: string[] = [];

    for (const [userId, tokens] of tokensByUser) {
      const email = userEmailMap.get(userId);
      if (!email) continue;

      // Only send email for tokens expiring today, in 3 days, or in 7 days
      const criticalTokens = tokens.filter(t => 
        t.days_until_expiry <= 0 || // Expired
        t.days_until_expiry === 1 || // Expires tomorrow
        t.days_until_expiry === 3 || // Expires in 3 days
        t.days_until_expiry === 7    // Expires in 7 days
      );

      if (criticalTokens.length === 0) continue;

      const platformLabels: Record<string, string> = {
        instagram: "Instagram",
        youtube: "YouTube",
        tiktok: "TikTok",
        linkedin: "LinkedIn",
        x: "X (Twitter)",
        facebook: "Facebook"
      };

      const tokenList = criticalTokens.map(t => {
        const platformName = platformLabels[t.platform] || t.platform;
        const accountInfo = t.account_name ? ` (${t.account_name})` : "";
        
        if (t.days_until_expiry <= 0) {
          return `🔴 ${platformName}${accountInfo} - <strong>Bereits abgelaufen!</strong>`;
        } else if (t.days_until_expiry === 1) {
          return `🟠 ${platformName}${accountInfo} - <strong>Läuft morgen ab!</strong>`;
        } else {
          return `🟡 ${platformName}${accountInfo} - Läuft in ${t.days_until_expiry} Tagen ab`;
        }
      }).join("<br/>");

      const hasExpired = criticalTokens.some(t => t.days_until_expiry <= 0);
      const subject = hasExpired 
        ? "🚨 Dein Social Media Token ist abgelaufen - AdTool"
        : `⚠️ Social Media Token läuft bald ab - AdTool`;

      try {
        const emailResponse = await resend.emails.send({
          from: "AdTool <support@useadtool.ai>",
          to: [email],
          subject,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #050816; color: #ffffff; margin: 0; padding: 0;">
              <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 40px;">
                  <h1 style="font-size: 28px; margin: 0; background: linear-gradient(135deg, #F5C76A, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    AdTool
                  </h1>
                </div>
                
                <!-- Content Card -->
                <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; backdrop-filter: blur(10px);">
                  <h2 style="color: #F5C76A; margin: 0 0 16px 0; font-size: 22px;">
                    ${hasExpired ? '🚨 Token abgelaufen!' : '⚠️ Token läuft bald ab'}
                  </h2>
                  
                  <p style="color: #a0aec0; line-height: 1.6; margin: 0 0 24px 0;">
                    ${hasExpired 
                      ? 'Einer oder mehrere deiner Social Media Tokens sind abgelaufen. Bitte verbinde die betroffenen Accounts erneut, um weiterhin automatisch posten zu können.'
                      : 'Einer oder mehrere deiner Social Media Tokens laufen bald ab. Erneuere die Verbindung rechtzeitig, um Unterbrechungen zu vermeiden.'}
                  </p>
                  
                  <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <p style="color: #ffffff; margin: 0; line-height: 1.8;">
                      ${tokenList}
                    </p>
                  </div>
                  
                  <a href="https://8e97f8e1-59d6-4796-9a44-4c05ca0bfc66.lovableproject.com/settings/social-media" 
                     style="display: inline-block; background: linear-gradient(135deg, #F5C76A, #d4a84a); color: #050816; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Verbindungen erneuern →
                  </a>
                </div>
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 40px; color: #6b7280; font-size: 12px;">
                  <p style="margin: 0 0 8px 0;">Diese Email wurde automatisch von AdTool gesendet.</p>
                  <p style="margin: 0;">© ${new Date().getFullYear()} AdTool. Alle Rechte vorbehalten.</p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        console.log(`[Token Expiry Notifier] Email sent to ${email}:`, emailResponse);
        emailsSent.push(email);
      } catch (emailError) {
        console.error(`[Token Expiry Notifier] Failed to send email to ${email}:`, emailError);
        emailsFailed.push(email);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expiringTokens: expiringTokens.length,
        emailsSent: emailsSent.length,
        emailsFailed: emailsFailed.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[Token Expiry Notifier] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

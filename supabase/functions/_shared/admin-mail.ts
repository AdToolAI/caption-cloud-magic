// Shared admin mailer — routes through the Lovable email queue (notify.useadtool.ai).
// Resend cannot be used for this domain: the subdomain is NS-delegated to Lovable.
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const SITE_NAME = "AdTool AI";
const SENDER_DOMAIN = "notify.useadtool.ai";
const FROM_DOMAIN = "useadtool.ai";

export async function sendAdminEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  label: string;
}): Promise<{ ok: boolean; error?: string }> {
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const messageId = `${opts.label}-${crypto.randomUUID()}`;

  // Every app email needs an unsubscribe token bound to the recipient.
  let unsubscribeToken: string | null = null;
  const { data: existing } = await svc
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", opts.to)
    .maybeSingle();
  if (existing?.token) {
    unsubscribeToken = existing.token;
  } else {
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: tokenError } = await svc
      .from("email_unsubscribe_tokens")
      .insert({ token, email: opts.to });
    if (tokenError) console.error("[ADMIN-MAIL] token insert:", tokenError.message);
    unsubscribeToken = token;
  }

  const { error } = await svc.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: opts.to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.subject,
      purpose: "transactional",
      idempotency_key: messageId,
      unsubscribe_token: unsubscribeToken,
      label: opts.label,


      queued_at: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("[ADMIN-MAIL] enqueue failed:", error.message);
    await svc.from("email_send_log").insert({
      message_id: messageId,
      template_name: opts.label,
      recipient_email: opts.to,
      status: "failed",
      error_message: error.message,
    });
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

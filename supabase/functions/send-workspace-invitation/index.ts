import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "AdTool AI";
const SENDER_DOMAIN = "notify.useadtool.ai";
const FROM_DOMAIN = "useadtool.ai";
const APP_ORIGIN = "https://useadtool.ai";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await anon.auth.getUser();
    if (userErr || !userRes.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || "");
    const email = String(body.email || "").trim().toLowerCase();
    const role = ["viewer", "editor", "admin"].includes(body.role) ? body.role : "viewer";

    if (!workspaceId || !email) {
      return json({ error: "workspaceId and email are required" }, 400);
    }

    // Authorize: caller must be owner/admin of the workspace
    const { data: membership } = await svc
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(String(membership.role))) {
      return json({ error: "Forbidden — owner or admin only" }, 403);
    }

    const { data: ws } = await svc
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();

    // Upsert invitation
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data: invite, error: invErr } = await svc
      .from("workspace_invitations")
      .insert({
        workspace_id: workspaceId,
        email,
        role,
        invited_by: user.id,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (invErr) return json({ error: invErr.message }, 400);

    const acceptUrl = `${APP_ORIGIN}/accept-invitation?token=${invite.id}`;
    const workspaceName = ws?.name || "Workspace";

    const subject = `Einladung: ${workspaceName} auf ${SITE_NAME}`;
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0b0b12;color:#f5f5f5;border-radius:12px">
        <h1 style="font-family:'Playfair Display',serif;color:#F5C76A;margin:0 0 12px">Du bist eingeladen</h1>
        <p>Du wurdest als <strong>${role}</strong> in den Workspace <strong>${workspaceName}</strong> auf ${SITE_NAME} eingeladen.</p>
        <p style="margin:24px 0">
          <a href="${acceptUrl}" style="background:#F5C76A;color:#0b0b12;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Einladung annehmen</a>
        </p>
        <p style="color:#9a9aa8;font-size:12px">Der Link ist 7 Tage gültig. Oder öffne: ${acceptUrl}</p>
      </div>`;
    const text = `Du wurdest als ${role} in den Workspace "${workspaceName}" auf ${SITE_NAME} eingeladen.\n\nEinladung annehmen: ${acceptUrl}\n\nDer Link ist 7 Tage gültig.`;

    // Enqueue email
    const messageId = crypto.randomUUID();
    await svc.from("email_send_log").insert({
      message_id: messageId,
      template_name: "workspace_invitation",
      recipient_email: email,
      status: "pending",
    });

    const { error: enqErr } = await svc.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "workspace_invitation",
        queued_at: new Date().toISOString(),
      },
    });
    if (enqErr) {
      console.error("enqueue failed", enqErr);
      await svc.from("email_send_log").insert({
        message_id: messageId,
        template_name: "workspace_invitation",
        recipient_email: email,
        status: "failed",
        error_message: enqErr.message,
      });
      // Still succeed the invite row — email is best-effort
    }

    return json({ ok: true, invitation_id: invite.id, accept_url: acceptUrl });
  } catch (err) {
    console.error("send-workspace-invitation error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
